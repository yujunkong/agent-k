/**
 * INT-002 — Shared SubagentHost factory for planExecute (and later chatSend).
 *
 * Purpose: extract the createSubagentHost(...) block from chatSend so that
 * planExecute can wire the same AgentLoop + worktree + chat.stream events
 * without duplicating ~500 lines of subagent streaming logic.
 *
 * SUB-010 contract preserved:
 *   - subagent.event posted to parent stream (Review→Adopt relies on this)
 *   - registerSubagentWorktree called on finish (Review→Adopt diff flow)
 *   - child NL/tool events posted to child sessionId (never parent session)
 *   - timeline tl_subagent_* posted to parent for task card
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
import { subagentSessionId } from '@agent-k/shared';
import {
  executeTool,
  registerBuiltinTools,
  ToolRegistry,
  type ToolContext,
} from '@agent-k/tools';
import * as vscode from 'vscode';
import * as path from 'node:path';
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
  type SubagentHost,
} from './subagentHost';
import { registerSubagentWorktree } from './subagentWorktreeRegistry';
import { getMcpToolBridge } from './mcpHost';

// ─── Public types ─────────────────────────────────────────────────────────────

export type { SubagentHost };

/**
 * INT-002 — Options for createWiredSubagentHost.
 * Mirrors the relevant payload fields extracted from ChatSendPayload so that
 * planExecute (HOST-008) can supply the same knobs without taking a full
 * ChatSendPayload dependency.
 */
export type WiredSubagentHostOptions = {
  /** Forward every chat.stream event to the webview (or plan bridge). */
  postStream: (event: Record<string, unknown>) => void;
  /** Parent session id — stamped on subagent.event for UI routing. */
  parentSessionId?: string;
  /** Absolute path to the repository root (worktree base). */
  repoRoot: string;
  /** LiteLLM-compatible base URL (no trailing slash). */
  baseUrl: string;
  /** API key — omit for local/no-auth endpoints. */
  apiKey?: string;
  /** Model identifier forwarded to LiteLLMProvider.streamChat. */
  model: string;
  /** Thinking effort string (e.g. "medium", "high"). Clamped to model cap. */
  thinkingEffort?: string;
  /**
   * Parent turn counter callback — used to stamp timeline / tool event ids.
   * Defaults to () => 1 when omitted (plan context has no rolling turn counter).
   */
  getCurrentTurn?: () => number;
  /**
   * Override system prompt for the subagent executor.
   * Falls back to modeRegistry agent mode systemPrompt when omitted.
   */
  systemPrompt?: string;
  /**
   * Per-turn model timeout in ms.
   * INT-002: inherit caller's timeout; 0 means disabled.
   */
  turnTimeoutMs?: number;
  /**
   * PLAN-009 — approved plan sticky block per subagent task id.
   * Re-injected into AgentLoop protected system slot each turn.
   */
  getApprovedPlanBlock?: (taskId: string) => string | undefined;
  /** HARNESS-002/004 — verify-first + post-edit micro-loop (mirrors chat.send). */
  verificationFirst?: boolean;
  verificationMicroLoop?: boolean;
};

// ─── mergeToolCallDeltas (copied from chatSend — SUB-010 streaming contract) ──

/**
 * Accumulate OpenAI-style streamed tool_call deltas into final tool calls.
 * Copied verbatim from chatSend.ts so INT-002 consumers get identical merging.
 */
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

// ─── Main factory ──────────────────────────────────────────────────────────────

/**
 * INT-002 — Build a fully-wired SubagentHost.
 *
 * Wires:
 *   - LiteLLMProvider with caller-supplied credentials
 *   - ToolRegistry with all builtin tools
 *   - createSubagentHost with:
 *       · onDelta/onReasoning/onToolCallsBegin → postChildStream
 *       · createLoop → AgentLoopController (child worktree cwd required)
 *       · executeTool → file.edit + terminal.run stream events
 *       · buildMessages → modeForSubagentRole system prompt
 *       · onLifecycle → subagent.event + tl_subagent_* timeline + registerSubagentWorktree
 *
 * Do NOT call this from chatSend itself — chatSend already constructs inline.
 * This factory is the shared entry point for planExecute and future callers.
 */
