import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, Mode, Attachment, StreamDelta } from '../types';

/** No-token idle timeout — Ask path default */
const IDLE_TIMEOUT_MS = 30_000;
/** Host agent loops wait on LLM between tools; need longer + heartbeats */
const HOST_IDLE_TIMEOUT_MS = 120_000;

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
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high';
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
    onError: (err: string) => void
  ) => Promise<void>;
  stop: () => void;
  regenerate: (
    messages: ChatMessage[],
    mode: Mode,
    onDelta: (delta: StreamDelta) => void,
    onComplete: () => void,
    onError: (err: string) => void
  ) => Promise<void>;
}

function getVsCodeApi(): { postMessage: (msg: unknown) => void } | null {
  try {
    const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    return api?.postMessage ? api : null;
  } catch {
    return null;
  }
}

/** All modes run through Extension Host AgentLoop (Ask = read-only tools). */
function needsHostToolLoop(_mode: Mode): boolean {
  return true;
}

export function useChatStream(options: UseChatStreamOptions = {}): UseChatStreamReturn {
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Monotonic id so a stale request's finally cannot clear a newer stream. */
  const requestIdRef = useRef(0);
  /** Correlate host chat.stream events */
  const hostRequestIdRef = useRef<string | null>(null);
  const idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const planStageRef = useRef(options.planStage);
  const debugStageRef = useRef(options.debugStage);
  const thinkingEffortRef = useRef(options.thinkingEffort);
  planStageRef.current = options.planStage;
  debugStageRef.current = options.debugStage;
  thinkingEffortRef.current = options.thinkingEffort;

  const stop = useCallback(() => {
    abortRef.current?.abort();
    // Tell host to abort in-flight tool loop
    const api = getVsCodeApi();
    if (api && hostRequestIdRef.current) {
      api.postMessage({ type: 'chat.stop', requestId: hostRequestIdRef.current });
    }
    hostRequestIdRef.current = null;
    // Bump request id so a late finally from a superseded race cannot revive streaming
    requestIdRef.current += 1;
    abortRef.current = null;
    setStreaming(false);
  }, []);

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
      onError: (err: string) => void
    ) => {
      const api = getVsCodeApi();
      if (!api) {
        onError(
          'Agent mode needs the Extension Host (open Agent K chat in VS Code / Extension Development Host).'
        );
        return;
      }

      abortRef.current?.abort();
      const requestId = ++requestIdRef.current;
      const hostRequestId = `host_${requestId}_${Date.now()}`;
      hostRequestIdRef.current = hostRequestId;
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

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
          api.postMessage({ type: 'chat.stop', requestId: hostRequestId });
        }, hostIdleMs);
      };
      bumpIdle();

      const finish = (fn: () => void) => {
        if (finished || requestId !== requestIdRef.current) return;
        finished = true;
        clearIdle();
        window.removeEventListener('message', onMsg);
        hostRequestIdRef.current = null;
        setStreaming(false);
        abortRef.current = null;
        fn();
      };

      const onMsg = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.type !== 'chat.stream' || data.requestId !== hostRequestId) {
          return;
        }
        if (requestId !== requestIdRef.current) return;
        bumpIdle();

        switch (data.event) {
          case 'heartbeat':
            // Host keepalive while waiting on LLM / tools — reset idle only
            break;
          case 'status':
            if (data.status) onDelta({ status: String(data.status) });
            break;
          case 'delta':
            if (data.content) onDelta({ content: String(data.content) });
            break;
          case 'tool.start':
            // Seal in-progress prose into turnProse (after Thought); clear body
            onDelta({
              clearContent: true,
              sealTurn:
                data.turn != null && Number.isFinite(Number(data.turn))
                  ? Number(data.turn)
                  : undefined
            });
            break;
          case 'file.edit': {
            const lines = Array.isArray(data.lines) ? data.lines : [];
            onDelta({
              fileEdit: {
                id: `fe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                path: String(data.path || ''),
                absPath: data.absPath != null ? String(data.absPath) : undefined,
                checkpointId:
                  data.checkpointId != null ? String(data.checkpointId) : undefined,
                turn: data.turn != null ? Number(data.turn) : undefined,
                additions: Number(data.additions) || 0,
                deletions: Number(data.deletions) || 0,
                lines: lines.map((l: any) => ({
                  type:
                    l?.type === 'add' || l?.type === 'delete'
                      ? l.type
                      : ('context' as const),
                  lineNumber: Number(l?.lineNumber) || 0,
                  text: String(l?.text ?? '')
                }))
              }
            });
            break;
          }
          case 'terminal.run': {
            onDelta({
              terminalRun: {
                id: String(data.id || `term_${Date.now()}`),
                phase:
                  data.phase === 'chunk' || data.phase === 'end'
                    ? data.phase
                    : 'start',
                command: data.command != null ? String(data.command) : undefined,
                description:
                  data.description != null ? String(data.description) : undefined,
                cwd: data.cwd != null ? String(data.cwd) : undefined,
                chunk: data.chunk != null ? String(data.chunk) : undefined,
                stream:
                  data.stream === 'stderr' || data.stream === 'stdout'
                    ? data.stream
                    : undefined,
                exitCode:
                  data.exitCode === null
                    ? null
                    : data.exitCode != null
                      ? Number(data.exitCode)
                      : undefined,
                error: data.error != null ? String(data.error) : undefined,
                durationMs:
                  data.durationMs != null ? Number(data.durationMs) : undefined,
                turn: data.turn != null ? Number(data.turn) : undefined,
                status:
                  data.status === 'done' ||
                  data.status === 'error' ||
                  data.status === 'running'
                    ? data.status
                    : undefined
              }
            });
            break;
          }
          // PRD-C0 §5.3 / PRD-Harness-13: forward turn timeline to ChatApp
          case 'timeline': {
            const kind = String(data.kind || 'thinking') as NonNullable<
              StreamDelta['timeline']
            >['kind'];
            const itemStatus = (data.status === 'done' || data.status === 'error'
              ? data.status
              : 'running') as 'running' | 'done' | 'error';
            onDelta({
              timeline: {
                kind,
                turn: Number(data.turn) || 1,
                label: String(data.label || kind),
                detail: data.detail != null ? String(data.detail) : undefined,
                toolName: data.toolName != null ? String(data.toolName) : undefined,
                itemStatus,
                id: data.id != null ? String(data.id) : undefined
              }
            });
            break;
          }
          case 'ask_question':
            // Pause "Streaming…" chrome — user must answer ClarifyingQuestions
            onDelta({
              status: 'asking',
              askQuestion: {
                id: String(data.qid || ''),
                question: String(data.question || ''),
                options: Array.isArray(data.options)
                  ? data.options.map((o: unknown) => String(o))
                  : undefined,
                required: data.required !== false,
              },
            });
            break;
          case 'debug.stage':
            onDelta({
              debugStage: data.stage != null ? String(data.stage) : undefined,
            });
            break;
          case 'complete':
            finish(() => onComplete());
            break;
          case 'error':
            finish(() =>
              onError(String(data.error || 'Host tool loop error'))
            );
            break;
          default:
            break;
        }
      };

      window.addEventListener('message', onMsg);

      // AbortSignal from stop()/timeout
      controller.signal.addEventListener('abort', () => {
        if (timedOut && !finished && requestId === requestIdRef.current) {
          finish(() =>
            onError(
              `No tokens received for ${Math.round(hostIdleMs / 1000)}s — request timed out`
            )
          );
        } else if (!finished && requestId === requestIdRef.current) {
          // User stop — ChatApp cleans bubbles; do not call onError
          finish(() => {});
        }
      });

      api.postMessage({
        type: 'chat.send',
        requestId: hostRequestId,
        mode,
        planStage: planStageRef.current,
        debugStage: debugStageRef.current,
        thinkingEffort: thinkingEffortRef.current || 'medium',
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content
        })),
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        model: options.model
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
      onError: (err: string) => void
    ) => {
      // Agent path: host executes tools (glob/read_file). Ask stays webview completions.
      if (needsHostToolLoop(mode)) {
        await sendViaHost(messages, mode, onDelta, onComplete, onError);
        return;
      }

      // One in-flight request: abort previous before starting (resynth / double-send safety)
      abortRef.current?.abort();

      const requestId = ++requestIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

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

      try {
        const response = await fetch(`${options.baseUrl || 'http://127.0.0.1:4000'}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(options.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: options.model || 'qwen3.6-35b-a3b',
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
            if (requestId !== requestIdRef.current) break;

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
                  if (requestId === requestIdRef.current) onComplete();
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta;
                  let painted = false;
                  if (delta?.content) {
                    bumpIdle();
                    if (requestId === requestIdRef.current) {
                      onDelta({ content: delta.content });
                      painted = true;
                    }
                  }
                  const reasoning =
                    delta?.reasoning_content || delta?.reasoning;
                  if (reasoning) {
                    bumpIdle();
                    if (requestId === requestIdRef.current) {
                      onDelta({ reasoning: String(reasoning) });
                      painted = true;
                    }
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
          if (requestId === requestIdRef.current) onComplete();
        } finally {
          reader.releaseLock();
        }
      } catch (e) {
        if (requestId !== requestIdRef.current) {
          // Superseded — ignore
        } else if (e instanceof Error && e.name === 'AbortError') {
          if (timedOut) {
            onError(`No tokens received for ${Math.round(idleTimeoutMs / 1000)}s — request timed out`);
          }
          // User/resynth abort: ChatApp cleans bubbles; do not call onError
        } else {
          onError(e instanceof Error ? e.message : 'Unknown error');
        }
      } finally {
        clearIdle();
        // Only the active request may clear streaming (prevents abort race flipping flag early)
        if (requestId === requestIdRef.current) {
          setStreaming(false);
          abortRef.current = null;
        }
      }
    },
    [options.baseUrl, options.apiKey, options.model, idleTimeoutMs, sendViaHost]
  );

  const regenerate = useCallback(async (
    messages: ChatMessage[],
    mode: Mode,
    onDelta: (delta: StreamDelta) => void,
    onComplete: () => void,
    onError: (err: string) => void
  ) => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    const idx = messages.findIndex(m => m.id === lastUserMsg.id);
    const newMessages = messages.slice(0, idx + 1);

    await sendMessage(
      lastUserMsg.content,
      lastUserMsg.attachments || [],
      newMessages,
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
    regenerate
  };
}
