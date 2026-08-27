/**
 * INT-002 / HOST-008b — Plan execute host bridge → @agent-k/plan + real SubagentHost.
 *
 * Replaces the former stub (force-main + fake create/run) with:
 *   - createWiredSubagentHost (AgentLoop + worktree + subagent.event)
 *   - registerWorktree for EXEC-012
 *   - runMainTask via AgentLoop on repo root (verify / read-only tasks)
 */

import type { RequestId } from '@agent-k/shared';
import {
  AgentLoopController,
  modeRegistry,
  resolveTurnTimeoutMs,
} from '@agent-k/core';
import {
  LiteLLMProvider,
  clampThinkingEffort,
  parseThinkingEffort,
  resolveThinkingCapability,
} from '@agent-k/providers';
import {
  runPlanExecution,
  buildMainPlanTaskPrompt,
  formatApprovedPlanBlock,
  resolveWorkspaceRepoRoot,
  type ExecutionPlan,
  type PlanExecutionDeps,
} from '@agent-k/plan';
import {
  executeTool,
  registerBuiltinTools,
  ToolRegistry,
  type ToolContext,
} from '@agent-k/tools';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { hostLog, hostLogError } from './hostLog';
import { createWiredSubagentHost } from './wiredSubagentHost';
import { registerSubagentWorktree } from './subagentWorktreeRegistry';

export type PlanExecuteHostContext = {
  webview: vscode.Webview | undefined;
};

export type PlanExecuteMessage = {
  requestId: RequestId;
  sessionId?: string;
  parentTurnId?: string;
  executionPlan?: ExecutionPlan;
  document?: unknown;
  taskIds?: string[];
  repoRoot?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  providerType?: string;
  thinkingEffort?: string;
};

function postCardPatch(
  webview: vscode.Webview | undefined,
  payload: Record<string, unknown>,
): void {
  if (!webview) return;
  void webview.postMessage({ type: 'plan.card.patch', ...payload });
}

function workspaceRootFallback(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? process.cwd();
}

/**
 * INT-002 — verify/read-only plan tasks run on the main workspace (no worktree).
 */
