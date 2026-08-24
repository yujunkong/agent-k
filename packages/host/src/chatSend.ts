/**
 * HOST-002 — Chat send bridge.
 * Wires chat.send → AgentLoopController with LiteLLMProvider + builtin tools.
 * Ported from v2.1-PRODUCTION-MODE host/chatSend.ts (Feature-ID transplant, not file copy).
 */

import {
  AgentLoopController,
  modeRegistry,
  resolveTurnTimeoutMs,
  type AgentLoopEvent,
  type AgentMessage,
  type ModelTurnResult,
} from '@agent-k/core';
import {
  LiteLLMProvider,
  clampThinkingEffort,
  parseThinkingEffort,
  resolveThinkingCapability,
} from '@agent-k/providers';
import { PermissionGate } from '@agent-k/safety';
import type {
  AgentMode,
  ChatSendPayload,
  ChatStopPayload,
  RequestId,
} from '@agent-k/shared';
import { subagentSessionId } from '@agent-k/shared';
import {
  executeTool,
  registerBuiltinTools,
  ToolRegistry,
  type ToolContext,
} from '@agent-k/tools';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { hostLog, hostLogError } from './hostLog';
import { isTrueEmptyModelReply } from './chatSendEmpty';
import { shortDetail, toolKind } from './timelineLabels';
import {
  createSubagentHost,
  createSubagentRunStats,
  modeForSubagentRole,
  parentResultFromTask,
  recordSubagentFileChange,
  recordSubagentTool,
  snapshotSubagentResultStats,
  SUBAGENT_MAX_TURNS,
} from './subagentHost';
import { registerSubagentWorktree } from './subagentWorktreeRegistry';

/** In-flight loop runtime keyed by requestId. */
export type HostLoopRuntime = {
  loop: AgentLoopController;
  abort: AbortController;
  /** SUB-006 — abort child subagent runners for this send */
  cancelSubagents?: () => void;
};

export { isTrueEmptyModelReply } from './chatSendEmpty';

/** Context bound by ChatViewProvider for HOST-002 send/stop. */
export type ChatSendContext = {
  webview: vscode.Webview | undefined;
  hostLoops: Map<string, HostLoopRuntime>;
  getHostLoopRequestId: () => string | undefined;
  setHostLoopRequestId: (id: string | undefined) => void;
};

/** Accumulate OpenAI-style streamed tool_call deltas into final tool calls. */
function mergeToolCallDeltas(
  acc: Map<number, { id?: string; name?: string; arguments: string }>,
  deltas: unknown[],
): void {
  for (const raw of deltas) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as {
      index?: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    };
    const idx = typeof d.index === 'number' ? d.index : 0;
    const cur = acc.get(idx) ?? { arguments: '' };
    if (d.id) cur.id = d.id;
    if (d.function?.name) cur.name = (cur.name || '') + d.function.name;
    if (d.function?.arguments) cur.arguments += d.function.arguments;
    acc.set(idx, cur);
  }
}

function workspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? process.cwd();
}

/**
 * Accept chat.send, run AgentLoopController, and stream events to the webview.
 */
