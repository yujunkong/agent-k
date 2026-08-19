/**
 * Host-side approved plan execution — SubagentHost + main AgentLoop tasks.
 *
 * Webview owns PlanSession snapshots; this module runs the DAG and posts
 * plan.execution.* events so the webview can persist executionPlan state.
 */
import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { configManager } from '../core/ConfigManager';
import { RuntimeServices } from '../core/RuntimeServices';
import { sessionUsageTracker, updateUsageStatusBar } from './runtimeSingletons';
import {
  createSubagentHost,
  modeForSubagentRole
} from './subagentHost';
import { registerSubagentWorktree } from './subagentWorktreeRegistry';
import { getWorkspaceRoot } from '../tools/writeExecutors';
import {
  runPlanExecution,
  type ExecutionPlan,
  type ExecutionPlanTask,
  type PlanExecutionHooks
} from '../plan/execution';
import { buildMainPlanTaskPrompt } from '../plan/execution/planTaskPrompt';
import {
  executionIssueToTaskError,
  validateExecutionPlanContext
} from '../plan/execution/validateExecutionContext';
import { diagnosticToWorkEvent } from '../plan/execution/diagnosticToWorkEvent';
import {
  formatDiagnosticEventLog,
  type AnyPlanDiagnosticEvent
} from '../plan/execution/executionDiagnostics';
import { toObservedToolCall } from '../plan/v2/toObservedToolCall';

export type PlanExecuteHostMessage = {
  requestId: string;
  parentTurnId: string;
  executionPlan: ExecutionPlan;
  repoRoot?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high' | 'max';
};

export type PlanExecuteHostContext = {
  webview: vscode.Webview | undefined;
};

