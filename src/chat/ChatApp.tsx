/**
 * ChatApp - 메인 채팅 애플리케이션 (C5-C7 UI 통합)
 *
 * mode=plan → PlanModeHeader + ClarifyingQuestions/PlanEditor
 * mode=debug → DebugModeUI 패널
 * ⚙️ 설정 → SettingsPanel
 * ask_question 도구 → ClarifyingQuestions 모달
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MessageBubble } from './components/MessageBubble';
import { Composer } from './components/Composer';
import { ChangedFilesBar } from './components/ChangedFilesBar';
import type { FileEditPreview } from './types';
import { useChatStream } from './hooks/useChatStream';
import { configManager } from '../core/ConfigManager';
import type { ChatMessage, Mode, StreamDelta, Attachment } from './types';
import './chat.css';

// C5-C7 UI 컴포넌트 (RW-C57-02: ChatApp 마운트)
import { PlanModeHeader } from './components/PlanModeHeader';
import type { PlanStage } from '../plan/PlanModeController';
import { PlanModeController } from '../plan/PlanModeController';
import { ClarifyingQuestions } from '../plan/ClarifyingQuestions';
import { PlanEditor } from '../plan/PlanEditor';
import { DebugModeUI } from './components/DebugModeUI';
import { DebugTimeline } from './components/DebugTimeline';
import { DebugModeController } from '../debug/DebugModeController';
import type { DebugStage, Hypothesis } from '../debug/DebugModeController';
import { SettingsPanel } from '../settings/SettingsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { ChatSessionStore } from './ChatSessionStore';
import type { ChatSessionMeta } from './ChatSessionStore';
// RW-C5-02: ask_question 도구 → ClarifyingQuestions 브리지
import { askQuestionTool } from '../tools/session/AskQuestionTool';
import type { PendingQuestion } from '../tools/session/AskQuestionTool';
// RW-C5-04: Plan → Agent 핸드오프
import { PlanToAgent } from '../plan/PlanToAgent';
// RW-C6-05-R2: ReproduceUI 대기 루프
import { ReproduceUI } from '../debug/ReproduceUI';
import { requestReproduceTool } from '../tools/debug/RequestReproduceTool';
import { RuntimeServices } from '../core/RuntimeServices';
// RW-P0-04: Interrupt & Resynthesize
import { MessageQueue } from '../loop/MessageQueue';
import { QueueUI } from './components/MessageQueueUI';
import { StopHandler } from '../loop/StopHandler';
import { buildResynthesizeMessages, stripResynthForDisplay } from '../loop/synthesizeInstructions';
import type { AgentMessage } from '../loop/AgentLoopController';
// RW-C7-05 / RW-C7-06 / RW-C7-10
import { DesignModePanel, designModeContext } from '../browser/DesignModePanel';
import { FindingList } from '../review/FindingList';
import { AcceptFix } from '../review/AcceptFix';
import type { ReviewFinding } from '../review/AgentReviewLoop';
import { modeRegistry } from '../agent/modeRegistry';
import { ArtifactGallery } from '../artifacts/ArtifactGallery';
import type { Artifact } from '../artifacts/ArtifactStore';
import { UXForMediumPanel } from '../harness/UXForMediumPanel';
import type { HarnessUXState, UXEventType } from '../harness/UXForMedium';
import {
  buildHarnessTurnContext,
  prependHarnessToUserPayload,
  stripHarnessForDisplay
} from './harnessBridge';
import { sanitizeOpeningLead, splitStreamingLead } from './openingLead';
import { sealBodyBeforeTools } from './sealTurnProse';
import { stripFakeToolMarkup } from './displaySanitize';
import {
  getRegisteredModels,
  persistProviderModel
} from './providerModels';

const MODE_LABELS: Record<Mode, string> = {
  ask: 'Ask',
  agent: 'Agent',
  plan: 'Plan',
  debug: 'Debug'
};

const MODE_TOOLTIPS: Record<Mode, string> = {
  ask: 'Read-only exploration. No file edits.',
  agent: 'Autonomous implementation. Tools: read, edit, terminal.',
  plan: 'Design first. Outputs PLAN.md with Mermaid.',
  debug: 'Hypothesis → Instrument → Reproduce → Minimal fix.'
};

function shortModelName(raw: string): string {
  const base = (raw || '').split('/').pop() || raw || 'model';
  return base.length > 32 ? `${base.slice(0, 30)}…` : base;
}

/** Dedupe session file edits by path (latest wins) */
function collectSessionFileEdits(messages: ChatMessage[]): FileEditPreview[] {
  const map = new Map<string, FileEditPreview>();
  for (const m of messages) {
    if (!Array.isArray(m.fileEdits)) continue;
    for (const fe of m.fileEdits) {
      const key = (fe.absPath || fe.path || '').replace(/\\/g, '/');
      if (!key) continue;
      map.set(key, fe);
    }
  }
  return [...map.values()];
}

const sessionStore = new ChatSessionStore();

function sanitizeLoadedMessages(parsed: ChatMessage[]): ChatMessage[] {
  return parsed
    .map((m) => {
      if (m.role === 'user') {
        let content = stripHarnessForDisplay(m.content);
        content = stripResynthForDisplay(content);
        return { ...m, content };
      }
      if (m.role === 'assistant') {
        return { ...m, content: stripFakeToolMarkup(m.content) };
      }
      return m;
    })
    .map((m) =>
      m.role === 'assistant' && m.status === 'streaming'
        ? {
            ...m,
            status: m.content?.trim() ? 'complete' : 'error',
            content: m.content?.trim() || '(interrupted)'
          }
        : m
    );
}