export async function runHostChatSend(
  ctx: ChatSendContext,
  payload: ChatSendPayload,
): Promise<void> {
  const webview = ctx.webview;
  if (!webview) {
    hostLogError('chat.send empty reply', 'aborted: webview undefined');
    return;
  }

  const requestId = String(payload.requestId) as RequestId;
  const abort = new AbortController();
  ctx.setHostLoopRequestId(requestId);
  hostLog('chat.send empty reply', `chatSend start requestId=${requestId}`);

  const isActive = () => ctx.hostLoops.has(requestId);
  // Chars posted as delta — logged on complete; also used if complete omits content.
  let streamedChars = 0;
  let reasoningChars = 0;
  // Comment: tool.start count — tools-only turns must not be classified as empty reply.
  let toolEvents = 0;

  const postStream = (event: Record<string, unknown>) => {
    if (!isActive()) return;
    const ev = String(event.event || '');
    if (ev === 'delta' && event.content != null) {
      streamedChars += String(event.content).length;
    }
    if (ev === 'delta' && event.reasoning != null) {
      reasoningChars += String(event.reasoning).length;
    }
    if (ev === 'tool.start') {
      toolEvents += 1;
    }
    if (ev === 'error' || ev === 'complete' || ev === 'stopped') {
      const contentLen =
        event.content != null ? String(event.content).length : streamedChars;
      hostLog(
        'chat.send empty reply',
        `chat.stream → ${ev} requestId=${requestId} contentLen=${contentLen} reasoningLen=${reasoningChars} tools=${toolEvents}${ev === 'error' ? ` ${String(event.error || '')}` : ''}`,
      );
    }
    void webview.postMessage({
      type: 'chat.stream',
      payload: { requestId, ...event },
    });
  };

  /** SUB-010 — child ChatSession stream (never dual-write to parent). */
  const postChildStream = (
    taskId: string,
    event: Record<string, unknown>,
  ) => {
    // Comment: do not stamp subagentId — child transcript is standalone
    postStream({
      ...event,
      sessionId: subagentSessionId(taskId),
    });
  };

  const parentSessionId =
    payload.sessionId != null ? String(payload.sessionId).trim() : undefined;

  const mode = (payload.mode || 'agent') as AgentMode;
  const cfg = vscode.workspace.getConfiguration('agent-k');
  const baseUrl = String(
    payload.baseUrl || cfg.get('provider.baseUrl') || '',
  ).replace(/\/$/, '');
  const model = String(payload.model || cfg.get('provider.model') || '');
  if (!baseUrl || !model) {
    hostLogError(
      'chat.send missing credentials',
      `requestId=${requestId} baseUrl=${baseUrl || '(empty)'} model=${model || '(empty)'}`,
    );
    void webview.postMessage({
      type: 'chat.stream',
      payload: {
        requestId,
        event: 'error',
        error:
          'No provider configured. Open Settings → AI Providers and add a connection.',
      },
    });
    ctx.setHostLoopRequestId(undefined);
    return;
  }
  const apiKey =
    payload.apiKey != null
      ? String(payload.apiKey)
      : cfg.get<string>('provider.apiKey') || undefined;

  // Clamp thinking to what this model supports — unsupported + enable_thinking
  // caused Zen free models to finish with contentLen=0 under parallel load.
  const thinkingCap = resolveThinkingCapability(model);
  const thinkingEffort = clampThinkingEffort(
    parseThinkingEffort(payload.thinkingEffort),
    thinkingCap,
  );

  const modeConfig = modeRegistry.getModeConfig(mode);
  const maxTurns = Math.min(
    100,
    Math.max(5, Number(cfg.get('agent.maxTurns')) || modeConfig.maxTurns),
  );
  // Comment: local LLMs often idle >180s on first token — floor 30m unless user set 0 (disable)
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
  hostLog(
    'chat.send empty reply',
    `timeouts requestId=${requestId} turnTimeoutMs=${turnTimeoutMs} local=${isLocalLlm}`,
  );

  const provider = new LiteLLMProvider({
    id: 'agent-k-chat',
    name: 'Agent K Chat',
    type: 'litellm',
    baseUrl,
    apiKey,
    model,
  });

  const registry = new ToolRegistry();
  registerBuiltinTools(registry);
  const toolSchemas = registry.getSchemas(mode);
  const root = workspaceRoot();
  const toolCtxBase: ToolContext = {
    workspaceRoot: root,
    mode,
    debugLogs: [],
    // Comment: TOOL — wire VS Code diagnostics into read_lints
    readLints: async (paths) => {
      const out: Array<{
        path: string;
        severity: string;
        message: string;
        line?: number;
      }> = [];
      for (const p of paths) {
        const uri = vscode.Uri.file(
          path.isAbsolute(p) ? p : path.join(root, p),
        );
        for (const d of vscode.languages.getDiagnostics(uri)) {
          const sev =
            d.severity === vscode.DiagnosticSeverity.Error
              ? 'error'
              : d.severity === vscode.DiagnosticSeverity.Warning
                ? 'warning'
                : 'info';
          out.push({
            path: path.relative(root, uri.fsPath) || p,
            severity: sev,
            message: d.message,
            line: d.range.start.line + 1,
          });
        }
      }
      return out;
    },
  };

  // Comment: SUB-* — parent turn counter for subagent.event / timeline ids
  let currentTurn = 1;
  const childStats = new Map<
    string,
    ReturnType<typeof createSubagentRunStats>
  >();
  // Comment: SUB — per-segment Thought text (reset on tool wave; never append forever)
  const childReasoning = new Map<string, string>();
  // Comment: SUB-010 — Cursor-style Thought segments: _thinking, _thinking_s1, …
  const childThoughtSeg = new Map<string, number>();
  const childThoughtRotatePending = new Map<string, boolean>();
  const childThinkingId = (taskId: string, seg: number) =>
    seg <= 0
      ? `tl_sub_${taskId}_thinking`
      : `tl_sub_${taskId}_thinking_s${seg}`;
  const systemPrompt = modeConfig.systemPrompt;

  const subagentHost = createSubagentHost({
    systemPrompt,
    repoRoot: root,
    // Comment: SUB-010 — child NL response must land on child session (not parent)
    onDelta: (context, text) => {
      const piece = String(text || '');
      if (!piece) return;
      postChildStream(context.task.id, {
        event: 'delta',
        content: piece,
      });
    },
    onReasoning: (context, text) => {
      const taskId = context.task.id;
      // Comment: after tools, open a NEW Thought id — do not revive sealed top accordion
      if (childThoughtRotatePending.get(taskId)) {
        childThoughtRotatePending.set(taskId, false);
        const nextSeg = (childThoughtSeg.get(taskId) || 0) + 1;
        childThoughtSeg.set(taskId, nextSeg);
        childReasoning.set(taskId, '');
      }
      const seg = childThoughtSeg.get(taskId) || 0;
      const prev = childReasoning.get(taskId) || '';
      const next = prev + String(text || '');
      childReasoning.set(taskId, next);
      postChildStream(taskId, {
        event: 'timeline',
        kind: 'thinking',
        label: 'Thought',
        detail: next.slice(-4000),
        itemStatus: 'running',
        id: childThinkingId(taskId, seg),
        parentTurnId: context.task.parentTurnId,
        turn: currentTurn || 1,
        thoughtRole: seg > 0 ? 'mid' : 'opening',
      });
    },
    onToolCallsBegin: (context) => {
      const taskId = context.task.id;
      const seg = childThoughtSeg.get(taskId) || 0;
      const detail = childReasoning.get(taskId)?.slice(-4000);
      postChildStream(taskId, {
        event: 'timeline',
        kind: 'thinking',
        label: 'Thought',
        detail,
        itemStatus: 'done',
        id: childThinkingId(taskId, seg),
        parentTurnId: context.task.parentTurnId,
        turn: currentTurn || 1,
        thoughtRole: seg > 0 ? 'mid' : 'opening',
      });
      // Comment: clear buffer so next dig is segment-local (not pre-tool text again)
      childReasoning.set(taskId, '');
      childThoughtRotatePending.set(taskId, true);
    },
    createLoop: (context, hooks) => {
      const cwd = context.worktree?.path;
      if (!cwd) {
        throw new Error(
          'Subagent refused: isolated worktree path is required',
        );
      }
      const childMode = modeForSubagentRole(context.task.role);
      const childModeConfig = modeRegistry.getModeConfig(childMode);
      const childSchemas = registry.getSchemas(childMode);
      // Comment: reset each model round so every tool wave seals Thought
      let toolsBegan = false;
      return new AgentLoopController(
        {
          runModel: async ({ messages, signal, onActivity }) => {
            toolsBegan = false;
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
              tools: childSchemas,
              thinkingEffort,
            })) {
              onActivity?.();
              if (chunk.error) throw new Error(chunk.error);
              if (chunk.content) {
                content += chunk.content;
                await hooks.onAssistantDelta?.(chunk.content);
              }
              if (chunk.reasoning_content) {
                reasoning += chunk.reasoning_content;
                await hooks.onReasoning?.(chunk.reasoning_content);
              }
              if (chunk.toolCalls?.length) {
                mergeToolCallDeltas(toolAcc, chunk.toolCalls);
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
                  id: tc.id || `sub_call_${i}`,
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
          executeTool: async ({ name, args, callId, signal }) => {
            if (name === 'task' || name === 'task_run') {
              return {
                success: false,
                error: 'Nested subagents are not allowed',
              };
            }
            if (!toolsBegan) {
              toolsBegan = true;
              await hooks.onToolCallsBegin?.();
            }
            await hooks.onToolCall?.(name, args, callId);
            const stats =
              childStats.get(context.task.id) ?? createSubagentRunStats();
            childStats.set(context.task.id, stats);
            recordSubagentTool(stats);
            const pathArg =
              typeof args.path === 'string'
                ? args.path
                : typeof args.file_path === 'string'
                  ? args.file_path
                  : undefined;
            if (pathArg) recordSubagentFileChange(stats, pathArg);

            const kind = toolKind(name);
            const detail = shortDetail(name, args);
            const taskId = context.task.id;
            const callIdTagged =
              callId && !String(callId).startsWith(`tl_sub_${taskId}_`)
                ? `tl_sub_${taskId}_${callId}`
                : callId || `tl_sub_${taskId}_tool_${Date.now()}`;
            // Comment: SUB-010 — all child tool/card events target child sessionId
            postChildStream(taskId, {
              event: 'tool.start',
              id: callIdTagged,
              callId: callIdTagged,
              toolName: name,
              kind,
              detail,
              toolArgs: JSON.stringify(args),
              parentTurnId: context.task.parentTurnId,
              turn: currentTurn,
            });

            // Comment: CONV-018/019 — same FileEdit/Terminal cards as main AgentTurn
            const isTerminal = name === 'run_terminal_cmd';
            const termId = isTerminal
              ? `term_${callIdTagged || Date.now()}`
              : '';
            const termCommand = isTerminal ? String(args.command || '') : '';
            const termDescription =
              isTerminal && args.description != null
                ? String(args.description)
                : undefined;
            const termStartedAt = isTerminal ? Date.now() : 0;
            let termChunked = false;
            if (isTerminal) {
              postChildStream(taskId, {
                event: 'terminal.run',
                run: {
                  id: termId,
                  phase: 'start',
                  command: termCommand,
                  description: termDescription,
                  status: 'running',
                  toolId: callIdTagged,
                  turn: currentTurn,
                },
              });
            }

            const result = await executeTool(registry, name, args, {
              ...toolCtxBase,
              workspaceRoot: cwd,
              mode: childMode,
              signal,
              onTerminalChunk: isTerminal
                ? (chunk, stream) => {
                    termChunked = true;
                    postChildStream(taskId, {
                      event: 'terminal.run',
                      run: {
                        id: termId,
                        phase: 'chunk',
                        chunk,
                        stream,
                        toolId: callIdTagged,
                        turn: currentTurn,
                      },
                    });
                  }
                : undefined,
            });

            if (isTerminal) {
              const data =
                result.data && typeof result.data === 'object'
                  ? (result.data as Record<string, unknown>)
                  : {};
              const exitCode =
                data.exitCode === null
                  ? null
                  : data.exitCode != null
                    ? Number(data.exitCode)
                    : result.success
                      ? 0
                      : 1;
              if (!termChunked) {
                const stdout = data.stdout != null ? String(data.stdout) : '';
                const stderr =
                  data.stderr != null
                    ? String(data.stderr)
                    : result.error
                      ? String(result.error)
                      : '';
                if (stdout) {
                  postChildStream(taskId, {
                    event: 'terminal.run',
                    run: {
                      id: termId,
                      phase: 'chunk',
                      chunk: stdout,
                      stream: 'stdout',
                      toolId: callIdTagged,
                      turn: currentTurn,
                    },
                  });
                }
                if (stderr) {
                  postChildStream(taskId, {
                    event: 'terminal.run',
                    run: {
                      id: termId,
                      phase: 'chunk',
                      chunk: stderr,
                      stream: 'stderr',
                      toolId: callIdTagged,
                      turn: currentTurn,
                    },
                  });
                }
              }
              postChildStream(taskId, {
                event: 'terminal.run',
                run: {
                  id: termId,
                  phase: 'end',
                  command:
                    data.command != null ? String(data.command) : termCommand,
                  description: termDescription,
                  cwd: data.cwd != null ? String(data.cwd) : undefined,
                  exitCode,
                  error: result.error,
                  durationMs: Date.now() - termStartedAt,
                  status: result.success ? 'done' : 'error',
                  toolId: callIdTagged,
                  turn: currentTurn,
                },
              });
            }

            if (
              result.success &&
              (name === 'edit_file' || name === 'write_file') &&
              result.data &&
              typeof result.data === 'object'
            ) {
              const data = result.data as Record<string, unknown>;
              const diff = data.diff as
                | {
                    additions?: number;
                    deletions?: number;
                    lines?: Array<{
                      type: string;
                      lineNumber: number;
                      text: string;
                    }>;
                  }
                | undefined;
              const editPath = String(data.path || args.path || '');
              if (diff && Array.isArray(diff.lines) && diff.lines.length > 0) {
                postChildStream(taskId, {
                  event: 'file.edit',
                  edit: {
                    path: editPath,
                    absPath:
                      data.absPath != null ? String(data.absPath) : undefined,
                    checkpointId:
                      data.checkpointId != null
                        ? String(data.checkpointId)
                        : undefined,
                    toolId: callIdTagged,
                    turn: currentTurn,
                    additions: Number(diff.additions) || 0,
                    deletions: Number(diff.deletions) || 0,
                    lines: diff.lines.map((l) => ({
                      type:
                        l.type === 'add' || l.type === 'delete'
                          ? l.type
                          : 'context',
                      lineNumber: Number(l.lineNumber) || 0,
                      text: String(l.text ?? ''),
                    })),
                  },
                });
              }
            }

            postChildStream(taskId, {
              event: 'tool.end',
              id: callIdTagged,
              callId: callIdTagged,
              toolName: name,
              kind,
              detail,
              toolArgs: JSON.stringify(args),
              error: result.error,
              parentTurnId: context.task.parentTurnId,
              turn: currentTurn,
            });
            await hooks.onToolResult?.(name, result, callId);
            return result;
          },
          checkPermission: async () => 'allow' as const,
          // Comment: SUB-010 — runModel already streams via hooks.onAssistantDelta;
          // re-forwarding assistant_delta doubled the child answer body.
          onEvent: (_ev: AgentLoopEvent) => {},
        },
        {
          mode: childMode,
          maxTurns: SUBAGENT_MAX_TURNS,
          turnTimeoutMs,
          systemPrompt: childModeConfig.systemPrompt,
        },
      );
    },
    buildMessages: (context) => [
      {
        role: 'system',
        content: modeRegistry.getModeConfig(
          modeForSubagentRole(context.task.role),
        ).systemPrompt,
      },
    ],
    onLifecycle: (event) => {
      const task = event.task;
      const turn = currentTurn || 1;
      const finished =
        event.type === 'subagent.completed' ||
        event.type === 'subagent.failed' ||
        event.type === 'subagent.cancelled';
      const parentOut = finished ? parentResultFromTask(task) : undefined;
      const summary = finished
        ? String(parentOut?.data?.summary || task.result || task.error || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 280)
        : undefined;
      const stats = finished
        ? snapshotSubagentResultStats(
            childStats.get(task.id),
            Number(parentOut?.data?.duration) || 0,
          )
        : undefined;
      const uiDescription =
        String(task.description || '').trim() ||
        task.prompt.slice(0, 48).trim();
      const childId = subagentSessionId(task.id);
      // Comment: SUB-010 — full prompt on spawn for child user bubble; short preview elsewhere
      const promptForUi =
        event.type === 'subagent.created' ||
        event.type === 'subagent.started'
          ? task.prompt.slice(0, 50_000)
          : task.prompt.slice(0, 80);
      // Comment: SUB-010 — parent gets header/summary only; childSessionId for UI spawn
      postStream({
        event: 'subagent.event',
        type: event.type,
        taskId: task.id,
        childSessionId: childId,
        parentSessionId: parentSessionId || undefined,
        parentTurnId: task.parentTurnId,
        role: task.role,
        status: task.status,
        turn,
        prompt: promptForUi,
        description: uiDescription,
        summary,
        filesChanged:
          task.worktreeSnapshot?.filesChanged ?? stats?.filesChanged,
        toolCount: stats?.toolCount,
        duration: stats?.duration,
        worktreePath: task.worktree?.path,
        worktreeBranch: task.worktree?.branch,
      });
      if (finished && task.worktree) {
        registerSubagentWorktree(task.id, root, task.worktree);
      }
      const status =
        event.type === 'subagent.completed'
          ? 'done'
          : event.type === 'subagent.failed' ||
              event.type === 'subagent.cancelled'
            ? 'error'
            : 'running';
      postStream({
        event: 'timeline',
        kind: 'task',
        label: `Started · task_run`,
        detail: uiDescription,
        toolName: 'task_run',
        itemStatus: status === 'done' ? 'done' : status === 'error' ? 'error' : 'running',
        id: `tl_subagent_${task.id}`,
        turn,
        subagentId: task.id,
        parentTurnId: task.parentTurnId,
        description: uiDescription,
        role: task.role,
        prompt: task.prompt.slice(0, 80),
        childSessionId: childId,
      });
      // Comment: seed child session streaming chrome (Thought may arrive next)
      if (
        event.type === 'subagent.created' ||
        event.type === 'subagent.started'
      ) {
        postChildStream(task.id, {
          event: 'status',
          status: 'streaming',
        });
      } else if (finished) {
        // Comment: SUB-010 — catch-up final answer onto child before settle
        const finalText = String(task.result || '').trim();
        if (finalText && status !== 'error') {
          postChildStream(task.id, {
            event: 'delta',
            replaceContent: finalText,
          });
        }
        postChildStream(task.id, {
          event: 'status',
          status: status === 'error' ? 'error' : 'complete',
        });
      }
    },
  });

  // Auto-approve for first E2E wire; interactive approval lands with SAFE host prompts.
  const gate = new PermissionGate('auto');

  // Comment: CHAT-012 — cache vision parts once (re-read + base64 every turn blew TTFT / idle timeout)
  let cachedImageParts: Awaited<ReturnType<typeof loadChatSendImageParts>> | null =
    null;
  const getImageParts = async () => {
    if (!cachedImageParts) {
      cachedImageParts = await loadChatSendImageParts(payload.images);
    }
    return cachedImageParts;
  };

  const loop = new AgentLoopController(
    {
      runModel: async ({ messages, signal, turn, onActivity }) => {
        const imageParts = await getImageParts();
        onActivity?.();
        const lastUserIdx = (() => {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]?.role === 'user') return i;
          }
          return -1;
        })();
        const providerMessages = messages.map((m, idx) => {
          if (m.role === 'tool') {
            return {
              role: 'tool',
              content: m.content,
              tool_call_id: m.toolCallId,
              name: m.name,
            };
          }
          if (m.role === 'assistant' && m.toolCalls?.length) {
            return {
              role: 'assistant',
              content: m.content || null,
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments ?? {}),
                },
              })),
            };
          }
          if (
            idx === lastUserIdx &&
            imageParts.length > 0 &&
            typeof m.content === 'string'
          ) {
            return {
              role: 'user',
              content: [
                { type: 'text', text: m.content || '' },
                ...imageParts,
              ],
            };
          }
          return { role: m.role, content: m.content };
        });

        /** One streamed completion → content / reasoning / tool_calls. */
        const streamOnce = async (): Promise<{
          content: string;
          reasoning: string;
          toolAcc: Map<number, { id?: string; name?: string; arguments: string }>;
          finishReason: string | undefined;
        }> => {
          let content = '';
          let reasoning = '';
          let finishReason: string | undefined;
          const toolAcc = new Map<
            number,
            { id?: string; name?: string; arguments: string }
          >();

          // Comment: keepalive while waiting on first token (local + vision TTFT)
          let lastBeat = Date.now();
          const beat = () => {
            const now = Date.now();
            if (now - lastBeat < 15_000) return;
            lastBeat = now;
            onActivity?.();
            postStream({ event: 'heartbeat' });
          };
          const beatTimer = setInterval(beat, 15_000);
          // Comment: fire immediately — local TTFT often exceeds former 180s idle window
          onActivity?.();
          postStream({ event: 'heartbeat' });
          lastBeat = Date.now();

          try {
            for await (const chunk of provider.streamChat({
              messages: providerMessages,
              model,
              signal,
              tools: toolSchemas,
              thinkingEffort,
            })) {
              onActivity?.();
              beat();
              if (chunk.error) {
                throw new Error(chunk.error);
              }
              if (chunk.content) {
                content += chunk.content;
                postStream({ event: 'delta', content: chunk.content });
              }
              if (chunk.reasoning_content) {
                reasoning += chunk.reasoning_content;
                postStream({ event: 'delta', reasoning: chunk.reasoning_content });
              }
              if (chunk.toolCalls?.length) {
                mergeToolCallDeltas(toolAcc, chunk.toolCalls);
              }
              // Comment: log-only — do not guess length-cut / auto-continue without evidence
              if (chunk.finishReason) {
                finishReason = String(chunk.finishReason);
              }
            }
          } finally {
            clearInterval(beatTimer);
          }
          return { content, reasoning, toolAcc, finishReason };
        };

        let { content, reasoning, toolAcc, finishReason } = await streamOnce();

        // Zen free models (e.g. nemotron) occasionally finish with zero tokens —
        // retry once before treating as empty.
        const hasTools = [...toolAcc.values()].some((tc) => Boolean(tc.name));
        if (!content.trim() && !reasoning.trim() && !hasTools && !signal?.aborted) {
          hostLog(
            'chat.send empty reply',
            `retry empty model turn requestId=${requestId} turn=${turn}`,
          );
          ({ content, reasoning, toolAcc, finishReason } = await streamOnce());
        }

        // Zen models sometimes put the *final* answer only in reasoning_content.
        // Never promote when this turn already has tool_calls — that dumps Thought
        // into the answer body and breaks Grep → partial-Read sequencing.
        const pendingToolCalls = [...toolAcc.values()].some((tc) => Boolean(tc.name));
        if (!content.trim() && reasoning.trim() && !pendingToolCalls) {
          content = reasoning;
          postStream({ event: 'delta', content: reasoning });
          hostLog(
            'chat.send empty reply',
            `promoted reasoning→content requestId=${requestId} len=${reasoning.length}`,
          );
        } else if (!content.trim() && reasoning.trim() && pendingToolCalls) {
          hostLog(
            'chat.send empty reply',
            `skip reasoning→content (tool_calls pending) requestId=${requestId} reasoningLen=${reasoning.length} tools=${[...toolAcc.values()].map((t) => t.name).filter(Boolean).join(',')}`,
          );
        }

        hostLog(
          'chat.send empty reply',
          `model turn done requestId=${requestId} turn=${turn} contentLen=${content.length} reasoningLen=${reasoning.length} tools=${[...toolAcc.values()].map((t) => t.name).filter(Boolean).join(',') || '0'} finishReason=${finishReason || '(none)'} tail=${JSON.stringify(content.slice(-40))}`,
        );

        // Comment: finishReason omitted + tools=0 + short prose = Zen stream cut (HOST-002 RCA).
        // Do not auto-retry here — deltas already hit the UI; retry would duplicate.
        if (!finishReason && ![...toolAcc.values()].some((tc) => Boolean(tc.name))) {
          hostLog(
            'chat.send empty reply',
            `incomplete stream? requestId=${requestId} turn=${turn} contentLen=${content.length} (no finishReason, no tools)`,
            true,
          );
        }

        const toolCalls: NonNullable<ModelTurnResult['toolCalls']> = [];
        for (const [, tc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
          if (!tc.name) continue;
          let args: Record<string, unknown> = {};
          try {
            args = tc.arguments
              ? (JSON.parse(tc.arguments) as Record<string, unknown>)
              : {};
          } catch {
            args = { raw: tc.arguments };
          }
          toolCalls.push({
            id: tc.id || `call_${toolCalls.length + 1}`,
            name: tc.name,
            arguments: args,
          });
        }

        const result: ModelTurnResult = {
          content: content || undefined,
          reasoning: reasoning || undefined,
          toolCalls: toolCalls.length ? toolCalls : undefined,
        };
        return result;
      },

      executeTool: async ({ name, args, callId, signal }) => {
        // Comment: SUB-* — spawn via SubagentHost (TaskTool descriptor is stub-only)
        if (name === 'task' || name === 'task_run') {
          hostLog(
            'card.pipe',
            `subagent.spawn requestId=${requestId} name=${name} callId=${callId || '-'}`,
          );
          const out = await subagentHost.runFromToolArgs(
            args,
            String(currentTurn || 1),
          );
          // Comment: SUB-010 — pass plain conclusion text so parent does not
          // judge from a truncated JSON `summary` field.
          const parentText =
            out.data &&
            typeof (out.data as { parentToolText?: unknown }).parentToolText ===
              'string'
              ? String(
                  (out.data as { parentToolText: string }).parentToolText
                ).trim()
              : out.data &&
                  typeof (out.data as { summary?: unknown }).summary === 'string'
                ? String((out.data as { summary: string }).summary).trim()
                : '';
          return {
            success: out.success,
            data: parentText || out.data,
            error: out.error,
            metadata: { durationMs: Number(out.data?.duration) || 0 },
          };
        }

        // Comment: CONV-018/019 — card.pipe logs for tool + FileEdit/Terminal card emit
        const toolPath =
          typeof args.path === 'string'
            ? args.path
            : typeof args.file_path === 'string'
              ? args.file_path
              : undefined;
        hostLog(
          'card.pipe',
          `tool.exec start requestId=${requestId} name=${name} callId=${callId || '-'} path=${toolPath || '-'}`,
        );

        const isTerminal = name === 'run_terminal_cmd';
        const termId = isTerminal ? `term_${callId || Date.now()}` : '';
        const termCommand = isTerminal ? String(args.command || '') : '';
        const termDescription =
          isTerminal && args.description != null
            ? String(args.description)
            : undefined;
        const termStartedAt = isTerminal ? Date.now() : 0;
        let termChunked = false;

        if (isTerminal) {
          hostLog(
            'card.pipe',
            `card.terminal emit phase=start requestId=${requestId} id=${termId} toolId=${callId || '-'} cmd=${termCommand.slice(0, 120)}`,
          );
          postStream({
            event: 'terminal.run',
            run: {
              id: termId,
              phase: 'start',
              command: termCommand,
              description: termDescription,
              status: 'running',
              toolId: callId,
            },
          });
        }

        const toolCtx: ToolContext = {
          ...toolCtxBase,
          signal,
          onTerminalChunk: isTerminal
            ? (chunk, stream) => {
                termChunked = true;
                postStream({
                  event: 'terminal.run',
                  run: {
                    id: termId,
                    phase: 'chunk',
                    chunk,
                    stream,
                    toolId: callId,
                  },
                });
              }
            : undefined,
        };
        const result = await executeTool(registry, name, args, toolCtx);

        hostLog(
          'card.pipe',
          `tool.exec end requestId=${requestId} name=${name} callId=${callId || '-'} ok=${result.success} denied=${Boolean(result.metadata?.denied)} err=${result.error ? String(result.error).slice(0, 80) : '-'}`,
        );

        if (isTerminal) {
          const data =
            result.data && typeof result.data === 'object'
              ? (result.data as Record<string, unknown>)
              : {};
          const exitCode =
            data.exitCode === null
              ? null
              : data.exitCode != null
                ? Number(data.exitCode)
                : result.success
                  ? 0
                  : 1;
          // Comment: seed card buffers when spawn failed before any onChunk
          if (!termChunked) {
            const stdout = data.stdout != null ? String(data.stdout) : '';
            const stderr =
              data.stderr != null
                ? String(data.stderr)
                : result.error
                  ? String(result.error)
                  : '';
            if (stdout) {
              postStream({
                event: 'terminal.run',
                run: {
                  id: termId,
                  phase: 'chunk',
                  chunk: stdout,
                  stream: 'stdout',
                  toolId: callId,
                },
              });
            }
            if (stderr) {
              postStream({
                event: 'terminal.run',
                run: {
                  id: termId,
                  phase: 'chunk',
                  chunk: stderr,
                  stream: 'stderr',
                  toolId: callId,
                },
              });
            }
          }
          const durationMs = Date.now() - termStartedAt;
          hostLog(
            'card.pipe',
            `card.terminal emit phase=end requestId=${requestId} id=${termId} exit=${exitCode} ms=${durationMs} chunked=${termChunked} status=${result.success ? 'done' : 'error'}`,
          );
          postStream({
            event: 'terminal.run',
            run: {
              id: termId,
              phase: 'end',
              command:
                data.command != null ? String(data.command) : termCommand,
              description: termDescription,
              cwd: data.cwd != null ? String(data.cwd) : undefined,
              exitCode,
              error: result.error,
              durationMs,
              status: result.success ? 'done' : 'error',
              toolId: callId,
            },
          });
        }

        // Comment: CONV-019 — emit FileEditCard payload (v2.1 onToolResult parity)
        if (
          result.success &&
          (name === 'edit_file' || name === 'write_file') &&
          result.data &&
          typeof result.data === 'object'
        ) {
          const data = result.data as Record<string, unknown>;
          const diff = data.diff as
            | {
                additions?: number;
                deletions?: number;
                lines?: Array<{
                  type: string;
                  lineNumber: number;
                  text: string;
                }>;
              }
            | undefined;
          const editPath = String(data.path || args.path || '');
          if (diff && Array.isArray(diff.lines) && diff.lines.length > 0) {
            // Comment: emit full diff lines — FileEditCard scrolls (no line-count cap)
            const previewLines = diff.lines.map((l) => ({
              type:
                l.type === 'add' || l.type === 'delete' ? l.type : 'context',
              lineNumber: Number(l.lineNumber) || 0,
              text: String(l.text ?? ''),
            }));
            hostLog(
              'card.pipe',
              `card.fileEdit emit requestId=${requestId} name=${name} path=${editPath} +${Number(diff.additions) || 0} -${Number(diff.deletions) || 0} lines=${previewLines.length} toolId=${callId || '-'}`,
            );
            postStream({
              event: 'file.edit',
              edit: {
                path: editPath,
                absPath:
                  data.absPath != null ? String(data.absPath) : undefined,
                checkpointId:
                  data.checkpointId != null
                    ? String(data.checkpointId)
                    : undefined,
                toolId: callId,
                additions: Number(diff.additions) || 0,
                deletions: Number(diff.deletions) || 0,
                lines: previewLines,
              },
            });
          } else {
            hostLog(
              'card.pipe',
              `card.fileEdit SKIP no-diff requestId=${requestId} name=${name} path=${editPath} toolId=${callId || '-'}`,
            );
          }
        }
        return {
          success: result.success,
          data: result.data,
          error: result.error,
          metadata: {
            durationMs: result.metadata?.durationMs,
            truncated: result.metadata?.truncated,
            cancelled: result.metadata?.cancelled,
            denied: result.metadata?.denied,
          },
        };
      },

      checkPermission: async ({ toolName, args }) => {
        const path =
          typeof args.path === 'string'
            ? args.path
            : typeof args.file_path === 'string'
              ? args.file_path
              : undefined;
        const decision = await gate.requestPermission({
          toolName,
          args,
          path,
        });
        return decision === 'reject' ? 'deny' : 'allow';
      },

      onEvent: (event: AgentLoopEvent) => {
        if (event.type === 'turn_start') {
          currentTurn = event.turn;
        }
        mapLoopEventToStream(event, postStream);
      },
    },
    {
      mode,
      maxTurns,
      turnTimeoutMs,
      systemPrompt: modeConfig.systemPrompt,
      contextBudgetTokens: modeConfig.contextBudget,
      parallelTools: true,
    },
  );

  ctx.hostLoops.set(requestId, {
    loop,
    abort,
    cancelSubagents: () => subagentHost.cancelAll(),
  });

  const prior: AgentMessage[] = (payload.messages || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, -1)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: String(m.content || ''),
    }));

  const lastUser =
    [...(payload.messages || [])]
      .reverse()
      .find((m) => m.role === 'user')?.content || '';

  try {
    postStream({ event: 'status', status: 'running' });
    const result = await loop.run({
      prompt: String(lastUser),
      signal: abort.signal,
      messages: prior.length ? prior : undefined,
    });

    if (result.reason === 'doom_loop' && result.content) {
      postStream({ event: 'delta', content: `\n\n${result.content}` });
    }
    if (result.reason === 'fatal_error') {
      postStream({
        event: 'error',
        error: result.content || 'Fatal agent error',
      });
    } else if (result.reason === 'aborted' || result.reason === 'timeout') {
      hostLog(
        'chat.send empty reply',
        `chat.stream → stopped reason=${result.reason} requestId=${requestId} turns=${result.turns} tools=${toolEvents}`,
      );
      postStream({ event: 'stopped', reason: result.reason });
    } else {
      // Parallel tabs: webview may drop deltas under load — send final body on complete.
      const finalBody =
        lastAssistantContent(result.messages) ||
        String(result.content || '') ||
        '';
      if (
        isTrueEmptyModelReply({
          finalBody,
          streamedChars,
          reasoningChars,
          toolEvents,
        })
      ) {
        postStream({
          event: 'error',
          error:
            'Model returned an empty response (no content). Try again or pick another model.',
        });
      } else {
        // Tools ran but model skipped closing prose — complete (timeline already shows work).
        if (!finalBody.trim() && toolEvents > 0 && streamedChars === 0) {
          hostLog(
            'chat.send empty reply',
            `complete after tools without prose requestId=${requestId} tools=${toolEvents} reasoningLen=${reasoningChars}`,
          );
        }
        postStream({
          event: 'complete',
          ...(finalBody ? { content: finalBody } : {}),
        });
        hostLog(
          'chat.send empty reply',
          `complete diag requestId=${requestId} finalBodyLen=${finalBody.length} streamedChars=${streamedChars} reasoningChars=${reasoningChars} tools=${toolEvents} tail=${JSON.stringify(finalBody.slice(-48))}`,
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    hostLogError('chat.send empty reply', `chatSend threw requestId=${requestId}`, err);
    postStream({ event: 'error', error: message });
  } finally {
    ctx.hostLoops.delete(requestId);
    if (ctx.getHostLoopRequestId() === requestId) {
      ctx.setHostLoopRequestId(undefined);
    }
  }
}

/** Last non-empty assistant text from the loop transcript (complete catch-up). */
function lastAssistantContent(
  messages: AgentMessage[] | undefined,
): string {
  if (!messages?.length) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant' && String(m.content || '').trim()) {
      return String(m.content);
    }
  }
  return '';
}