export async function runHostPlanExecute(
  ctx: PlanExecuteHostContext,
  message: PlanExecuteHostMessage
): Promise<void> {
  const webview = ctx.webview;
  if (!webview) return;

  const requestId = String(message.requestId);
  const post = (type: string, extra: Record<string, unknown> = {}) => {
    void webview.postMessage({ type, requestId, ...extra });
  };

  try {
    const runtime = await resolvePlanExecuteRuntime(message);
    const actualRepoRoot = getWorkspaceRoot();
    const expectedRepoRoot =
      message.repoRoot ?? message.executionPlan.repoRoot ?? actualRepoRoot ?? undefined;
    const repoRoot = expectedRepoRoot ?? actualRepoRoot ?? undefined;

    if (repoRoot) {
      try {
        execSync('git rev-parse --is-inside-work-tree', {
          cwd: repoRoot,
          stdio: 'pipe',
          timeout: 5000
        });
      } catch {
        post('plan.execution.error', {
          error: `워크스페이스 "${repoRoot}"가 git 저장소가 아닙니다. Plan 실행 전에 git init + 최초 커밋이 필요합니다.`
        });
        return;
      }
    }

    const contextIssue = validateExecutionPlanContext(
      { ...message.executionPlan, repoRoot: expectedRepoRoot },
      actualRepoRoot ?? undefined
    );
    if (contextIssue) {
      post('plan.execution.error', { error: executionIssueToTaskError(contextIssue) });
      return;
    }

    const toolArgsByCallId = new Map<string, Record<string, unknown>>();

    const postToolEvidence = (name: string, args: Record<string, unknown>, success: boolean) => {
      post('plan.toolEvidence', {
        name,
        args,
        success
      });
    };

    const subagentHost = createSubagentHost({
      systemPrompt: runtime.systemPrompt,
      repoRoot: repoRoot ?? undefined,
      createLoop: (context, hooks) => {
        const cwd = context.worktree?.path;
        if (!cwd) {
          throw new Error('Subagent refused: isolated worktree path is required');
        }
        const childMode = modeForSubagentRole(context.task.role);
        return new runtime.AgentLoopController({
          mode: childMode,
          maxTurns: runtime.maxTurns,
          turnTimeoutMs: runtime.turnTimeoutMs,
          modelId: runtime.model,
          tier: 'A',
          contextBudget: runtime.modelContext.maxInputTokens,
          systemPrompt: runtime.modeRegistry.getSystemPrompt(childMode),
          provider: runtime.provider,
          thinkingEffort: runtime.thinkingEffort,
          workspaceRoot: cwd,
          onAssistantDelta: hooks.onAssistantDelta,
          onReasoning: hooks.onReasoning,
          onToolCall: async (name, args, callId) => {
            toolArgsByCallId.set(callId || name, (args as Record<string, unknown>) || {});
            await hooks.onToolCall?.(name, args, callId);
          },
          onToolResult: async (name, result, callId) => {
            const output =
              result && typeof result === 'object'
                ? (result as { success?: boolean; data?: unknown; error?: string })
                : {};
            const args = toolArgsByCallId.get(callId || name) || {};
            toolArgsByCallId.delete(callId || name);
            postToolEvidence(name, args, output.success !== false);
            await hooks.onToolResult?.(name, result, callId);
          },
          onAskQuestion: (q) => {
            post('ask_question', {
              qid: q.id,
              question: q.question,
              options: q.options,
              required: q.required,
              allowMultiple: Boolean(q.allowMultiple)
            });
          },
          onUsage: (usage) => {
            try {
              const tracker =
                RuntimeServices.getSessionUsageTracker() || sessionUsageTracker;
              tracker.recordUsage(
                usage.promptTokens || 0,
                usage.completionTokens || 0
              );
              updateUsageStatusBar();
            } catch {
              /* best-effort */
            }
          },
          runSubagent: async () => ({
            success: false,
            error: 'Nested subagents are not allowed during plan execution'
          })
        });
      },
      buildMessages: (context) => [
        {
          role: 'system',
          content: runtime.modeRegistry.getSystemPrompt(
            modeForSubagentRole(context.task.role)
          )
        },
        { role: 'user', content: context.task.prompt }
      ],
      onLifecycle: (event) => {
        const task = event.task;
        post('subagent.event', {
          type: event.type,
          taskId: task.id,
          parentTurnId: task.parentTurnId,
          role: task.role,
          status: task.status,
          prompt: task.prompt.slice(0, 80),
          worktreePath: task.worktree?.path,
          worktreeBranch: task.worktree?.branch
        });
        if (
          (event.type === 'subagent.completed' ||
            event.type === 'subagent.failed' ||
            event.type === 'subagent.cancelled') &&
          task.worktree &&
          repoRoot
        ) {
          registerSubagentWorktree(task.id, repoRoot, task.worktree);
        }
      }
    });

    const hooks: PlanExecutionHooks = {
      onTaskStarted: (plan, task) => {
        post('plan.execution.updated', {
          executionPlan: plan,
          taskId: task.id,
          taskEvent: 'started'
        });
      },
      onTaskCompleted: (plan, task) => {
        post('plan.execution.updated', {
          executionPlan: plan,
          taskId: task.id,
          taskEvent: 'completed'
        });
      },
      onTaskFailed: (plan, task, error) => {
        post('plan.execution.updated', {
          executionPlan: plan,
          taskId: task.id,
          taskEvent: 'failed',
          error
        });
      },
      onTaskPreflight: (report) => {
        post('plan.execution.preflight', {
          taskId: report.taskId,
          execution: report.execution,
          repoRoot: report.repoRoot,
          worktreePath: report.worktreePath,
          effectiveRoot: report.effectiveRoot,
          blocked: report.blocked,
          entries: report.entries
        });
      },
      onDiagnostic: (event: AnyPlanDiagnosticEvent) => {
        post('plan.execution.diagnostic', { event });
        const workEvent = diagnosticToWorkEvent(event);
        if (workEvent) {
          post('plan.execution.workEvent', { workEvent });
        }
        try {
          console.log(`[plan-exec] ${formatDiagnosticEventLog(event)}`);
        } catch { /* best-effort */ }
      }
    };

    post('plan.execution.started', { executionPlan: message.executionPlan });

    const finalPlan = await runPlanExecution(message.executionPlan, {
      parentTurnId: message.parentTurnId,
      subagentHost,
      repoRoot: repoRoot ?? undefined,
      registerWorktree: registerSubagentWorktree,
      runMainTask: async ({ plan, task }) =>
        runMainPlanTaskOnHost({
          plan,
          task,
          runtime,
          postToolEvidence
        }),
      hooks
    });

    post('plan.execution.complete', { executionPlan: finalPlan });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    post('plan.execution.error', { error });
  }
}