export function createWiredSubagentHost(
  opts: WiredSubagentHostOptions,
): SubagentHost {
  const {
    postStream,
    parentSessionId,
    repoRoot: root,
    baseUrl,
    apiKey,
    model,
    turnTimeoutMs,
  } = opts;

  // ── getCurrentTurn default ────────────────────────────────────────────────
  const getCurrentTurn = opts.getCurrentTurn ?? (() => 1);

  // ── Thinking effort — clamp to model capability ───────────────────────────
  const thinkingCap = resolveThinkingCapability(model);
  const thinkingEffort = clampThinkingEffort(
    parseThinkingEffort(opts.thinkingEffort),
    thinkingCap,
  );

  // ── LiteLLM provider ──────────────────────────────────────────────────────
  const provider = new LiteLLMProvider({
    id: 'agent-k-subagent',
    name: 'Agent K Subagent',
    type: 'litellm',
    baseUrl,
    apiKey,
    model,
  });

  // ── Tool registry — all builtins (same as chatSend) ───────────────────────
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);

  // ── VS Code diagnostics wired into read_lints (optional, best-effort) ─────
  const toolCtxBase: ToolContext = {
    workspaceRoot: root,
    mode: 'agent',
    debugLogs: [],
    // Comment: MCP-001 — same MCP bridge as chatSend
    mcp: getMcpToolBridge(),
    // Comment: TOOL — wire VS Code diagnostics into read_lints (mirrors chatSend pattern)
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

  // ── System prompt — caller override or modeRegistry agent default ─────────
  const systemPrompt =
    opts.systemPrompt ?? modeRegistry.getModeConfig('agent').systemPrompt;

  // ── Child-session state maps ──────────────────────────────────────────────
  // Comment: SUB-* — per-child stats / Thought segment state (mirrors chatSend block)
  const childStats = new Map<
    string,
    ReturnType<typeof createSubagentRunStats>
  >();
  const childReasoning = new Map<string, string>();
  // Comment: SUB-010 — Cursor-style Thought segments: _thinking, _thinking_s1, …
  const childThoughtSeg = new Map<string, number>();
  const childThoughtRotatePending = new Map<string, boolean>();

  const childThinkingId = (taskId: string, seg: number): string =>
    seg <= 0
      ? `tl_sub_${taskId}_thinking`
      : `tl_sub_${taskId}_thinking_s${seg}`;

  // ── postChildStream — routes to child sessionId (not parent) ─────────────
  // Comment: SUB-010 — child transcript is standalone; never dual-write to parent
  const postChildStream = (
    taskId: string,
    event: Record<string, unknown>,
  ): void => {
    postStream({
      ...event,
      sessionId: subagentSessionId(taskId),
    });
  };

  // ── createSubagentHost ────────────────────────────────────────────────────
  return createSubagentHost({
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
        turn: getCurrentTurn() || 1,
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
        turn: getCurrentTurn() || 1,
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
            // Map AgentMessage[] → provider message shape
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
            // Comment: INT-002 / SUB-010 — nested task/task_run denied inside subagent
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
            const currentTurn = getCurrentTurn();
            // Prefix callId with child task id so parent timeline ids never collide
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

            // Comment: terminal end — flush stdout/stderr if not already chunked
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

            // Comment: file.edit card — mirrors chatSend CONV-018 diff streaming
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
          // re-forwarding assistant_delta would double the child answer body.
          onEvent: (_ev: AgentLoopEvent) => {},
        },
        {
          mode: childMode,
          maxTurns: SUBAGENT_MAX_TURNS,
          turnTimeoutMs,
          systemPrompt: childModeConfig.systemPrompt,
          // Comment: HARNESS-005 / PLAN-009 — rules + approved plan outside compaction
          workspaceRoot: root,
          approvedPlanBlock: opts.getApprovedPlanBlock?.(context.task.id),
          verificationFirst: opts.verificationFirst,
          verificationMicroLoop: opts.verificationMicroLoop,
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
      const turn = getCurrentTurn() || 1;
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

      // Comment: INT-002 — subagent.event MUST be posted; Review→Adopt (chatSend) depends on it
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

      // Comment: INT-002 — registerSubagentWorktree MUST be called; Review→Adopt diff flow depends on it
      if (finished && task.worktree) {
        registerSubagentWorktree(task.id, root, task.worktree);
      }

      // Parent timeline task card (tl_subagent_*)
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
        itemStatus:
          status === 'done' ? 'done' : status === 'error' ? 'error' : 'running',
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
}
