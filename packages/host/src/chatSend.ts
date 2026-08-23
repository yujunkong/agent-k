/**
 * HOST-002 — Chat send bridge.
 * Wires chat.send → AgentLoopController with LiteLLMProvider + builtin tools.
 * Ported from v2.1-PRODUCTION-MODE host/chatSend.ts (Feature-ID transplant, not file copy).
 */

import {
  AgentLoopController,
  modeRegistry,
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
import {
  executeTool,
  registerBuiltinTools,
  ToolRegistry,
  type ToolContext,
} from '@agent-k/tools';
import * as vscode from 'vscode';
import { hostLog, hostLogError } from './hostLog';
import { isTrueEmptyModelReply } from './chatSendEmpty';
import { shortDetail, toolKind } from './timelineLabels';

/** In-flight loop runtime keyed by requestId. */
export type HostLoopRuntime = {
  loop: AgentLoopController;
  abort: AbortController;
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
  };

  // Auto-approve for first E2E wire; interactive approval lands with SAFE host prompts.
  const gate = new PermissionGate('auto');

  const loop = new AgentLoopController(
    {
      runModel: async ({ messages, signal, turn }) => {
        const providerMessages = messages.map((m) => {
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

          for await (const chunk of provider.streamChat({
            messages: providerMessages,
            model,
            signal,
            tools: toolSchemas,
            thinkingEffort,
          })) {
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
        mapLoopEventToStream(event, postStream);
      },
    },
    {
      mode,
      maxTurns,
      systemPrompt: modeConfig.systemPrompt,
      contextBudgetTokens: modeConfig.contextBudget,
      parallelTools: true,
    },
  );

  ctx.hostLoops.set(requestId, { loop, abort });

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
      postStream({ event: 'stopped' });
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
