import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, Mode, Attachment, StreamDelta } from '../types';
import { apiHistoryForRegenerate } from '../regenerateTurn';
import { workEventFromHostPayload, workEventFromSubagentHostEvent } from '../conversation/conversationWorkEvent';
import { fileEditPreviewFromHost } from '../inlineEditReview';
import type { InlineEditAgentRequest } from '../inlineEdit';
/** Cached acquire — never double-call acquireVsCodeApi in this webview. */
import { getVsCodeApi } from '../vscodeApi';
import { debugError, debugLog, debugWarn } from '../debugLog';

type SendMessageOpts = {
  planStageOverride?: string;
  runtimeKey?: string;
  inlineEdit?: InlineEditAgentRequest;
  /** Per-send credentials (tab-scoped); fall back to hook options */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
};

/** No-token idle timeout — Ask path default */
const IDLE_TIMEOUT_MS = 30_000;
/** Host agent loops wait on LLM between tools; need longer + heartbeats */
const HOST_IDLE_TIMEOUT_MS = 180_000;

interface UseChatStreamOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** Override idle timeout (ms). Default 30s. */
  idleTimeoutMs?: number;
  /** Plan mode FSM stage — injected into host system prompt */
  planStage?: string;
  /** Debug mode FSM stage — injected into host system prompt */
  debugStage?: string;
  /** Thinking effort for host / direct API */
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high' | 'max';
  /** Active chat runtime key (usually current session id) for per-tab streaming state. */
  activeRuntimeKey?: string;
  /** Host worktree.review/apply/reject results (not tied to chat.send). */
  onWorktreeResult?: (payload: Record<string, unknown>) => void;
}

interface UseChatStreamReturn {
  streaming: boolean;
  sendMessage: (
    text: string,
    files: Attachment[],
    messages: ChatMessage[],
    mode: Mode,
    onDelta: (delta: StreamDelta) => void,
    onComplete: () => void,
    onError: (err: string) => void,
    opts?: SendMessageOpts
  ) => Promise<void>;
  stop: () => void;
  regenerate: (
    messages: ChatMessage[],
    mode: Mode,
    onDelta: (delta: StreamDelta) => void,
    onComplete: () => void,
    onError: (err: string) => void,
    onRegenerateStart?: () => void
  ) => Promise<void>;
  sendWorktreeReview: (subagentId: string) => string | undefined;
  sendWorktreeApply: (subagentId: string) => string | undefined;
  sendWorktreeReject: (subagentId: string) => string | undefined;
}

/** All modes run through Extension Host AgentLoop (Ask = read-only tools). */
function needsHostToolLoop(_mode: Mode): boolean {
  return true;
}