async function runMainPlanTaskOnHost(input: {
  plan: ExecutionPlan;
  task: ExecutionPlanTask;
  runtime: ResolvedPlanExecuteRuntime;
  postToolEvidence: (name: string, args: Record<string, unknown>, success: boolean) => void;
}): Promise<{ success: boolean; error?: string }> {
  const repoRoot = getWorkspaceRoot();
  if (!repoRoot) {
    return { success: false, error: 'Plan main task requires an open workspace folder.' };
  }

  const toolArgsByCallId = new Map<string, Record<string, unknown>>();
  const loop = new input.runtime.AgentLoopController({
    mode: 'agent',
    maxTurns: input.runtime.maxTurns,
    turnTimeoutMs: input.runtime.turnTimeoutMs,
    modelId: input.runtime.model,
    tier: 'A',
    contextBudget: input.runtime.modelContext.maxInputTokens,
    systemPrompt: input.runtime.systemPrompt,
    provider: input.runtime.provider,
    thinkingEffort: input.runtime.thinkingEffort,
    workspaceRoot: repoRoot,
    onToolCall: async (name, args, callId) => {
      toolArgsByCallId.set(callId || name, (args as Record<string, unknown>) || {});
    },
    onToolResult: async (name, result, callId) => {
      const output =
        result && typeof result === 'object'
          ? (result as { success?: boolean })
          : {};
      const args = toolArgsByCallId.get(callId || name) || {};
      toolArgsByCallId.delete(callId || name);
      input.postToolEvidence(name, args, output.success !== false);
    },
    runSubagent: async () => ({
      success: false,
      error: 'Subagents are dispatched by the plan scheduler, not nested here'
    })
  });

  const prompt = buildMainPlanTaskPrompt(input.plan, input.task);
  try {
    const { runWithWorkspaceRoot } = await import('../tools/writeExecutors');
    await runWithWorkspaceRoot(repoRoot, () => loop.start(prompt));
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

type ResolvedPlanExecuteRuntime = Awaited<ReturnType<typeof resolvePlanExecuteRuntime>>;

async function resolvePlanExecuteRuntime(message: PlanExecuteHostMessage) {
  const cfg = vscode.workspace.getConfiguration('agent-k');
  const baseUrl = String(
    message.baseUrl || cfg.get('provider.baseUrl') || 'http://127.0.0.1:52415'
  ).replace(/\/$/, '');
  const model = String(
    message.model ||
      cfg.get('provider.model') ||
      'mlx-community/Qwen3.6-35B-A3B-4bit'
  );
  const apiKey =
    message.apiKey != null
      ? String(message.apiKey)
      : cfg.get<string>('provider.apiKey') || undefined;
  const providerType = String(cfg.get('provider.type') || 'litellm') as
    | 'litellm'
    | 'openai'
    | 'anthropic'
    | 'ollama'
    | 'lmstudio'
    | 'opencode-zen'
    | 'opencode-go';
  const fallbackBudget = Number(cfg.get('context.budget')) || 100000;

  const { AgentLoopController } = await import('../loop/AgentLoopController');
  const { LiteLLMProvider } = await import('../providers/LiteLLMProvider');
  const { ContextAssembler } = await import('../agent/ContextAssembler');
  const { resolveModelContextInfo } = await import('../providers/modelContextInfo');
  const { toolRegistry } = await import('../tools/registry');
  const { modeRegistry } = await import('../agent/modeRegistry');

  const modelContext = await resolveModelContextInfo({
    providerType,
    baseUrl,
    apiKey,
    model,
    fallbackTokens: fallbackBudget
  });

  const modeConfig = modeRegistry.getModeConfig('agent');
  const configuredTurns = Number(configManager.get('agent-k.maxTurns'));
  const maxTurns =
    Number.isFinite(configuredTurns) && configuredTurns >= 5
      ? Math.min(100, Math.floor(configuredTurns))
      : modeConfig.maxTurns;
  const configuredTimeout = Number(configManager.get('agent-k.turnTimeoutMs'));
  const turnTimeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(0, Math.floor(configuredTimeout))
    : undefined;

  const assembler = new ContextAssembler();
  const assembly = assembler.assemble('agent', [], {
    tier: 'A',
    toolSchemas: toolRegistry.getSchemas('agent', 'A')
  });
  const systemPrompt =
    assembly.slots.find((s) => s.name === 'system')?.content ||
    modeRegistry.getSystemPrompt('agent');

  const provider = new LiteLLMProvider({
    id: 'agent-k-plan-exec',
    name: 'Agent K Plan Execute',
    type: providerType,
    baseUrl,
    apiKey,
    model
  });

  const thinkingEffort =
    message.thinkingEffort ||
    (configManager.get('agent-k.thinking.effort') as
      | 'off'
      | 'low'
      | 'medium'
      | 'high'
      | 'max') ||
    'medium';

  return {
    AgentLoopController,
    provider,
    modelContext,
    maxTurns,
    turnTimeoutMs,
    model,
    systemPrompt,
    modeRegistry,
    thinkingEffort
  };
}

/** Test-only helper — observed tool call shape for plan evidence. */
export function planExecuteObservedToolCall(
  name: string,
  args: Record<string, unknown> | undefined,
  success: boolean
) {
  return toObservedToolCall(name, args, { success });
}