/** CHAT-012 — read capture paths into OpenAI-style image_url parts (v2.1 ImageHandler parity). */
async function loadChatSendImageParts(
  images: ChatSendPayload['images'] | undefined,
): Promise<Array<{ type: 'image_url'; image_url: { url: string; detail: string } }>> {
  if (!images?.length) return [];
  const fs = await import('node:fs/promises');
  const parts: Array<{
    type: 'image_url';
    image_url: { url: string; detail: string };
  }> = [];
  for (const img of images.slice(0, 5)) {
    try {
      const path = String(img.path || '');
      if (!path) continue;
      const buf = await fs.readFile(path);
      if (buf.length > 20 * 1024 * 1024) continue;
      const mime = String(img.mimeType || 'image/png');
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${buf.toString('base64')}`,
          detail: 'auto',
        },
      });
    } catch (err) {
      hostLog(
        'card.pipe',
        `chat.image SKIP path=${img.path} err=${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (parts.length) {
    const bytes = parts.reduce((n, p) => n + (p.image_url.url.length || 0), 0);
    hostLog(
      'card.pipe',
      `chat.image attach count=${parts.length} approxB64Chars=${bytes}`,
    );
  }
  return parts;
}

/** Map AgentLoopController events → chat.stream envelope events. */
function mapLoopEventToStream(
  event: AgentLoopEvent,
  post: (e: Record<string, unknown>) => void,
): void {
  switch (event.type) {
    case 'status':
      post({ event: 'status', status: event.status });
      break;
    case 'assistant_delta':
      // runModel already posts token deltas; avoid double-posting full turn text.
      break;
    case 'tool_start': {
      const name = event.call.name;
      // Comment: SUB-010 — parent SubagentRunRow comes from subagent.event / tl_subagent_* only.
      // Emitting tool.start for task_run duplicates the row (call_* + tl_subagent_*).
      if (name === 'task' || name === 'task_run') break;
      let args: Record<string, unknown> = event.call.arguments ?? {};
      // Comment: normalize string / raw JSON so Searched/Grepped detail is never blank
      if (typeof (args as unknown) === 'string') {
        try {
          args = JSON.parse(args as unknown as string) as Record<string, unknown>;
        } catch {
          args = { raw: String(args) };
        }
      }
      const kind = toolKind(name);
      const detail = shortDetail(name, args);
      post({
        event: 'tool.start',
        id: event.call.id,
        callId: event.call.id,
        toolName: name,
        kind,
        detail,
        // Keep raw args for webview fallback; prefer `detail` for Cursor chrome.
        toolArgs: JSON.stringify(args),
      });
      break;
    }
    case 'tool_end': {
      const name = event.call.name;
      if (name === 'task' || name === 'task_run') break;
      let args: Record<string, unknown> = event.call.arguments ?? {};
      if (typeof (args as unknown) === 'string') {
        try {
          args = JSON.parse(args as unknown as string) as Record<string, unknown>;
        } catch {
          args = { raw: String(args) };
        }
      }
      // Comment: re-emit shortDetail on end so Grepped/Read never stay blank if start raced
      const detail = shortDetail(name, args);
      post({
        event: 'tool.end',
        id: event.call.id,
        callId: event.call.id,
        toolName: name,
        kind: toolKind(name),
        detail,
        toolArgs: JSON.stringify(args),
        error: event.error,
      });
      break;
    }
    case 'error':
      post({ event: 'error', error: event.error });
      break;
    case 'compaction':
      // Comment: CTX-004 — chat-ui shows "Summarizing chat context..." (API context only)
      post({
        event: 'compaction',
        level: event.level,
        turn: event.turn,
        label: 'Summarizing chat context...',
      });
      break;
    case 'done':
      // complete/stopped posted by runHostChatSend after run() returns
      break;
    default:
      break;
  }
}

/** Abort in-flight chat.send for a request (or the current host loop). */
export function stopHostChatSend(
  ctx: ChatSendContext,
  payload?: ChatStopPayload,
): void {
  const target =
    (payload?.requestId != null ? String(payload.requestId) : undefined) ||
    ctx.getHostLoopRequestId();
  if (!target) return;
  const runtime = ctx.hostLoops.get(target);
  if (!runtime) return;
  runtime.abort.abort();
  runtime.cancelSubagents?.();
  ctx.hostLoops.delete(target);
  if (ctx.getHostLoopRequestId() === target) {
    ctx.setHostLoopRequestId(undefined);
  }
  if (ctx.webview) {
    void ctx.webview.postMessage({
      type: 'chat.stream',
      payload: { requestId: target, event: 'stopped' },
    });
  }
}