export function ChatApp() {
  const [sessionId, setSessionId] = useState(() => sessionStore.loadActive().id);
  const [sessionList, setSessionList] = useState<ChatSessionMeta[]>(() => sessionStore.list());
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const active = sessionStore.loadActive();
    return sanitizeLoadedMessages(active.messages || []);
  });
  const [mode, setMode] = useState<Mode>(() => sessionStore.loadActive().mode || 'agent');
  const [error, setError] = useState<string | null>(null);

  // HARB: 중급 모델 UX 상태바
  const [uxState, setUxState] = useState<HarnessUXState>({
    tier: 'A',
    modelName: 'flash',
    toolsUsed: 0,
    maxTools: 4,
    prefetchCount: 0,
    prefetchLatencyMs: 0,
    verificationRetries: 0,
    doomLoopDetected: false,
    latencyMs: 0,
    contextTokens: 0
  });
  const [stuckEvent, setStuckEvent] = useState<UXEventType | null>(null);

  // Cursor-style: steps attach to the streaming assistant bubble (not a top panel)
  const stepStartRef = useRef<Record<string, number>>({});

  // ─── C5-C7 UI 상태 ─────────────────────────────────────
  // Plan mode state
  const [planController] = useState(() => new PlanModeController());
  const [planStage, setPlanStage] = useState<PlanStage>('research');
  const [showClarifying, setShowClarifying] = useState(false);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  // Clarifying questions via AskQuestionTool bridge (RW-C5-02)
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  /** True while host is blocked on ask_question — Composer shows Waiting… not Streaming… */
  const [awaitingUser, setAwaitingUser] = useState(false);

  // Debug mode controller (RW-C6-01)
  const [debugController] = useState(() => new DebugModeController());
  const [, setDebugTick] = useState(0);
  // RW-C6-05-R2: Reproduce overlay
  const [showReproduce, setShowReproduce] = useState(false);
  const [reproduceSteps, setReproduceSteps] = useState<{ order: number; description: string }[]>([]);
  const [reproduceHypothesisId, setReproduceHypothesisId] = useState('debug');

  // Settings / History / Design / Review / Artifacts
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'models' | 'secrets' | 'permission' | 'queue' | 'harness' | 'context' | 'mcp' | 'features' | 'privacy'>('models');
  const [showDesignMode, setShowDesignMode] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewFindings, setReviewFindings] = useState<ReviewFinding[]>([]);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  // RW-P0-04: MessageQueue (debounce from config, default 300ms)
  const [msgQueue] = useState(() => {
    const ms =
      Number(configManager.get('agent-k.queue.resynthesizeDebounceMs')) ||
      Number(configManager.get('agent-k.queue.debounceMs')) ||
      300;
    return new MessageQueue(ms);
  });
  const [queueTick, setQueueTick] = useState(0);
  const stopHandlerRef = useRef<StopHandler | null>(null);

  const [providerModel, setProviderModel] = useState(() =>
    String(configManager.get('agent-k.provider.model') || 'mlx-community/Qwen3.6-35B-A3B-4bit')
  );
  const [providerBaseUrl, setProviderBaseUrl] = useState(() =>
    String(configManager.get('agent-k.provider.baseUrl') || 'http://127.0.0.1:52415')
  );
  const [providerApiKey, setProviderApiKey] = useState(() =>
    String(configManager.get('agent-k.provider.apiKey') || '')
  );
  const [providerType, setProviderType] = useState(() =>
    String(configManager.get('agent-k.provider.type') || 'litellm')
  );
  const [registeredModels, setRegisteredModels] = useState<string[]>(() => getRegisteredModels());
  const [modelContextBudget, setModelContextBudget] = useState<number>(() =>
    Number(configManager.get('agent-k.context.budget')) || 100000
  );
  const [modelContextSource, setModelContextSource] = useState<string>('fallback');

  useEffect(() => {
    const unsubs = [
      configManager.on('agent-k.provider.model', (_k, v) => {
        setProviderModel(String(v || ''));
      }),
      configManager.on('agent-k.provider.baseUrl', (_k, v) => {
        setProviderBaseUrl(String(v || ''));
      }),
      configManager.on('agent-k.provider.apiKey', (_k, v) => {
        setProviderApiKey(String(v || ''));
      }),
      configManager.on('agent-k.provider.models', () => {
        setRegisteredModels(getRegisteredModels());
      })
    ];
    // One-time migrate / prune bloated legacy catalog
    setRegisteredModels(getRegisteredModels());
    return () => unsubs.forEach((u) => u());
  }, []);

  const { streaming, sendMessage, stop, regenerate } = useChatStream({
    baseUrl: providerBaseUrl || 'http://127.0.0.1:52415',
    model: providerModel,
    apiKey: providerApiKey || undefined
  });

  const queuedMessageRef = useRef<string | null>(null);
  const turnNumberRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /** Bumped on stop/resynth so in-flight handleSend (awaiting harness) is abandoned. */
  const sendEpochRef = useRef(0);
  /** Sticky bottom scroll — pause if user scrolls up (Cursor-like) */
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const scrollMessagesToBottom = useCallback((force = false) => {
    if (!force && !stickToBottomRef.current) return;
    const list = messageListRef.current;
    const end = messageEndRef.current;
    const run = () => {
      if (!force && !stickToBottomRef.current) return;
      if (end) {
        end.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' });
      }
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, []);

  const onMessageListScroll = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = gap < 96;
  }, []);

  // Pin to bottom on new messages / streaming tokens
  useEffect(() => {
    if (streaming) stickToBottomRef.current = true;
    scrollMessagesToBottom(streaming);
  }, [messages, streaming, scrollMessagesToBottom]);

  // Follow DOM growth (Thought / markdown) while streaming
  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;

    const nudge = () => {
      if (stickToBottomRef.current || streaming) scrollMessagesToBottom(true);
    };

    const mo = new MutationObserver(nudge);
    mo.observe(list, { childList: true, subtree: true, characterData: true });

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(nudge);
      ro.observe(list);
    }

    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, [streaming, scrollMessagesToBottom]);

  useEffect(() => {
    return msgQueue.subscribe(() => setQueueTick((t) => t + 1));
  }, [msgQueue]);

  useEffect(() => {
    stopHandlerRef.current = new StopHandler({ abort: stop, queue: msgQueue });
  }, [stop, msgQueue]);

  /** New chat: archive current transcript, start empty session. */
  const handleNewChat = useCallback(() => {
    if (streaming) {
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current += 1;
    }
    if (messages.length === 0) {
      setShowHistory(false);
      setError(null);
      return;
    }
    sessionStore.saveMessages(sessionId, messages, mode);
    const next = sessionStore.createEmpty(mode);
    setSessionId(next.id);
    setMessages([]);
    stepStartRef.current = {};
    setSessionList(sessionStore.list());
    setError(null);
    setShowHistory(false);
  }, [streaming, messages, sessionId, mode]);

  const handleOpenSession = useCallback(
    (id: string) => {
      if (id === sessionId) {
        setShowHistory(false);
        return;
      }
      if (streaming) {
        stopHandlerRef.current?.stop('user_stop');
        sendEpochRef.current += 1;
      }
      if (messages.length > 0) {
        sessionStore.saveMessages(sessionId, messages, mode);
      }
      const loaded = sessionStore.switchTo(id);
      if (!loaded) return;
      setSessionId(loaded.id);
      setMessages(sanitizeLoadedMessages(loaded.messages || []));
      setMode(loaded.mode || 'agent');
      stepStartRef.current = {};
      setSessionList(sessionStore.list());
      setError(null);
      setShowHistory(false);
    },
    [sessionId, streaming, messages, mode]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      if (streaming && id === sessionId) {
        stopHandlerRef.current?.stop('user_stop');
        sendEpochRef.current += 1;
      }
      const next = sessionStore.delete(id);
      setSessionList(sessionStore.list());
      if (!next) return;
      if (id === sessionId) {
        setSessionId(next.id);
        setMessages(sanitizeLoadedMessages(next.messages || []));
        setMode(next.mode || 'agent');
        stepStartRef.current = {};
        setError(null);
      }
    },
    [streaming, sessionId]
  );

  // Host commands → panel toggles + session.new
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'session.new') {
        handleNewChat();
        return;
      }
      if (data.type === 'ui.history.open') {
        setShowHistory(true);
        return;
      }
      if (data.type === 'ui.design.open') setShowDesignMode(true);
      if (data.type === 'ui.review.open') {
        setShowReview(true);
        // Static sample findings when git review not available in webview
        setReviewFindings((prev) =>
          prev.length
            ? prev
            : [
                {
                  id: 'f-demo',
                  file: 'src/example.ts',
                  line: 1,
                  severity: 'warning',
                  message: 'Review session started. Run Agent Review on dirty files.',
                  suggestion: 'Open a dirty workspace and Accept Fix to apply patches.'
                }
              ]
        );
      }
      if (data.type === 'ui.artifacts.open') setShowArtifacts(true);
      if (data.type === 'settings.open') {
        if (typeof data.tab === 'string') setSettingsTab(data.tab);
        setShowSettings(true);
      }
      if (data.type === 'model.context') {
        const n = Number(data.maxInputTokens);
        if (Number.isFinite(n) && n > 0) {
          setModelContextBudget(Math.floor(n));
        }
        if (typeof data.source === 'string') {
          setModelContextSource(data.source);
        }
        if (typeof data.providerType === 'string') {
          setProviderType(data.providerType);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [handleNewChat]);

  useEffect(() => {
    const delay = streaming ? 400 : 0;
    const t = window.setTimeout(() => {
      sessionStore.saveMessages(sessionId, messages, mode);
      setSessionList(sessionStore.list());
    }, delay);
    return () => window.clearTimeout(t);
  }, [messages, sessionId, mode, streaming]);

  // RW-C6-05-R2: mount ReproduceUI when tool wait starts (callback + poll)
  useEffect(() => {
    requestReproduceTool.onPendingCallback((req) => {
      setReproduceHypothesisId(req.hypothesisId);
      setReproduceSteps(req.steps.map((s, i) => ({ order: i + 1, description: s })));
      setShowReproduce(true);
    });
    const id = setInterval(() => {
      const pending = RuntimeServices.isReproducePending();
      if (pending && !showReproduce) {
        const req = requestReproduceTool.getPending();
        setReproduceHypothesisId(req?.hypothesisId || 'active');
        setReproduceSteps(
          (req?.steps || ['Follow the reproduce steps, then click Reproduced.']).map((s, i) => ({
            order: i + 1,
            description: s
          }))
        );
        setShowReproduce(true);
      }
      if (!pending && showReproduce) {
        setShowReproduce(false);
      }
    }, 400);
    return () => {
      clearInterval(id);
      requestReproduceTool.onPendingCallback(() => {});
    };
  }, [showReproduce]);

  const handleReproduced = useCallback(() => {
    RuntimeServices.resolveReproduce(true);
    setShowReproduce(false);
  }, []);

  const handleReproduceCancel = useCallback(() => {
    RuntimeServices.resolveReproduce(false);
    setShowReproduce(false);
  }, []);

  // ─── Plan mode lifecycle (RW-C5-01) ───────────────────
  useEffect(() => {
    planController.onStageChangeCallback((stage: PlanStage) => {
      setPlanStage(stage);
      setShowClarifying(stage === 'questions');
      setShowPlanEditor(stage === 'planning' || stage === 'review');
    });
    // Build-ready: switch to Agent mode with plan context (RW-C5-04)
    planController.onBuildReadyCallback((_context: string) => {
      const planState = planController.getState();
      if (planState.planDocument) {
        const planToAgent = new PlanToAgent();
        planToAgent.setPlanDocument(planState.planDocument);
        const transition = planToAgent.buildTransitionContext(
          planState.planDocument,
          planState.researchResults,
          planState.questions.map(q => ({ question: q.question, answer: q.answer }))
        );
        // Set mode to agent — tools like edit_file/write_file become available
        setMode('agent');
        setMessages([]);
        // Queue the plan execution context as the first agent message
        const msgContent: string = transition.messages[0]?.content ?? _context;
        queuedMessageRef.current = msgContent;
      } else {
        // Fallback: simple context string
        setMode('agent');
        setMessages([]);
        queuedMessageRef.current = `I have approved the plan. Here is the context:\n\n${_context}\n\nPlease execute the plan step by step.`;
      }
    });
  }, [planController]);

  // ─── AskQuestionTool in-process callback (same-bundle tests only)
  // Live Agent path uses host postMessage ask_question → delta.askQuestion
  useEffect(() => {
    askQuestionTool.onNewQuestionCallback((q: PendingQuestion) => {
      setPendingQuestions(prev => {
        if (prev.find(p => p.id === q.id)) return prev;
        planController.addQuestion({ id: q.id, question: q.question });
        return [...prev, q];
      });
      setShowClarifying(true);
      setAwaitingUser(true);
    });
    return () => {
      askQuestionTool.onNewQuestionCallback(() => {});
    };
  }, [planController]);

  // ─── Debug mode lifecycle (RW-C6-01) ──────────────────
  // Force re-render when debug controller state changes
  useEffect(() => {
    debugController.onStageChangeCallback((_stage: DebugStage) => {
      setDebugTick(t => t + 1);
    });
  }, [debugController]);

  // Reset debug chrome when leaving debug (keep chat messages)
  useEffect(() => {
    if (mode !== 'debug') {
      debugController.reset();
    }
  }, [mode, debugController]);

  // Reset plan chrome when leaving plan (keep chat messages)
  useEffect(() => {
    if (mode !== 'plan') {
      planController.reset();
      setPlanStage('research');
      setShowClarifying(false);
      setShowPlanEditor(false);
      setPendingQuestions([]);
      // Don't cancel host ask_question waiters that belong to agent turns
    } else {
      // Entering plan: start stage machine without wiping transcript
      planController.run('Planning session started');
    }
  }, [mode, planController]);

  /**
   * Remove orphan empty streaming assistants; finalize non-empty ones.
   * Prevents hourglass bubbles left after abort/stop/resynth.
   */
  const cleanupStreamingAssistants = useCallback((prev: ChatMessage[]): ChatMessage[] => {
    const out: ChatMessage[] = [];
    for (const m of prev) {
      if (m.role === 'assistant' && m.status === 'streaming') {
        if (!m.content?.trim()) continue; // drop empty placeholder
        out.push({ ...m, status: 'complete' }); // keep partial text
      } else {
        out.push(m);
      }
    }
    return out;
  }, []);

  // ─── Message handler ───────────────────────────────────
  /**
   * @param text - UI bubble에 보여줄 사용자 입력 (깨끗한 텍스트)
   * @param files - attachments
   * @param opts.apiUserContent - API 전용 본문 (resynth wrapper 등). 없으면 text 사용
   */
  const handleSend = useCallback(async (
    text: string,
    files: Attachment[],
    opts?: { apiUserContent?: string }
  ) => {
    if (!text.trim() && files.length === 0) return;
    setError(null);

    const epoch = ++sendEpochRef.current;

    // Prefetch는 사용자 의도 + 드롭 첨부(@file/@folder) 기준
    const displayText = text;
    const mentionBlock = files
      .map((f) =>
        f.type === 'folder' ? `@folder:${f.path}` : `@file:${f.path}`
      )
      .join('\n');
    let payload = opts?.apiUserContent ?? text;
    if (mentionBlock) {
      // API/harness: Cursor-like context from chips (UI bubble keeps plain text + chips)
      payload = payload.trim()
        ? `${mentionBlock}\n\n${payload}`
        : `${mentionBlock}\n\nPlease analyze the attached path(s).`;
    }

    // RW-C7-05: prepend Design Mode annotations into user turn context
    const designCtx = designModeContext.getLastContext();
    if (designCtx?.hasAnnotations && designCtx.contextBlock) {
      payload = `${designCtx.contextBlock}\n\n---\n\n${payload}`;
    }

    // HARB: Prefetch + ContextAssembler → user payload 주입 (API only)
    try {
      const t0 = Date.now();
      const prefetchSource = [mentionBlock, displayText].filter(Boolean).join('\n');
      const harnessCtx = await buildHarnessTurnContext(prefetchSource || displayText, mode, 'A');
      if (epoch !== sendEpochRef.current) return; // superseded by stop/resynth
      payload = prependHarnessToUserPayload(payload, harnessCtx, mode);
      const fileHits = (harnessCtx.prefetchRaw.match(/Read file:/g) || []).length;
      setUxState((prev) => ({
        ...prev,
        tier: 'A',
        modelName: shortModelName(
          configManager.get('agent-k.provider.model') || prev.modelName
        ),
        prefetchCount: fileHits || (harnessCtx.prefetchRaw ? 1 : 0),
        prefetchLatencyMs: Date.now() - t0,
        contextTokens: harnessCtx.assembly?.usedTokens || prev.contextTokens
      }));
      setStuckEvent(null);
    } catch {
      if (epoch !== sendEpochRef.current) return;
      /* prefetch 실패는 비치명 */
    }

    if (epoch !== sendEpochRef.current) return;

    // UI: 사용자 입력만 — harness/resynth wrapper는 API 요청에만 주입
    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: displayText,
      timestamp: Date.now(),
      attachments: files,
      status: 'complete'
    };
    const assistantMsg: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming'
    };

    // Snapshot + clean before append (avoid stale closure undoing interrupt cleanup)
    const cleaned = cleanupStreamingAssistants(messagesRef.current);
    const nextMessages = [...cleaned, userMsg, assistantMsg];
    const apiMessages = nextMessages
      .filter((m) => m.id !== assistantMsg.id)
      .map((m) => (m.id === userMsg.id ? { ...m, content: payload } : m));
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    // Fresh steps for this assistant bubble (Cursor-style, on the message)
    stepStartRef.current = {};
    turnNumberRef.current += 1;

    // AgentLoop status → toolStatus (never mix into content)
    let sawProse = false;
    /** After first tool call, further content is the final answer (not the opening lead) */
    let toolsStarted = false;

    const TOOL_KINDS = new Set([
      'searching',
      'reading',
      'editing',
      'running',
      'browsing',
      'asking'
    ]);

    const sealLeadFromMessage = (msg: ChatMessage): ChatMessage => {
      return sealBodyBeforeTools(msg, turnNumberRef.current || 1);
    };

    sendMessage(
      payload,
      files,
      apiMessages,
      mode,
      // onDelta — timeline (PRD-C0 §5.3) | ask_question | status | streamed prose
      (delta: StreamDelta) => {
        if (epoch !== sendEpochRef.current) return;
        // Host ask_question → show ClarifyingQuestions (webview cannot see host singleton)
        if (delta.askQuestion?.id && delta.askQuestion.question) {
          const q = delta.askQuestion;
          setPendingQuestions((prev) => {
            if (prev.find((p) => p.id === q.id)) return prev;
            planController.addQuestion({ id: q.id, question: q.question });
            return [
              ...prev,
              {
                id: q.id,
                question: q.question,
                options: q.options,
                required: q.required !== false,
                answered: false,
              },
            ];
          });
          setShowClarifying(true);
          setAwaitingUser(true);
          return;
        }
        // Tools began — freeze a short *model* ack as openingLead (never a full dump)
        if (delta.clearContent) {
          toolsStarted = true;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (
              lastIdx >= 0 &&
              prev[lastIdx].role === 'assistant' &&
              prev[lastIdx].status === 'streaming'
            ) {
              const newMsgs = [...prev];
              newMsgs[lastIdx] = sealLeadFromMessage(newMsgs[lastIdx]);
              return newMsgs;
            }
            return prev;
          });
          return;
        }
        // Cursor-style file edit cards
        if (delta.fileEdit) {
          const fe = {
            ...delta.fileEdit,
            turn: delta.fileEdit.turn || turnNumberRef.current || 1
          };
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (
              lastIdx < 0 ||
              prev[lastIdx].role !== 'assistant' ||
              prev[lastIdx].status !== 'streaming'
            ) {
              return prev;
            }
            const msg = prev[lastIdx];
            const fileEdits = [...(msg.fileEdits || []), fe];
            const copy = [...prev];
            copy[lastIdx] = { ...msg, fileEdits };
            return copy;
          });
          return;
        }
        // Cursor-style terminal run cards (live + final)
        if (delta.terminalRun) {
          const ev = delta.terminalRun;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (
              lastIdx < 0 ||
              prev[lastIdx].role !== 'assistant' ||
              prev[lastIdx].status !== 'streaming'
            ) {
              return prev;
            }
            const msg = prev[lastIdx];
            const runs = [...(msg.terminalRuns || [])];
            const idx = runs.findIndex((r) => r.id === ev.id);
            const turn = ev.turn || turnNumberRef.current || 1;
            if (ev.phase === 'start' || idx < 0) {
              const next = {
                id: ev.id,
                command: ev.command || '',
                description: ev.description,
                cwd: ev.cwd,
                status: (ev.status || 'running') as 'running' | 'done' | 'error',
                stdout: '',
                stderr: '',
                turn
              };
              if (idx >= 0) runs[idx] = { ...runs[idx], ...next };
              else runs.push(next);
            } else if (ev.phase === 'chunk') {
              const cur = runs[idx];
              if (ev.stream === 'stderr') {
                runs[idx] = {
                  ...cur,
                  stderr: (cur.stderr || '') + (ev.chunk || '')
                };
              } else {
                runs[idx] = {
                  ...cur,
                  stdout: (cur.stdout || '') + (ev.chunk || '')
                };
              }
            } else if (ev.phase === 'end') {
              const cur = runs[idx];
              // Prefer streamed buffers; fall back to full end chunk dump
              let stdout = cur.stdout || '';
              let stderr = cur.stderr || '';
              if (!stdout && !stderr && ev.chunk) {
                stdout = ev.chunk;
              }
              runs[idx] = {
                ...cur,
                command: ev.command || cur.command,
                cwd: ev.cwd || cur.cwd,
                status: ev.status || (ev.error ? 'error' : 'done'),
                exitCode: ev.exitCode,
                error: ev.error,
                durationMs: ev.durationMs,
                stdout,
                stderr,
                turn: ev.turn || cur.turn
              };
            }
            const copy = [...prev];
            copy[lastIdx] = { ...msg, terminalRuns: runs };
            return copy;
          });
          return;
        }
        // Cursor-style: append/upsert steps on the streaming assistant bubble
        if (delta.timeline) {
          const tl = delta.timeline;
          // Keep planning (Planning next moves); drop only terminal "done" chrome
          if (tl.kind === 'done') {
            return;
          }
          if (TOOL_KINDS.has(tl.kind) && tl.itemStatus === 'running') {
            toolsStarted = true;
          }
          const id =
            tl.id ||
            `step_${tl.kind}_${tl.turn}_${tl.toolName || 'x'}_${Date.now()}`;
          const now = Date.now();
          if (!stepStartRef.current[id]) stepStartRef.current[id] = now;
          const durationMs =
            tl.itemStatus === 'done' || tl.itemStatus === 'error'
              ? now - stepStartRef.current[id]
              : undefined;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (
              lastIdx < 0 ||
              prev[lastIdx].role !== 'assistant' ||
              prev[lastIdx].status !== 'streaming'
            ) {
              return prev;
            }
            let msg = prev[lastIdx];
            if (TOOL_KINDS.has(tl.kind) && tl.itemStatus === 'running') {
              msg = sealLeadFromMessage(msg);
            }
            const steps = [...(msg.steps || [])];
            const idx = steps.findIndex((s) => s.id === id);
            const nextStep = {
              id,
              kind: tl.kind,
              label: tl.label,
              // Preserve Thought text when host closes thinking without re-sending detail
              detail: tl.detail !== undefined ? tl.detail : steps[idx]?.detail,
              toolName: tl.toolName,
              turn: tl.turn,
              itemStatus: tl.itemStatus,
              durationMs: durationMs ?? steps[idx]?.durationMs
            };
            if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
            else steps.push(nextStep);
            const copy = [...prev];
            copy[lastIdx] = { ...msg, steps };
            return copy;
          });
          return;
        }
        // Ask-path / direct: append reasoning chunks into Thought step
        if (delta.reasoning) {
          const id = `tl_thinking_${turnNumberRef.current || 1}`;
          const now = Date.now();
          if (!stepStartRef.current[id]) stepStartRef.current[id] = now;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (
              lastIdx < 0 ||
              prev[lastIdx].role !== 'assistant' ||
              prev[lastIdx].status !== 'streaming'
            ) {
              return prev;
            }
            const msg = prev[lastIdx];
            const steps = [...(msg.steps || [])];
            const idx = steps.findIndex((s) => s.id === id);
            const prevDetail = idx >= 0 ? steps[idx].detail || '' : '';
            const nextStep = {
              id,
              kind: 'thinking',
              label: 'Thought',
              detail: prevDetail + delta.reasoning,
              turn: turnNumberRef.current || 1,
              itemStatus: 'running' as const
            };
            if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
            else steps.push(nextStep);
            const copy = [...prev];
            copy[lastIdx] = { ...msg, steps };
            return copy;
          });
          return;
        }
        if (delta.status !== undefined) {
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
              const newMsgs = [...prev];
              newMsgs[lastIdx] = {
                ...newMsgs[lastIdx],
                toolStatus: undefined, // status lives in MessageSteps now
                content: sawProse ? newMsgs[lastIdx].content : ''
              };
              return newMsgs;
            }
            return prev;
          });
          return;
        }
        if (delta.content) {
          sawProse = true;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
              const newMsgs = [...prev];
              const msg = newMsgs[lastIdx];
              const hasToolStep = (msg.steps || []).some((s) => TOOL_KINDS.has(s.kind));
              if (!toolsStarted && !hasToolStep) {
                // Early prose: short ack → openingLead; overflow / markdown → body
                const draft = `${msg.openingLead || ''}${msg.content || ''}${delta.content!}`;
                const { lead, rest } = splitStreamingLead(draft);
                newMsgs[lastIdx] = {
                  ...msg,
                  toolStatus: undefined,
                  openingLead: lead || undefined,
                  content: rest
                };
              } else {
                newMsgs[lastIdx] = {
                  ...msg,
                  toolStatus: undefined,
                  content: (msg.content || '') + delta.content!
                };
              }
              return newMsgs;
            }
            return prev;
          });
        }
      },
      // onComplete - sanitize display + mark complete; close any stuck running steps
      () => {
        if (epoch !== sendEpochRef.current) return;
        setAwaitingUser(false);
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
            const newMsgs = [...prev];
            let content = stripFakeToolMarkup(newMsgs[lastIdx].content);
            // Drop leftover status if somehow still in content
            if (/^🔧/.test(content.trim()) && content.length < 80) {
              content = '';
            }
            const prevSteps = newMsgs[lastIdx].steps || [];
            const steps = prevSteps.map((s) =>
              s.itemStatus === 'running' ? { ...s, itemStatus: 'done' as const } : s
            );
            // Repair bad leads + optionally promote a short ack from the final answer
            const promoted = sanitizeOpeningLead(
              newMsgs[lastIdx].openingLead,
              content.trim()
            );
            const finalContent = promoted.content.trim() || content.trim();
            newMsgs[lastIdx] = {
              ...newMsgs[lastIdx],
              status: finalContent || promoted.lead ? 'complete' : 'error',
              toolStatus: undefined,
              openingLead: promoted.lead || undefined,
              content: finalContent || '(no response)',
              steps
            };
            return newMsgs;
          }
          return prev;
        });
        if (mode === 'plan' && planStage === 'research' && planController.getQuestions().length > 0) {
          setShowClarifying(true);
        }
      },
      // onError (incl. idle timeout) — collapse steps so UI is not stuck Thinking
      (err: string) => {
        if (epoch !== sendEpochRef.current) return;
        setAwaitingUser(false);
        setError(err);
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
            const newMsgs = [...prev];
            const prevSteps = newMsgs[lastIdx].steps || [];
            const steps = prevSteps.map((s) =>
              s.itemStatus === 'running' ? { ...s, itemStatus: 'error' as const } : s
            );
            newMsgs[lastIdx] = {
              ...newMsgs[lastIdx],
              status: 'error',
              toolStatus: undefined,
              steps,
              content: newMsgs[lastIdx].content?.trim()
                ? `${newMsgs[lastIdx].content}\n\n⚠ ${err}`
                : err
            };
            return newMsgs;
          }
          return prev;
        });
      }
    );
  }, [mode, sendMessage, planStage, planController, cleanupStreamingAssistants]);

  /**
   * Enter while streaming: Interrupt & Resynthesize (RW-P0-04).
   * UI bubble = user typed text only; API gets synthesizeInstructions wrapper.
   * Empty text → drain queue and resynthesize with drained texts.
   */
  const handleResynthesize = useCallback((text: string) => {
    stopHandlerRef.current?.interruptForResynthesize();
    sendEpochRef.current += 1;
    const drained = msgQueue.drain();
    const instruction = [text, ...drained].filter(Boolean).join('\n');

    const raw = messagesRef.current;
    const last = raw[raw.length - 1];
    const interruptedExtra =
      last?.role === 'assistant'
        ? [last.openingLead, last.content].filter((s) => Boolean(s?.trim())).join('\n')
        : '';

    // UI: finalize or drop streaming assistant
    const cleaned = cleanupStreamingAssistants(raw);
    setMessages(cleaned);
    messagesRef.current = cleaned;

    if (!instruction.trim()) return;

    // API synthesis input: history without streaming bubble, then interrupted assistant
    // (even if empty — so original user request is still found as last user)
    const prior = raw.filter(
      (m) => !(m.role === 'assistant' && m.status === 'streaming')
    );
    const agentMsgs: AgentMessage[] = [
      ...prior.map((m) => ({
        role: m.role as AgentMessage['role'],
        content: m.content,
        name: undefined
      })),
      ...(last?.role === 'assistant'
        ? [
            {
              role: 'assistant' as const,
              content: interruptedExtra || '(interrupted before any text)',
              name: undefined
            }
          ]
        : [])
    ];

    const rebuilt = buildResynthesizeMessages(
      agentMsgs,
      instruction,
      turnNumberRef.current,
      mode
    );
    const synthesisText = rebuilt[rebuilt.length - 1]?.content || instruction;

    const epochAtSchedule = sendEpochRef.current;
    setTimeout(() => {
      if (epochAtSchedule !== sendEpochRef.current) return;
      handleSend(instruction, [], { apiUserContent: synthesisText });
    }, 50);
  }, [msgQueue, mode, handleSend, cleanupStreamingAssistants]);

  /** Alt+Enter: Queue-only — no abort (RW-P0-04) */
  const handleQueueMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    msgQueue.enqueue(trimmed, 'queue_only');
    // While streaming: stay queued until turn ends (or Apply / Enter interrupt).
    // Idle: flush immediately as a normal send.
    if (!streaming) {
      const drained = msgQueue.drain();
      if (drained[0]) handleSend(drained.join('\n\n'), []);
    }
  }, [msgQueue, streaming, handleSend]);

  // Flush Alt+Enter queue when the current stream finishes
  useEffect(() => {
    if (streaming) return;
    if (msgQueue.getQueued().length === 0) return;
    const t = window.setTimeout(() => {
      const drained = msgQueue.drain();
      if (drained.length > 0) {
        handleSend(drained.join('\n\n'), []);
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [streaming, msgQueue, handleSend]);

  // Legacy single-slot queue (plan approve etc.)
  useEffect(() => {
    if (!streaming && queuedMessageRef.current) {
      const queued = queuedMessageRef.current;
      queuedMessageRef.current = null;
      handleSend(queued, []);
    }
  }, [streaming, handleSend]);

  /** Stop button — abort + clear streaming orphans; composer accepts new messages */
  const handleStop = useCallback(() => {
    stopHandlerRef.current?.stop('user_stop');
    sendEpochRef.current += 1; // abandon in-flight handleSend awaiting harness
    setAwaitingUser(false);
    setShowClarifying(false);
    setMessages(cleanupStreamingAssistants);
    setError(null);
  }, [cleanupStreamingAssistants]);

  const handleQueueApplyNow = useCallback((messageId: string) => {
    const msg = msgQueue.applyNow(messageId);
    if (msg) {
      handleResynthesize(msg.text);
    }
  }, [msgQueue, handleResynthesize]);

  const handleQueueCancel = useCallback((messageId: string) => {
    msgQueue.cancelQueued(messageId);
  }, [msgQueue]);

  const acceptFix = useRef(new AcceptFix()).current;
  const handleAcceptFinding = useCallback(async (id: string) => {
    const finding = reviewFindings.find((f) => f.id === id);
    if (!finding) return;
    const result = await acceptFix.accept(finding);
    if (result.applied && result.patch) {
      setArtifacts((prev) => [
        {
          id: `art-${Date.now()}`,
          type: 'diff',
          title: `Fix ${finding.file}`,
          description: finding.message,
          data: result.patch!,
          filePath: finding.file,
          timestamp: Date.now(),
          tags: ['review', 'fix']
        },
        ...prev
      ]);
    }
    setReviewFindings((prev) => prev.filter((f) => f.id !== id));
  }, [reviewFindings, acceptFix]);

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const newMessages = [...prev];
      newMessages.splice(idx + 1);
      newMessages[idx] = { ...newMessages[idx], content: newContent };
      return newMessages;
    });
    const msg = messages.find((m) => m.id === messageId);
    if (msg?.role === 'user') {
      handleSend(newContent, msg.attachments || []);
    }
  }, [messages, handleSend]);

  const handleRetry = useCallback((messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    const msg = messages[idx];
    if (!msg) return;
    setMessages((prev) => prev.slice(0, idx));
    if (msg.role === 'user') {
      handleSend(msg.content, msg.attachments || []);
    }
  }, [messages, handleSend]);

  const handleDelete = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const handleModeChange = useCallback((newMode: Mode) => {
    if (newMode === mode) return;
    // Shared transcript across modes — only tools/prompts change.
    // Stop in-flight stream so the next send uses the new mode cleanly.
    if (streaming) {
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current += 1;
      setMessages(cleanupStreamingAssistants);
    }
    setMode(newMode);
    setShowSettings(false);
    setAwaitingUser(false);
    setShowPlanEditor(false);
    setError(null);
  }, [mode, streaming, cleanupStreamingAssistants]);

  // ─── C5-C7 핸들러 ─────────────────────────────────────

  /** Plan/Agent: 질문 답변 → host RuntimeServices.resolveQuestion */
  const handlePlanAnswer = useCallback((id: string, answer: string) => {
    setPendingQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, answer, answered: true } : q))
    );
    // Resolve host waiter (Extension Development Host path)
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'chat.answer', qid: id, answer });
    } catch {
      /* ignore */
    }
    // Same-bundle fallback (unit tests)
    askQuestionTool.answerQuestion(id, answer);
    planController.answerQuestion(id, answer);
    // Agent mode: one question → dismiss UI; loop resumes after host resolves
    if (mode !== 'plan') {
      setShowClarifying(false);
      setAwaitingUser(false);
    }
  }, [planController, mode]);

  /** Plan: 질문 완료 → Planning 단계 진입 (agent ask_question: just dismiss UI) */
  const handleQuestionsComplete = useCallback(() => {
    if (mode === 'plan') {
      planController.moveToPlanning().catch(() => {
        setError('All questions must be answered before planning.');
      });
    }
    setShowClarifying(false);
    setAwaitingUser(false);
  }, [planController, mode]);

  /** Plan/Agent: 질문 취소 — must unblock host waiter */
  const handleQuestionsCancel = useCallback(() => {
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'chat.question.cancel' });
    } catch {
      /* ignore */
    }
    askQuestionTool.clear();
    setShowClarifying(false);
    setPendingQuestions([]);
    setAwaitingUser(false);
  }, []);

  /** Plan: 에디터 저장 */
  const handlePlanSave = useCallback((content: string) => {
    const existing = planController.getState().planDocument;
    const doc = existing || {
      slug: 'plan-draft',
      title: 'Plan',
      content: '',
      sections: [],
      todoCount: 0,
      createdAt: Date.now()
    };
    void planController.setPlanDocument({ ...doc, content }).then(() => {
      void planController.moveToReview().catch((e) => {
        setError(e instanceof Error ? e.message : 'Review로 이동하지 못했습니다.');
      });
    });
    setShowPlanEditor(false);
    setPlanStage('review');
  }, [planController]);

  /** Plan: 에디터 취소 — 단계만 닫기 (리서치 초기화하지 않음) */
  const handlePlanCancel = useCallback(() => {
    setShowPlanEditor(false);
  }, []);

  /** Plan: 스테이지 클릭 — 컨트롤러로 이동 + 해당 UI 열기 */
  const handleStageClick = useCallback((stage: PlanStage) => {
    const result = planController.goToStage(stage);
    if (!result.ok) {
      setError(result.error || '이 단계로 이동할 수 없습니다.');
      return;
    }
    setPlanStage(stage);
    setError(null);
    setShowClarifying(false);
    setShowPlanEditor(false);

    if (stage === 'questions') {
      if (planController.getQuestions().length === 0) {
        setError('아직 질문이 없습니다. Research에서 탐색을 먼저 진행하세요.');
      } else {
        setShowClarifying(true);
      }
      return;
    }

    if (stage === 'planning') {
      // Ensure a draft plan exists so the editor can save
      if (!planController.getState().planDocument) {
        void planController.setPlanDocument({
          slug: 'plan-draft',
          title: 'Plan',
          content: [
            '# Plan',
            '',
            '## Context',
            '',
            '(Research 결과를 여기에 요약하세요)',
            '',
            '## Architecture',
            '',
            '```mermaid',
            'flowchart TD',
            '  A[Start] --> B[Plan]',
            '```',
            '',
            '## TODOs',
            '',
            '- [ ] Step 1',
            '',
            '## Risks',
            '',
            '- TBD',
            '',
            '## Approval',
            '',
            '- [ ] Approved',
            ''
          ].join('\n'),
          sections: [],
          todoCount: 1,
          createdAt: Date.now()
        });
      }
      setShowPlanEditor(true);
      return;
    }

    if (stage === 'review') {
      if (!planController.getState().planDocument) {
        setError('아직 Plan 문서가 없습니다. 3. Plan에서 먼저 초안을 작성하세요.');
        return;
      }
      setShowPlanEditor(true);
      return;
    }

    if (stage === 'research') {
      setError(null);
      return;
    }

    if (stage === 'build') {
      // goToStage already validated / fired build-ready
      return;
    }
  }, [planController]);

  /** Debug: 타임라인 단계 클릭 */
  const handleDebugStageClick = useCallback((stage: DebugStage) => {
    const result = debugController.goToStage(stage);
    if (!result.ok) {
      setError(result.error || '이 단계로 이동할 수 없습니다.');
      return;
    }
    setError(null);
    setDebugTick((t) => t + 1);
  }, [debugController]);

  /** Debug: 가설 선택 → 계측 단계 진입 (RW-C6-01) */
  const handleSelectHypothesis = useCallback((id: string) => {
    try {
      debugController.selectHypothesis(id);
      setDebugTick(t => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to select hypothesis');
    }
  }, [debugController]);

  /** Settings 토글 — 명시적 type=button + 라벨 (아이콘만이면 클릭 인식이 애매함) */
  const handleToggleSettings = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setShowHistory(false);
    setShowSettings((prev) => !prev);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
    // Settings may have changed provider/model — refresh context window
    setProviderType(String(configManager.get('agent-k.provider.type') || 'litellm'));
    setProviderBaseUrl(String(configManager.get('agent-k.provider.baseUrl') || providerBaseUrl));
    setProviderApiKey(String(configManager.get('agent-k.provider.apiKey') || ''));
    setProviderModel(String(configManager.get('agent-k.provider.model') || providerModel));
    setRegisteredModels(getRegisteredModels());
  }, [providerBaseUrl, providerModel]);

  const handleToggleHistory = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setShowSettings(false);
    setShowHistory((prev) => !prev);
  }, []);

  const handleCloseHistory = useCallback(() => {
    setShowHistory(false);
  }, []);

  const handleOpenFile = useCallback((filePath: string) => {
    try {
      const api =
        (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'file.open', path: filePath });
    } catch {
      /* ignore */
    }
  }, []);

  const requestModelContext = useCallback(() => {
    try {
      const api =
        (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({
        type: 'model.context.refresh',
        providerType:
          providerType || String(configManager.get('agent-k.provider.type') || 'litellm'),
        baseUrl: providerBaseUrl,
        apiKey: providerApiKey || undefined,
        model: providerModel
      });
    } catch {
      /* ignore */
    }
  }, [providerType, providerBaseUrl, providerApiKey, providerModel]);

  useEffect(() => {
    requestModelContext();
  }, [requestModelContext]);

  const modelLabel = shortModelName(providerModel);

  const handleModelChange = useCallback((next: string) => {
    if (!next) return;
    persistProviderModel(next);
    setProviderModel(next);
  }, []);

  const composerModelOptions = useMemo(() => {
    const ids = [...registeredModels];
    if (providerModel && !ids.includes(providerModel)) ids.unshift(providerModel);
    return ids;
  }, [registeredModels, providerModel]);

  const sessionFileEdits = useMemo(
    () => collectSessionFileEdits(messages),
    [messages]
  );

  const contextBudget = modelContextBudget || modeRegistry.getModeConfig(mode).contextBudget || 100000;
  const contextUsagePercent = Math.min(
    100,
    Math.round(((uxState.contextTokens || 0) / contextBudget) * 100)
  );
  const contextUsageLabel =
    uxState.contextTokens > 0
      ? `Context: ${contextUsagePercent}% used · ~${uxState.contextTokens.toLocaleString()} / ${contextBudget.toLocaleString()} tokens`
      : `Context: ${contextBudget.toLocaleString()} tokens (${providerType}${modelContextSource !== 'provider' ? ` · ${modelContextSource}` : ''})`;

  const handleUndoAllEdits = useCallback(() => {
    const withCp = sessionFileEdits.filter((f) => f.checkpointId);
    if (!withCp.length) {
      setError('되돌릴 체크포인트가 없습니다.');
      return;
    }
    // Earliest checkpoint undoes the whole edit batch for this session
    const earliest = withCp[0].checkpointId!;
    try {
      const api =
        (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'checkpoint.restore', id: earliest });
      setMessages((prev) =>
        prev.map((m) => (m.fileEdits?.length ? { ...m, fileEdits: [] } : m))
      );
    } catch {
      setError('Undo All 요청에 실패했습니다.');
    }
  }, [sessionFileEdits]);

  const handleReviewEdits = useCallback(() => {
    if (!sessionFileEdits.length) return;
    // Open first changed file; list is already expandable in the bar
    const first = sessionFileEdits[0];
    handleOpenFile(first.absPath || first.path);
  }, [sessionFileEdits, handleOpenFile]);

  // ─── Render ────────────────────────────────────────────
  return (
    <div className="chat-container" data-ak-ui="v0.0.2">
      <header className="chat-header">
        <span className="chat-header-title" title="Agent K">
          Agent K
        </span>
        <div className="chat-actions">
          <button
            type="button"
            onClick={handleToggleHistory}
            title="Chat History"
            aria-pressed={showHistory}
          >
            History
          </button>
          <button type="button" onClick={handleNewChat} title="New Chat">
            New
          </button>
          <button
            type="button"
            className="settings-open-btn"
            onClick={handleToggleSettings}
            title="Open Settings"
            aria-pressed={showSettings}
          >
            Settings
          </button>
        </div>
      </header>

      <UXForMediumPanel
        uxState={uxState}
        stuckEvent={stuckEvent}
        onAction={(action) => {
          if (action.toLowerCase().includes('stop')) {
            setStuckEvent(null);
          }
        }}
      />

      {showDesignMode && (
        <DesignModePanel onClose={() => setShowDesignMode(false)} />
      )}

      {showReview && (
        <div style={{ padding: 8, borderBottom: '1px solid var(--vscode-panel-border, #444)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>Code Review</strong>
            <button type="button" onClick={() => setShowReview(false)}>Close</button>
          </div>
          <FindingList
            findings={reviewFindings}
            onAccept={handleAcceptFinding}
            onDismiss={(id) => setReviewFindings((prev) => prev.filter((f) => f.id !== id))}
            onAcceptAll={() => {
              reviewFindings.forEach((f) => void handleAcceptFinding(f.id));
            }}
          />
        </div>
      )}

      {showArtifacts && (
        <ArtifactGallery
          artifacts={artifacts}
          onClose={() => setShowArtifacts(false)}
        />
      )}

      {/* Mode chrome — optional banners above the SHARED message list */}
      {mode === 'plan' && (
        <div className="mode-chrome">
          <PlanModeHeader
            currentStage={planStage}
            stages={['research', 'questions', 'planning', 'review', 'build']}
            onStageClick={handleStageClick}
          />
        </div>
      )}

      {mode === 'debug' && (
        <div className="mode-chrome mode-chrome--debug">
          <DebugTimeline
            currentStage={debugController.getStage()}
            hypothesisCount={debugController.getHypotheses().length}
            logsCollected={debugController.getState().logs.length}
            markersRemaining={debugController.remainingMarkers}
            verified={debugController.getState().verified}
            evidenceCount={debugController.getState().browserEvidenceCount}
            onStageClick={handleDebugStageClick}
          />
          <DebugModeUI
            currentStage={debugController.getStage()}
            hypotheses={debugController.getHypotheses()}
            activeHypothesisId={debugController.getState().activeHypothesisId}
            onSelectHypothesis={handleSelectHypothesis}
          />
        </div>
      )}

      {/* ── Reproduce UI (RW-C6-05-R2) ── */}
      {showReproduce && (
        <div className="mode-chrome">
          <ReproduceUI
            hypothesisId={reproduceHypothesisId}
            hypothesisTitle={reproduceHypothesisId}
            steps={reproduceSteps}
            onReproduced={handleReproduced}
            onCancel={handleReproduceCancel}
          />
        </div>
      )}

      {/* ── Clarifying Questions (RW-C5-02) ──────── */}
      {showClarifying && pendingQuestions.length > 0 && (
        <div className="mode-chrome mode-chrome--questions">
          <ClarifyingQuestions
            questions={pendingQuestions.map(q => ({
              id: q.id,
              type: q.options ? 'single' as const : 'text' as const,
              question: q.question,
              options: q.options,
              required: q.required,
              answer: q.answer
            }))}
            onAnswer={handlePlanAnswer}
            onComplete={handleQuestionsComplete}
            onCancel={handleQuestionsCancel}
          />
        </div>
      )}

      {/* Plan editor: only when user opens it — never auto-split the shared chat */}
      {showPlanEditor && (
        <div className="plan-editor-overlay" role="dialog" aria-label="Plan editor">
          <PlanEditor
            document={planController.getState().planDocument || { slug: 'plan', title: 'Plan', content: '```mermaid\nflowchart TD\n  A[Start] --> B[Plan]\n```\n', sections: [], todoCount: 0, createdAt: Date.now() }}
            onSave={handlePlanSave}
            onCancel={handlePlanCancel}
          />
        </div>
      )}

      {/* ── Settings Panel ──────────────────────────────── */}
      {showSettings && (
        <div className="settings-overlay" role="dialog" aria-label="Settings">
          <SettingsPanel
            key={settingsTab}
            initialTab={settingsTab}
            onClose={handleCloseSettings}
          />
        </div>
      )}

      {showHistory && (
        <div className="settings-overlay" role="dialog" aria-label="Chat history">
          <HistoryPanel
            sessions={sessionList}
            currentId={sessionId}
            onSelect={handleOpenSession}
            onDelete={handleDeleteSession}
            onNew={handleNewChat}
            onClose={handleCloseHistory}
          />
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/*
        SHARED for all modes: one message list + one composer.
        Mode only changes tools/prompts — not a separate chat window.
      */}
      <div
        ref={messageListRef}
        className="message-list"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={onMessageListScroll}
      >
        {messages.map((item) => (
          <MessageBubble
            key={item.id}
            message={item}
            isStreaming={streaming && messages[messages.length - 1]?.id === item.id}
            onEdit={handleEditMessage}
            onRetry={handleRetry}
            onDelete={handleDelete}
            onCopy={(content) => navigator.clipboard.writeText(content)}
            onOpenFile={handleOpenFile}
          />
        ))}
        {/* Anchor so scrollHeight always includes latest growth */}
        <div ref={messageEndRef} aria-hidden className="message-list-end" />
      </div>

      <footer className="chat-footer">
        {/* Queue stays above composer — never mixed into the message list */}
        <QueueUI
          key={queueTick}
          messages={msgQueue.state.messages}
          isProcessing={msgQueue.state.isProcessing}
          onApplyNow={handleQueueApplyNow}
          onCancel={handleQueueCancel}
        />
        <ChangedFilesBar
          files={sessionFileEdits}
          onOpenFile={handleOpenFile}
          onUndoAll={handleUndoAllEdits}
          onReview={handleReviewEdits}
        />
        <Composer
          onSend={handleSend}
          disabled={streaming}
          onStop={handleStop}
          onRegenerate={() => {
            stepStartRef.current = {};
            let toolsStarted = false;
            const TOOL_KINDS = new Set([
              'searching',
              'reading',
              'editing',
              'running',
              'browsing',
              'asking'
            ]);
            const sealLeadFromMessage = (msg: ChatMessage): ChatMessage => {
              return sealBodyBeforeTools(msg, turnNumberRef.current || 1);
            };
            regenerate(
              messages,
              mode,
              (delta: StreamDelta) => {
                if (delta.clearContent) {
                  toolsStarted = true;
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    if (
                      lastIdx >= 0 &&
                      prev[lastIdx].role === 'assistant' &&
                      prev[lastIdx].status === 'streaming'
                    ) {
                      const newMsgs = [...prev];
                      newMsgs[lastIdx] = sealLeadFromMessage(newMsgs[lastIdx]);
                      return newMsgs;
                    }
                    return prev;
                  });
                  return;
                }
                if (delta.fileEdit) {
                  const fe = delta.fileEdit;
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    if (
                      lastIdx < 0 ||
                      prev[lastIdx].role !== 'assistant' ||
                      prev[lastIdx].status !== 'streaming'
                    ) {
                      return prev;
                    }
                    const msg = prev[lastIdx];
                    const fileEdits = [...(msg.fileEdits || []), fe];
                    const copy = [...prev];
                    copy[lastIdx] = { ...msg, fileEdits };
                    return copy;
                  });
                  return;
                }
                if (delta.terminalRun) {
                  const ev = delta.terminalRun;
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    if (
                      lastIdx < 0 ||
                      prev[lastIdx].role !== 'assistant' ||
                      prev[lastIdx].status !== 'streaming'
                    ) {
                      return prev;
                    }
                    const msg = prev[lastIdx];
                    const runs = [...(msg.terminalRuns || [])];
                    const idx = runs.findIndex((r) => r.id === ev.id);
                    const turn = ev.turn || turnNumberRef.current || 1;
                    if (ev.phase === 'start' || idx < 0) {
                      const next = {
                        id: ev.id,
                        command: ev.command || '',
                        description: ev.description,
                        cwd: ev.cwd,
                        status: (ev.status || 'running') as 'running' | 'done' | 'error',
                        stdout: '',
                        stderr: '',
                        turn
                      };
                      if (idx >= 0) runs[idx] = { ...runs[idx], ...next };
                      else runs.push(next);
                    } else if (ev.phase === 'chunk') {
                      const cur = runs[idx];
                      if (ev.stream === 'stderr') {
                        runs[idx] = {
                          ...cur,
                          stderr: (cur.stderr || '') + (ev.chunk || '')
                        };
                      } else {
                        runs[idx] = {
                          ...cur,
                          stdout: (cur.stdout || '') + (ev.chunk || '')
                        };
                      }
                    } else if (ev.phase === 'end') {
                      const cur = runs[idx];
                      let stdout = cur.stdout || '';
                      let stderr = cur.stderr || '';
                      if (!stdout && !stderr && ev.chunk) stdout = ev.chunk;
                      runs[idx] = {
                        ...cur,
                        command: ev.command || cur.command,
                        cwd: ev.cwd || cur.cwd,
                        status: ev.status || (ev.error ? 'error' : 'done'),
                        exitCode: ev.exitCode,
                        error: ev.error,
                        durationMs: ev.durationMs,
                        stdout,
                        stderr,
                        turn: ev.turn || cur.turn
                      };
                    }
                    const copy = [...prev];
                    copy[lastIdx] = { ...msg, terminalRuns: runs };
                    return copy;
                  });
                  return;
                }
                if (delta.timeline) {
                  const tl = delta.timeline;
                  // Keep planning (Planning next moves); drop only terminal "done" chrome
                  if (tl.kind === 'done') {
                    return;
                  }
                  if (TOOL_KINDS.has(tl.kind) && tl.itemStatus === 'running') {
                    toolsStarted = true;
                  }
                  const id =
                    tl.id ||
                    `step_${tl.kind}_${tl.turn}_${tl.toolName || 'x'}_${Date.now()}`;
                  const now = Date.now();
                  if (!stepStartRef.current[id]) stepStartRef.current[id] = now;
                  const durationMs =
                    tl.itemStatus === 'done' || tl.itemStatus === 'error'
                      ? now - stepStartRef.current[id]
                      : undefined;
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    if (
                      lastIdx < 0 ||
                      prev[lastIdx].role !== 'assistant' ||
                      prev[lastIdx].status !== 'streaming'
                    ) {
                      return prev;
                    }
                    let msg = prev[lastIdx];
                    if (TOOL_KINDS.has(tl.kind) && tl.itemStatus === 'running') {
                      msg = sealLeadFromMessage(msg);
                    }
                    const steps = [...(msg.steps || [])];
                    const idx = steps.findIndex((s) => s.id === id);
                    const nextStep = {
                      id,
                      kind: tl.kind,
                      label: tl.label,
                      // Preserve Thought text when host closes thinking without re-sending detail
                      detail: tl.detail !== undefined ? tl.detail : steps[idx]?.detail,
                      toolName: tl.toolName,
                      turn: tl.turn,
                      itemStatus: tl.itemStatus,
                      durationMs: durationMs ?? steps[idx]?.durationMs
                    };
                    if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
                    else steps.push(nextStep);
                    const copy = [...prev];
                    copy[lastIdx] = { ...msg, steps };
                    return copy;
                  });
                  return;
                }
                if (delta.reasoning) {
                  const id = `tl_thinking_${turnNumberRef.current || 1}`;
                  const now = Date.now();
                  if (!stepStartRef.current[id]) stepStartRef.current[id] = now;
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    if (
                      lastIdx < 0 ||
                      prev[lastIdx].role !== 'assistant' ||
                      prev[lastIdx].status !== 'streaming'
                    ) {
                      return prev;
                    }
                    const msg = prev[lastIdx];
                    const steps = [...(msg.steps || [])];
                    const idx = steps.findIndex((s) => s.id === id);
                    const prevDetail = idx >= 0 ? steps[idx].detail || '' : '';
                    const nextStep = {
                      id,
                      kind: 'thinking',
                      label: 'Thought',
                      detail: prevDetail + delta.reasoning,
                      turn: turnNumberRef.current || 1,
                      itemStatus: 'running' as const
                    };
                    if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
                    else steps.push(nextStep);
                    const copy = [...prev];
                    copy[lastIdx] = { ...msg, steps };
                    return copy;
                  });
                  return;
                }
                if (delta.status !== undefined) {
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
                      const newMsgs = [...prev];
                      newMsgs[lastIdx] = {
                        ...newMsgs[lastIdx],
                        toolStatus: undefined
                      };
                      return newMsgs;
                    }
                    return prev;
                  });
                  return;
                }
                if (delta.content) {
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
                      const newMsgs = [...prev];
                      const msg = newMsgs[lastIdx];
                      const hasToolStep = (msg.steps || []).some((s) => TOOL_KINDS.has(s.kind));
                      if (!toolsStarted && !hasToolStep) {
                        const draft = `${msg.openingLead || ''}${msg.content || ''}${delta.content!}`;
                        const { lead, rest } = splitStreamingLead(draft);
                        newMsgs[lastIdx] = {
                          ...msg,
                          toolStatus: undefined,
                          openingLead: lead || undefined,
                          content: rest
                        };
                      } else {
                        newMsgs[lastIdx] = {
                          ...msg,
                          toolStatus: undefined,
                          content: (msg.content || '') + delta.content!
                        };
                      }
                      return newMsgs;
                    }
                    return prev;
                  });
                }
              },
              () => {
                setMessages((prev) => {
                  const lastIdx = prev.length - 1;
                  if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
                    const newMsgs = [...prev];
                    let content = stripFakeToolMarkup(newMsgs[lastIdx].content);
                    if (/^🔧/.test(content.trim()) && content.length < 80) {
                      content = '';
                    }
                    const prevSteps = newMsgs[lastIdx].steps || [];
                    const steps = prevSteps.map((s) =>
                      s.itemStatus === 'running' ? { ...s, itemStatus: 'done' as const } : s
                    );
                    const promoted = sanitizeOpeningLead(
                      newMsgs[lastIdx].openingLead,
                      content.trim()
                    );
                    const finalContent = promoted.content.trim() || content.trim();
                    newMsgs[lastIdx] = {
                      ...newMsgs[lastIdx],
                      status: finalContent || promoted.lead ? 'complete' : 'error',
                      toolStatus: undefined,
                      openingLead: promoted.lead || undefined,
                      content: finalContent || '(no response)',
                      steps
                    };
                    return newMsgs;
                  }
                  return prev;
                });
              },
              (err: string) => {
                setError(err);
                setMessages((prev) => {
                  const lastIdx = prev.length - 1;
                  if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
                    const newMsgs = [...prev];
                    const prevSteps = newMsgs[lastIdx].steps || [];
                    const steps = prevSteps.map((s) =>
                      s.itemStatus === 'running' ? { ...s, itemStatus: 'error' as const } : s
                    );
                    newMsgs[lastIdx] = {
                      ...newMsgs[lastIdx],
                      status: 'error',
                      toolStatus: undefined,
                      steps,
                      content: err
                    };
                    return newMsgs;
                  }
                  return prev;
                });
              }
            );
          }}
          onQueueMessage={handleQueueMessage}
          onResynthesize={handleResynthesize}
          isStreaming={streaming}
          isAwaitingUser={awaitingUser}
          mode={mode}
          onModeChange={handleModeChange}
          modeLabels={MODE_LABELS}
          modeTooltips={MODE_TOOLTIPS}
          modelLabel={modelLabel}
          modelId={providerModel}
          modelOptions={composerModelOptions}
          onModelChange={handleModelChange}
          contextUsagePercent={contextUsagePercent}
          contextUsageLabel={contextUsageLabel}
        />
      </footer>
    </div>
  );
}

const vscode = {
  commands: {
    executeCommand: (cmd: string, ...args: any[]) => {
      window.parent.postMessage({ type: 'vscode.command', command: cmd, args }, '*');
    }
  }
};

(window as any).vscode = vscode;