export function useChatStream(options: UseChatStreamOptions = {}): UseChatStreamReturn {
  const [streaming, setStreaming] = useState(false);
  /** Runtime-local in-flight host requests (supports multi-session parallel sends). */
  const runtimeRequestsRef = useRef<Map<string, Set<string>>>(new Map());
  /** Correlate host request id -> local abort controller. */
  const abortByRequestRef = useRef<Map<string, AbortController>>(new Map());
  const requestSeqRef = useRef(0);
  const idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const planStageRef = useRef(options.planStage);
  const debugStageRef = useRef(options.debugStage);
  const thinkingEffortRef = useRef(options.thinkingEffort);
  const onWorktreeResultRef = useRef(options.onWorktreeResult);
  planStageRef.current = options.planStage;
  debugStageRef.current = options.debugStage;
  thinkingEffortRef.current = options.thinkingEffort;
  onWorktreeResultRef.current = options.onWorktreeResult;

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== 'object') return;
      const type = String(data.type || '');
      if (
        type !== 'worktree.review.result' &&
        type !== 'worktree.apply.result' &&
        type !== 'worktree.reject.result'
      ) {
        return;
      }
      onWorktreeResultRef.current?.(data);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const postWorktreeMessage = useCallback(
    (type: 'worktree.review' | 'worktree.apply' | 'worktree.reject', subagentId: string) => {
      const id = String(subagentId || '').trim();
      if (!id) return undefined;
      const api = getVsCodeApi();
      if (!api?.postMessage) return undefined;
      const requestId = `${type}_${id}_${Date.now()}`;
      api.postMessage({ type, subagentId: id, requestId });
      return requestId;
    },
    []
  );

  const sendWorktreeReview = useCallback(
    (subagentId: string) => postWorktreeMessage('worktree.review', subagentId),
    [postWorktreeMessage]
  );
  const sendWorktreeApply = useCallback(
    (subagentId: string) => postWorktreeMessage('worktree.apply', subagentId),
    [postWorktreeMessage]
  );
  const sendWorktreeReject = useCallback(
    (subagentId: string) => postWorktreeMessage('worktree.reject', subagentId),
    [postWorktreeMessage]
  );

  const syncStreamingForActiveRuntime = useCallback(() => {
    const key = options.activeRuntimeKey;
    if (!key) {
      setStreaming(abortByRequestRef.current.size > 0);
      return;
    }
    const set = runtimeRequestsRef.current.get(key);
    setStreaming(Boolean(set && set.size > 0));
  }, [options.activeRuntimeKey]);

  const detachRequest = useCallback((runtimeKey: string, hostRequestId: string) => {
    abortByRequestRef.current.delete(hostRequestId);
    const bucket = runtimeRequestsRef.current.get(runtimeKey);
    if (bucket) {
      bucket.delete(hostRequestId);
      if (bucket.size === 0) runtimeRequestsRef.current.delete(runtimeKey);
    }
    syncStreamingForActiveRuntime();
  }, [syncStreamingForActiveRuntime]);

  const attachRequest = useCallback(
    (runtimeKey: string, hostRequestId: string, controller: AbortController) => {
      abortByRequestRef.current.set(hostRequestId, controller);
      const bucket =
        runtimeRequestsRef.current.get(runtimeKey) ?? new Set<string>();
      bucket.add(hostRequestId);
      runtimeRequestsRef.current.set(runtimeKey, bucket);
      syncStreamingForActiveRuntime();
    },
    [syncStreamingForActiveRuntime]
  );

  const stop = useCallback(() => {
    const runtimeKey = options.activeRuntimeKey;
    const requestIds = runtimeKey
      ? [...(runtimeRequestsRef.current.get(runtimeKey) ?? [])]
      : [...abortByRequestRef.current.keys()];
    if (requestIds.length === 0) return;

    const api = getVsCodeApi();
    for (const requestId of requestIds) {
      abortByRequestRef.current.get(requestId)?.abort();
      if (api) {
        // SHARED-001 — nested stop payload (matches host handleWebviewMessage)
        api.postMessage({ type: 'chat.stop', payload: { requestId } });
      }
      if (runtimeKey) {
        detachRequest(runtimeKey, requestId);
      } else {
        abortByRequestRef.current.delete(requestId);
        for (const [key, bucket] of runtimeRequestsRef.current.entries()) {
          bucket.delete(requestId);
          if (bucket.size === 0) runtimeRequestsRef.current.delete(key);
        }
        syncStreamingForActiveRuntime();
      }
    }
  }, [detachRequest, options.activeRuntimeKey]);

  useEffect(() => {
    syncStreamingForActiveRuntime();
  }, [syncStreamingForActiveRuntime, options.activeRuntimeKey]);

  /**
   * All modes: post chat.send → Extension Host runs tools → chat.stream events.
   * Ask uses the same path with read-only tool whitelist.
   */
  const sendViaHost = useCallback(
    async (
      messages: ChatMessage[],
      mode: Mode,
      onDelta: (delta: StreamDelta) => void,
      onComplete: () => void,
      onError: (err: string) => void,
      opts?: SendMessageOpts
    ) => {
      const api = getVsCodeApi();
      if (!api) {
        debugError('chat.send empty reply', 'blocked: no vscode API');
        onError(
          'Agent mode needs the Extension Host (open Agent K chat in VS Code / Extension Development Host).'
        );
        return;
      }

      const requestId = ++requestSeqRef.current;
      const runtimeKey = opts?.runtimeKey || options.activeRuntimeKey || 'global';
      const hostRequestId = `host_${runtimeKey}_${requestId}_${Date.now()}`;
      // Prefer per-send (tab) credentials — Composer model change must not rely on stale hook opts.
      const sendBaseUrl = String(opts?.baseUrl ?? options.baseUrl ?? '').replace(/\/$/, '');
      const sendModel = String(opts?.model ?? options.model ?? '').trim();
      const sendApiKey =
        opts?.apiKey !== undefined ? opts.apiKey : options.apiKey;

      if (!sendBaseUrl || !sendModel) {
        debugWarn('chat.send missing credentials', {
          runtimeKey,
          baseUrl: sendBaseUrl || '(empty)',
          model: sendModel || '(empty)'
        });
        onError(
          'No provider endpoint for this tab. Pick a model that belongs to a saved AI Provider connection.'
        );
        return;
      }

      const controller = new AbortController();
      attachRequest(runtimeKey, hostRequestId, controller);

      const hostIdleMs = Math.max(idleTimeoutMs, HOST_IDLE_TIMEOUT_MS);
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;
      let finished = false;

      const clearIdle = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
      };
      const bumpIdle = () => {
        clearIdle();
        idleTimer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          api.postMessage({ type: 'chat.stop', payload: { requestId: hostRequestId } });
        }, hostIdleMs);
      };
      bumpIdle();

      const finish = (fn: () => void) => {
        if (finished) return;
        finished = true;
        clearIdle();
        window.removeEventListener('message', onMsg);
        detachRequest(runtimeKey, hostRequestId);
        fn();
      };

      const onMsg = (event: MessageEvent) => {
        const data = event.data;
        // SHARED-001: host posts { type:'chat.stream', payload:{ requestId, event, ... } }
        if (!data || data.type !== 'chat.stream') return;
        const stream = (data.payload ?? data) as any;
        if (stream.requestId !== hostRequestId) return;
        bumpIdle();

        switch (stream.event) {
          case 'heartbeat':
            // Host keepalive while waiting on LLM / tools — reset idle only
            break;
          case 'status':
            if (stream.status) onDelta({ status: String(stream.status) });
            break;
          case 'delta':
            if (stream.content) onDelta({ content: String(stream.content) });
            // Host posts reasoning on the same event — was dropped → Thought empty + (no response).
            if (stream.reasoning) onDelta({ reasoning: String(stream.reasoning) });
            break;
          case 'tool.start':
            // Seal in-progress self-talk into Thought; clear body
            onDelta({
              clearContent: true,
              sealTurn:
                stream.turn != null && Number.isFinite(Number(stream.turn))
                  ? Number(stream.turn)
                  : undefined,
              workEvent:
                workEventFromHostPayload(
                  {
                    id: stream.id,
                    toolName: stream.toolName,
                    kind: stream.kind,
                    detail: stream.detail,
                    status: 'running'
                  },
                  'running'
                ) || undefined
            });
            break;
          case 'tool.end': {
            const workEvent = workEventFromHostPayload(
              {
                id: stream.id,
                toolName: stream.toolName,
                kind: stream.kind,
                detail: stream.detail,
                error: stream.error,
                status: stream.error ? 'error' : 'complete'
              },
              stream.error ? 'error' : 'complete'
            );
            if (workEvent) onDelta({ workEvent });
            break;
          }
          case 'file.edit': {
            onDelta({
              fileEdit: fileEditPreviewFromHost(data as Record<string, unknown>)
            });
            break;
          }
          case 'terminal.run': {
            onDelta({
              terminalRun: {
                id: String(stream.id || `term_${Date.now()}`),
                phase:
                  stream.phase === 'chunk' || stream.phase === 'end'
                    ? stream.phase
                    : 'start',
                command: stream.command != null ? String(stream.command) : undefined,
                description:
                  stream.description != null ? String(stream.description) : undefined,
                cwd: stream.cwd != null ? String(stream.cwd) : undefined,
                chunk: stream.chunk != null ? String(stream.chunk) : undefined,
                stream:
                  stream.stream === 'stderr' || stream.stream === 'stdout'
                    ? stream.stream
                    : undefined,
                exitCode:
                  stream.exitCode === null
                    ? null
                    : stream.exitCode != null
                      ? Number(stream.exitCode)
                      : undefined,
                error: stream.error != null ? String(stream.error) : undefined,
                durationMs:
                  stream.durationMs != null ? Number(stream.durationMs) : undefined,
                turn: stream.turn != null ? Number(stream.turn) : undefined,
                status:
                  stream.status === 'done' ||
                  stream.status === 'error' ||
                  stream.status === 'running'
                    ? stream.status
                    : undefined,
                toolId: stream.toolId != null ? String(stream.toolId) : undefined
              }
            });
            break;
          }
          // PRD-C0 §5.3 / PRD-Harness-13: forward turn timeline to ChatApp
          case 'timeline': {
            const kind = String(stream.kind || 'thinking') as NonNullable<
              StreamDelta['timeline']
            >['kind'];
            const itemStatus = (stream.status === 'done' || stream.status === 'error'
              ? stream.status
              : 'running') as 'running' | 'done' | 'error';
            onDelta({
              timeline: {
                kind,
                turn: Number(stream.turn) || 1,
                label: String(stream.label || kind),
                detail: stream.detail != null ? String(stream.detail) : undefined,
                toolName: stream.toolName != null ? String(stream.toolName) : undefined,
                thoughtRole:
                  stream.thoughtRole === 'opening' || stream.thoughtRole === 'mid'
                    ? stream.thoughtRole
                    : undefined,
                itemStatus,
                id: stream.id != null ? String(stream.id) : undefined,
                subagentId:
                  stream.subagentId != null ? String(stream.subagentId) : undefined,
                parentTurnId:
                  stream.parentTurnId != null
                    ? String(stream.parentTurnId)
                    : undefined
              },
              workEvent:
                workEventFromHostPayload(
                  {
                    id: stream.id,
                    toolName: stream.toolName,
                    kind: stream.kind,
                    detail: stream.detail,
                    status: itemStatus === 'done' ? 'complete' : itemStatus,
                    error:
                      itemStatus === 'error' && stream.error
                        ? String(stream.error)
                        : undefined,
                    subagentId:
                      stream.subagentId != null
                        ? String(stream.subagentId)
                        : undefined,
                    parentTurnId:
                      stream.parentTurnId != null
                        ? String(stream.parentTurnId)
                        : undefined
                  },
                  itemStatus === 'done' ? 'complete' : itemStatus
                ) || undefined
            });
            break;
          }
          case 'subagent.event': {
            const workEvent = workEventFromSubagentHostEvent(
              data as Record<string, unknown>
            );
            if (workEvent) onDelta({ workEvent });
            break;
          }
          case 'ask_question':
            // Pause idle watchdog while host waits on user (can be minutes)
            clearIdle();
            // Pause "Streaming…" chrome — user must answer ClarifyingQuestions
            onDelta({
              status: 'asking',
              askQuestion: {
                id: String(stream.qid || ''),
                question: String(stream.question || ''),
                options: Array.isArray(stream.options)
                  ? stream.options.map((o: unknown) => String(o))
                  : undefined,
                required: stream.required !== false,
                allowMultiple: Boolean(
                  stream.allowMultiple ?? stream.allow_multiple
                )
              },
            });
            break;
          case 'debug.stage':
            onDelta({
              debugStage: stream.stage != null ? String(stream.stage) : undefined,
            });
            break;
          case 'complete':
            debugLog('chat.send empty reply', '← chat.stream complete', hostRequestId, {
              contentLen: stream.content != null ? String(stream.content).length : 0
            });
            finish(() => {
              // Parallel-tab catch-up: host final body heals dropped deltas.
              if (stream.content != null && String(stream.content).length > 0) {
                onDelta({ replaceContent: String(stream.content) });
              }
              onComplete();
            });
            break;
          case 'stopped':
            debugLog('chat.send empty reply', '← chat.stream stopped', hostRequestId);
            finish(() => onComplete());
            break;
          case 'error':
            debugError(
              'chat.send empty reply',
              '← chat.stream error',
              hostRequestId,
              stream.error || stream.message
            );
            finish(() =>
              onError(
                String(
                  stream.error ||
                    stream.message ||
                    stream.detail ||
                    'Host tool loop error'
                )
              )
            );
            break;
          default:
            break;
        }
      };

      window.addEventListener('message', onMsg);

      // AbortSignal from stop()/timeout
      controller.signal.addEventListener('abort', () => {
        if (timedOut && !finished) {
          finish(() =>
            onError(
              `No tokens received for ${Math.round(hostIdleMs / 1000)}s — request timed out`
            )
          );
        } else if (!finished) {
          // User stop — ChatApp cleans bubbles; do not call onError
          finish(() => {});
        }
      });

      // SHARED-001 nested payload — host reads msg.payload (flat send crashed → Streaming stuck)
      debugLog('chat.send empty reply', '→ chat.send', {
        requestId: hostRequestId,
        sessionId: runtimeKey,
        mode,
        model: sendModel,
        baseUrl: sendBaseUrl.slice(0, 48),
        msgs: messages.length
      });
      api.postMessage({
        type: 'chat.send',
        payload: {
          requestId: hostRequestId,
          // Parallel tabs: host aborts only this session's in-flight Plan V2 generate.
          sessionId: runtimeKey,
          mode,
          planStage: opts?.planStageOverride || planStageRef.current,
          debugStage: debugStageRef.current,
          thinkingEffort: thinkingEffortRef.current || 'medium',
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content
          })),
          baseUrl: sendBaseUrl,
          apiKey: sendApiKey,
          model: sendModel,
          ...(opts?.inlineEdit ? { inlineEdit: opts.inlineEdit } : {})
        }
      });
    },
    [options.baseUrl, options.apiKey, options.model, idleTimeoutMs]
  );

  const sendMessage = useCallback(
    async (
      text: string,
      files: Attachment[],
      messages: ChatMessage[],
      mode: Mode,
      onDelta: (delta: StreamDelta) => void,
      onComplete: () => void,
      onError: (err: string) => void,
      opts?: SendMessageOpts
    ) => {
      // Agent path: host executes tools (glob/read_file). Ask stays webview completions.
      if (needsHostToolLoop(mode)) {
        await sendViaHost(messages, mode, onDelta, onComplete, onError, opts);
        return;
      }

      const requestId = ++requestSeqRef.current;
      const runtimeKey = opts?.runtimeKey || options.activeRuntimeKey || 'global';
      const directRequestId = `direct_${runtimeKey}_${requestId}_${Date.now()}`;
      const controller = new AbortController();
      attachRequest(runtimeKey, directRequestId, controller);

      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;

      const clearIdle = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
      };

      const bumpIdle = () => {
        clearIdle();
        idleTimer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, idleTimeoutMs);
      };

      bumpIdle();

      if (!options.baseUrl?.trim() || !options.model?.trim()) {
        throw new Error(
          'No provider configured. Open Settings → AI Providers and add a connection.'
        );
      }

      try {
        const response = await fetch(`${options.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(options.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: options.model,
            messages: messages.map(m => ({
              role: m.role,
              content: m.content
            })),
            stream: true,
            temperature: 0.7,
            max_tokens: 4096,
            // Prefer Thought UI when server supports reasoning_content
            enable_thinking: (thinkingEffortRef.current || 'medium') !== 'off',
            reasoning_effort:
              (thinkingEffortRef.current || 'medium') === 'off'
                ? undefined
                : thinkingEffortRef.current || 'medium',
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`API Error: ${response.status} - ${error}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            // Stale request superseded by a newer send — stop reading
            const { done, value } = await reader.read();
            if (done) break;

            bumpIdle(); // any chunk resets no-token timer
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  onComplete();
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta;
                  let painted = false;
                  if (delta?.content) {
                    bumpIdle();
                    onDelta({ content: delta.content });
                    painted = true;
                  }
                  const reasoning =
                    delta?.reasoning_content || delta?.reasoning;
                  if (reasoning) {
                    bumpIdle();
                    onDelta({ reasoning: String(reasoning) });
                    painted = true;
                  }
                  // One TCP/SSE batch can hold many tokens — yield so React paints
                  // between chunks (Thought already felt live; answer should too)
                  if (painted) {
                    await new Promise<void>((r) => setTimeout(r, 0));
                  }
                } catch {
                  // Ignore parse errors for incomplete JSON
                }
              }
            }
          }
          // Stream ended without [DONE]
          onComplete();
        } finally {
          reader.releaseLock();
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          if (timedOut) {
            onError(`No tokens received for ${Math.round(idleTimeoutMs / 1000)}s — request timed out`);
          }
          // User/resynth abort: ChatApp cleans bubbles; do not call onError
        } else {
          onError(e instanceof Error ? e.message : 'Unknown error');
        }
      } finally {
        clearIdle();
        detachRequest(runtimeKey, directRequestId);
      }
    },
    [options.baseUrl, options.apiKey, options.model, idleTimeoutMs, sendViaHost, options.activeRuntimeKey, attachRequest, detachRequest]
  );

  const regenerate = useCallback(async (
    messages: ChatMessage[],
    mode: Mode,
    onDelta: (delta: StreamDelta) => void,
    onComplete: () => void,
    onError: (err: string) => void,
    onRegenerateStart?: () => void
  ) => {
    const apiMessages = apiHistoryForRegenerate(messages);
    if (!apiMessages || apiMessages.length === 0) return;
    const lastUserMsg = apiMessages[apiMessages.length - 1];
    if (lastUserMsg.role !== 'user') return;

    onRegenerateStart?.();

    await sendMessage(
      lastUserMsg.content,
      lastUserMsg.attachments || [],
      apiMessages,
      mode,
      onDelta,
      onComplete,
      onError
    );
  }, [sendMessage]);

  return {
    streaming,
    sendMessage,
    stop,
    regenerate,
    sendWorktreeReview,
    sendWorktreeApply,
    sendWorktreeReject
  };
}