async function runMainPlanTask(opts: {
  plan: ExecutionPlan;
  task: ExecutionPlan['tasks'][number];
  repoRoot: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  thinkingEffort?: string;
  signal?: AbortSignal;
}): Promise<{ success: boolean; error?: string }> {
  const { plan, task, repoRoot, baseUrl, apiKey, model } = opts;
  const provider = new LiteLLMProvider({
    id: 'agent-k-plan-main',
    name: 'Agent K Plan Main',
    type: 'litellm',
    baseUrl,
    apiKey,
    model,
  });
  const thinkingCap = resolveThinkingCapability(model);
  const thinkingEffort = clampThinkingEffort(
    parseThinkingEffort(opts.thinkingEffort),
    thinkingCap,
  );
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);
  const modeConfig = modeRegistry.getModeConfig('agent');
  const schemas = registry.getSchemas('agent');
  const toolCtx: ToolContext = {
    workspaceRoot: repoRoot,
    mode: 'agent',
    debugLogs: [],
    readLints: async (paths) => {
      const out: Array<{
        path: string;
        severity: string;
        message: string;
        line?: number;
      }> = [];
      for (const p of paths) {
        const uri = vscode.Uri.file(
          path.isAbsolute(p) ? p : path.join(repoRoot, p),
        );
        for (const d of vscode.languages.getDiagnostics(uri)) {
          const sev =
            d.severity === vscode.DiagnosticSeverity.Error
              ? 'error'
              : d.severity === vscode.DiagnosticSeverity.Warning
                ? 'warning'
                : 'info';
          out.push({
            path: path.relative(repoRoot, uri.fsPath) || p,
            severity: sev,
            message: d.message,
            line: d.range.start.line + 1,
          });
        }
      }
      return out;
    },
  };

  const cfg = vscode.workspace.getConfiguration('agent-k');
  const configuredTimeout = Number(cfg.get('turnTimeoutMs'));
  const isLocalLlm = /127\.0\.0\.1|localhost/i.test(baseUrl);
  let turnTimeoutMs = resolveTurnTimeoutMs(
    Number.isFinite(configuredTimeout) && configuredTimeout >= 0
      ? configuredTimeout
      : undefined,
    undefined,
  );
  if (configuredTimeout !== 0 && isLocalLlm) {
    turnTimeoutMs = Math.max(turnTimeoutMs, 1_800_000);
  }

  const prompt = buildMainPlanTaskPrompt(plan, task);
  // Comment: PLAN-009 — approved plan sticky inject (compact-outside SoT)
  const approvedPlanBlock = formatApprovedPlanBlock(plan, {
    currentTaskId: task.id,
  });
  const loop = new AgentLoopController(
    {
      runModel: async ({ messages, signal, onActivity }) => {
        onActivity?.();
        const providerMessages = messages.map((m) => {
          if (m.role === 'tool') {
            return {
              role: 'tool' as const,
              content: m.content,
              tool_call_id: m.toolCallId,
              name: m.name,
            };
          }
          if (m.role === 'assistant' && m.toolCalls?.length) {
            return {
              role: 'assistant' as const,
              content: m.content || null,
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments ?? {}),
                },
              })),
            };
          }
          return { role: m.role, content: m.content };
        });
        let content = '';
        let reasoning = '';
        const toolAcc = new Map<
          number,
          { id?: string; name?: string; arguments: string }
        >();
        for await (const chunk of provider.streamChat({
          messages: providerMessages,
          model,
          signal,
          tools: schemas,
          thinkingEffort,
        })) {
          onActivity?.();
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.content) content += chunk.content;
          if (chunk.reasoning_content) reasoning += chunk.reasoning_content;
          if (chunk.toolCalls?.length) {
            for (const raw of chunk.toolCalls) {
              if (!raw || typeof raw !== 'object') continue;
              const d = raw as {
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              };
              const idx = typeof d.index === 'number' ? d.index : 0;
              const cur = toolAcc.get(idx) ?? { arguments: '' };
              if (d.id) cur.id = d.id;
              if (d.function?.name) cur.name = (cur.name || '') + d.function.name;
              if (d.function?.arguments) cur.arguments += d.function.arguments;
              toolAcc.set(idx, cur);
            }
          }
        }
        const toolCalls = [...toolAcc.values()]
          .filter((tc) => tc.name)
          .map((tc, i) => {
            let args: Record<string, unknown> = {};
            try {
              args = tc.arguments
                ? (JSON.parse(tc.arguments) as Record<string, unknown>)
                : {};
            } catch {
              args = { raw: tc.arguments };
            }
            return {
              id: tc.id || `plan_main_call_${i}`,
              name: tc.name!,
              arguments: args,
            };
          });
        return {
          content: content || undefined,
          reasoning: reasoning || undefined,
          toolCalls: toolCalls.length ? toolCalls : undefined,
        };
      },
      executeTool: async ({ name, args, signal }) => {
        if (name === 'task' || name === 'task_run') {
          return {
            success: false,
            error: 'Nested subagents are not allowed during plan main tasks',
          };
        }
        return executeTool(registry, name, args, {
          ...toolCtx,
          signal,
        });
      },
      checkPermission: async () => 'allow' as const,
      onEvent: () => {},
    },
    {
      mode: 'agent',
      maxTurns: Math.min(12, modeConfig.maxTurns || 12),
      turnTimeoutMs,
      systemPrompt: modeConfig.systemPrompt,
      // Comment: HARNESS-005 — plan main-task loop also gets project rules
      workspaceRoot: repoRoot || undefined,
      // Comment: PLAN-009 — full approved plan re-injected each turn
      approvedPlanBlock,
    },
  );

  try {
    const result = await loop.run({
      prompt,
      signal: opts.signal,
    });
    if (
      result.status === 'error' ||
      result.reason === 'fatal_error' ||
      result.reason === 'aborted' ||
      result.reason === 'timeout' ||
      result.reason === 'permission_denied'
    ) {
      return {
        success: false,
        error: `Main plan task ended with status ${result.status} (${result.reason})`,
      };
    }
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Run the approved execution DAG with real SubagentHost + main-task AgentLoop.
 */
export async function runHostPlanExecute(
  ctx: PlanExecuteHostContext,
  message: PlanExecuteMessage,
): Promise<void> {
  const requestId = String(message.requestId);
  const sessionId = String(message.sessionId || '').trim() || undefined;
  const plan = message.executionPlan;

  if (!plan || !Array.isArray(plan.tasks)) {
    void ctx.webview?.postMessage({
      type: 'plan.execution.error',
      requestId,
      error: 'plan.execute requires an executionPlan payload.',
    });
    return;
  }

  const cfg = vscode.workspace.getConfiguration('agent-k');
  const baseUrl = String(
    message.baseUrl || cfg.get('provider.baseUrl') || '',
  ).replace(/\/$/, '');
  const model = String(message.model || cfg.get('provider.model') || '');
  if (!baseUrl || !model) {
    void ctx.webview?.postMessage({
      type: 'plan.execution.error',
      requestId,
      error:
        'No provider configured for plan.execute. Open Settings → AI Providers.',
    });
    return;
  }
  const apiKey =
    message.apiKey != null
      ? String(message.apiKey)
      : cfg.get<string>('provider.apiKey') || undefined;

  const folderRoot = workspaceRootFallback();
  const repoRoot =
    String(message.repoRoot || plan.repoRoot || '').trim() ||
    resolveWorkspaceRepoRoot([{ uri: { fsPath: folderRoot } }]) ||
    folderRoot;

  // Comment: INT-002 — keep planner-assigned execution (subagent vs main); do not force main
  const runnable: ExecutionPlan = {
    ...plan,
    repoRoot: plan.repoRoot || repoRoot,
    status:
      plan.status === 'draft' || plan.status === 'reviewing'
        ? 'approved'
        : plan.status,
  };

  const planId = String(runnable.id || 'plan');
  void ctx.webview?.postMessage({
    type: 'plan.execution.started',
    requestId,
    sessionId,
    executionPlan: runnable,
  });

  // Comment: INT-002 — same stream surface as chat.send so SubagentChangesCard / Review works
  const postStream = (event: Record<string, unknown>) => {
    if (!ctx.webview) return;
    void ctx.webview.postMessage({
      type: 'chat.stream',
      payload: { requestId, sessionId, ...event },
    });
  };

  const subagentHost = createWiredSubagentHost({
    postStream,
    parentSessionId: sessionId,
    repoRoot,
    baseUrl,
    apiKey,
    model,
    thinkingEffort: message.thinkingEffort,
    getCurrentTurn: () => 1,
    systemPrompt: modeRegistry.getModeConfig('agent').systemPrompt,
    // Comment: PLAN-009 — per-task approved plan sticky for subagent loops
    getApprovedPlanBlock: (taskId) =>
      formatApprovedPlanBlock(runnable, { currentTaskId: taskId }),
  });

  hostLog(
    'INT-002 plan.execute',
    `start requestId=${requestId} tasks=${runnable.tasks.length} root=${repoRoot}`,
  );

  const deps: PlanExecutionDeps = {
    parentTurnId: String(message.parentTurnId || `plan-${requestId}`),
    // Comment: INT-002 — structural SubagentHostLike; role string union is wider on host
    subagentHost: {
      create: (parentTurnId, prompt, role) =>
        subagentHost.create(parentTurnId, prompt, role as never),
      run: (task) => subagentHost.run(task as never),
    },
    registerWorktree: (subagentId, root, worktree) => {
      // Comment: EXEC-012 PlanSubagentWorktree may omit base — fill from repo root
      registerSubagentWorktree(subagentId, root, {
        path: worktree.path,
        branch: worktree.branch || `agent-k/${subagentId}`,
        base: root,
      });
    },
    runMainTask: async ({ plan: p, task }) => {
      postCardPatch(ctx.webview, {
        sessionId,
        planId,
        phase: 'executing',
        statusText: `Running ${task.title}`,
        taskStatuses: [{ taskId: task.id, status: 'in_progress' }],
      });
      const out = await runMainPlanTask({
        plan: p,
        task,
        repoRoot,
        baseUrl,
        apiKey,
        model,
        thinkingEffort: message.thinkingEffort,
      });
      if (!out.success) {
        hostLogError(
          'INT-002 plan.execute',
          `main task failed id=${task.id} ${out.error || ''}`,
        );
      }
      return out;
    },
    repoRoot,
    hooks: {
      onTaskStarted: (p, task) => {
        void ctx.webview?.postMessage({
          type: 'plan.execution.updated',
          requestId,
          sessionId,
          executionPlan: p,
          taskId: task.id,
          taskEvent: 'started',
        });
      },
      onTaskCompleted: (p, task) => {
        void ctx.webview?.postMessage({
          type: 'plan.execution.updated',
          requestId,
          sessionId,
          executionPlan: p,
          taskId: task.id,
          taskEvent: 'completed',
        });
        postCardPatch(ctx.webview, {
          sessionId,
          planId,
          phase: 'executing',
          taskStatuses: [{ taskId: task.id, status: 'verified' }],
        });
      },
      onTaskFailed: (p, task, error) => {
        void ctx.webview?.postMessage({
          type: 'plan.execution.updated',
          requestId,
          sessionId,
          executionPlan: p,
          taskId: task.id,
          taskEvent: 'failed',
          error,
        });
        postCardPatch(ctx.webview, {
          sessionId,
          planId,
          phase: 'failed',
          taskStatuses: [{ taskId: task.id, status: 'failed' }],
          statusText: error,
        });
      },
    },
  };

  try {
    const finished = await runPlanExecution(runnable, deps);
    void ctx.webview?.postMessage({
      type: 'plan.execution.updated',
      requestId,
      sessionId,
      executionPlan: finished,
      taskEvent: 'plan.completed',
    });
    postCardPatch(ctx.webview, {
      sessionId,
      planId,
      phase: finished.status === 'failed' ? 'failed' : 'completed',
      statusText:
        finished.status === 'failed' ? 'Plan execution failed' : 'Plan completed',
    });
    hostLog(
      'INT-002 plan.execute',
      `done requestId=${requestId} status=${finished.status}`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    hostLogError('INT-002 plan.execute', `error requestId=${requestId}`, error);
    void ctx.webview?.postMessage({
      type: 'plan.execution.error',
      requestId,
      error: msg,
    });
  }
}
