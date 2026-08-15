/**
 * ChatApp - 메인 채팅 애플리케이션 (C5-C7 UI 통합)
 *
 * mode=plan → PlanModeHeader + ClarifyingQuestions/PlanReview
 * mode=debug → DebugModeUI 패널
 * ⚙️ 설정 → SettingsPanel
 * ask_question 도구 → ClarifyingQuestions 모달
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MessageBubble } from './components/MessageBubble';
import { PLAN_V2_GENERATE_STEP_ID } from './components/MessageSteps';
import { Composer } from './components/Composer';
import { ChangedFilesBar } from './components/ChangedFilesBar';
import type { CheckpointSummary } from './components/ChangedFilesBar';
import type { FileEditPreview } from './types';
import { useChatStream } from './hooks/useChatStream';
import { configManager } from '../core/ConfigManager';
import type { ChatMessage, Mode, ModePicker, StreamDelta, Attachment } from './types';
import { formatAttachmentsForPayload } from './attachmentFormat';
import {
  extractPlanMarkdownFromMessage,
  findLatestPlanMarkdown,
  looksLikePlanDocument,
  looksLikePlanDraft,
  dedupeRepeatedPlanDocument,
  buildPlanChatSummary
} from './planPromote';
import './chat.css';

// C5-C7 UI 컴포넌트 (RW-C57-02: ChatApp 마운트)
import { PlanModeHeader } from './components/PlanModeHeader';
import type { PlanStage } from '../plan/PlanModeController';
import { PlanModeController } from '../plan/PlanModeController';
import { ClarifyingQuestions } from '../plan/ClarifyingQuestions';
import { PlanReview } from '../plan/PlanReview';
import { planGenerator } from '../plan/PlanGenerator';
import { DebugModeUI } from './components/DebugModeUI';
import { DebugModeController } from '../debug/DebugModeController';
import type { DebugStage, Hypothesis } from '../debug/DebugModeController';
import { SettingsPanel } from '../settings/SettingsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { ChatSessionStore } from './ChatSessionStore';
import type { ChatSessionMeta } from './ChatSessionStore';
// RW-C5-02: ask_question 도구 → ClarifyingQuestions 브리지
import { askQuestionTool } from '../tools/session/AskQuestionTool';
import type { PendingQuestion } from '../tools/session/AskQuestionTool';
import { normalizeMcqQuestion } from './normalizeAskQuestion';
// RW-C5-04: Plan → Agent 핸드오프
import { PlanToAgent } from '../plan/PlanToAgent';
import type { ProviderType } from '../providers/types';
import { PlanModeControllerAdapter, toObservedToolCall } from '../plan/v2';
import type { PlanV2GenerationResult } from '../plan/v2/PlanV2Generator';
// RW-C6-05-R2: ReproduceUI 대기 루프
import { ReproduceUI } from '../debug/ReproduceUI';
import { requestReproduceTool } from '../tools/debug/RequestReproduceTool';
import { RuntimeServices } from '../core/RuntimeServices';
// RW-P0-04: Interrupt & Resynthesize
import { MessageQueue } from '../loop/MessageQueue';
import { QueueUI } from './components/MessageQueueUI';
import { ChatSessionTabs } from './components/ChatSessionTabs';
import {
  clampThinkingEffort,
  parseThinkingEffort,
  resolveThinkingCapability,
  thinkingOptionsForModel,
  type ThinkingEffort
} from '../agent/thinkingEffort';
import { StopHandler } from '../loop/StopHandler';
import { buildResynthesizeMessages, stripResynthForDisplay } from '../loop/synthesizeInstructions';
import type { AgentMessage } from '../loop/AgentLoopController';
// RW-C7-05 / RW-C7-06 / RW-C7-10
import { DesignModePanel, designModeContext } from '../browser/DesignModePanel';
import { FindingList } from '../review/FindingList';
import { AcceptFix } from '../review/AcceptFix';
import type { ReviewFinding } from '../review/AgentReviewLoop';
import { modeRegistry } from '../agent/modeRegistry';
import {
  lastConversationTurn,
  resolveSendMode
} from '../mode';
import { ArtifactGallery } from '../artifacts/ArtifactGallery';
import type { Artifact } from '../artifacts/ArtifactStore';
import { UXForMediumPanel } from '../harness/UXForMediumPanel';
import type { HarnessUXState, UXEventType } from '../harness/UXForMedium';
import {
  buildHarnessTurnContext,
  prependHarnessToUserPayload,
  stripHarnessForDisplay
} from './harnessBridge';
import { sealBodyBeforeTools, resolveSealTurn } from './sealTurnProse';
import { stripFakeToolMarkup } from './displaySanitize';
import {
  getComposerModels,
  persistProviderModel,
  refreshComposerModels
} from './providerModels';
// ADDON-T10: slash command UX (/compact /cost /model /permissions /help)
import { SLASH_COMMANDS, resolveSlashCommand, type SlashCommand } from './composerPalette';

const MODE_LABELS: Record<ModePicker, string> = {
  auto: 'Auto',
  ask: 'Ask',
  agent: 'Agent',
  plan: 'Plan',
  debug: 'Debug'
};

const MODE_TOOLTIPS: Record<ModePicker, string> = {
  auto: 'Pick Ask / Plan / Debug / Agent from the message.',
  ask: 'Read-only exploration. No file edits.',
  agent: 'Autonomous implementation. Tools: read, edit, terminal.',
  plan: 'Design first. Outputs PLAN.md with Mermaid.',
  debug: 'Hypothesis → Instrument → Reproduce → Minimal fix.'
};

const PLAN_STICKY_PHASES = new Set(['research', 'planning', 'review']);


function textFromPlanController(controller: PlanModeController): string {
  return controller.getState().researchResults || 'Plan';
}

function buildPlanResearchContext(controller: PlanModeController): string {
  const state = controller.getState();
  const questions = controller
    .getQuestions()
    .map((q) => `- Q: ${q.question}\n  A: ${q.answer || '(no answer)'}`)
    .join('\n');
  return [
    state.researchResults ? `Research notes:\n${state.researchResults.slice(0, 8000)}` : '',
    questions ? `Clarifying answers:\n${questions}` : ''
  ].filter(Boolean).join('\n\n');
}

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

function normalizeProse(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^---+\s*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeDuplicateProse(aRaw: string, bRaw: string): boolean {
  const a = normalizeProse(aRaw);
  const b = normalizeProse(bRaw);
  if (!a || !b) return false;
  if (a === b) return true;
  // Shorter Korean answers still duplicate often (~40+)
  if (a.length >= 40 && b.includes(a)) return true;
  if (b.length >= 40 && a.includes(b)) return true;
  const n = Math.min(160, a.length, b.length);
  if (n >= 40 && a.slice(0, n) === b.slice(0, n)) return true;
  // Near-equal length with high prefix overlap
  if (a.length >= 60 && b.length >= 60) {
    const m = Math.min(120, a.length, b.length);
    if (a.slice(0, m) === b.slice(0, m)) return true;
  }
  return false;
}

/**
 * Same plan/answer often lands in turnProse (mid-turn) and again in content
 * (final). Keep the final body (Worked collapsed still shows it) and drop
 * matching sealed entries so the open timeline does not show it twice.
 */
function dedupeAssistantBody(msg: ChatMessage): ChatMessage {
  const body = (msg.content || '').trim();
  const prose = msg.turnProse || [];
  if (!body || prose.length === 0) return msg;

  const kept = prose.filter(
    (p) => !looksLikeDuplicateProse(String(p.content || ''), body)
  );
  if (kept.length === prose.length) {
    const sealed = prose
      .map((p) => String(p.content || '').trim())
      .filter(Boolean)
      .join('\n\n');
    if (looksLikeDuplicateProse(body, sealed)) {
      return { ...msg, turnProse: [] };
    }
    return msg;
  }
  return { ...msg, turnProse: kept };
}

function sanitizeLoadedMessages(parsed: ChatMessage[]): ChatMessage[] {
  return parsed
    .map((m) => {
      if (m.role === 'user') {
        let content = stripHarnessForDisplay(m.content);
        content = stripResynthForDisplay(content);
        return { ...m, content };
      }
      if (m.role === 'assistant') {
        return dedupeAssistantBody({
          ...m,
          content: stripFakeToolMarkup(m.content)
        });
      }
      return m;
    })
    .map((m) => {
      if (m.role !== 'assistant' || m.status !== 'streaming') return m;
      return finalizeStreamingAssistant(m);
    })
    .filter((m): m is ChatMessage => m != null);
}

/** Finalize or drop a streaming assistant (shared by tab switch / reload). */
function finalizeStreamingAssistant(m: ChatMessage): ChatMessage | null {
  if (m.role !== 'assistant' || m.status !== 'streaming') return m;
  const hasBody = Boolean(m.content?.trim());
  const hasSteps = (m.steps?.length ?? 0) > 0;
  const hasProse =
    Boolean(m.openingLead?.trim()) || (m.turnProse?.length ?? 0) > 0;
  const hasCards =
    (m.fileEdits?.length ?? 0) > 0 || (m.terminalRuns?.length ?? 0) > 0;
  if (!hasBody && !hasSteps && !hasProse && !hasCards) return null;
  return {
    ...m,
    status: 'complete',
    content: hasBody ? m.content : m.content,
    workedDurationMs:
      typeof m.workedDurationMs === 'number'
        ? m.workedDurationMs
        : Math.max(0, Date.now() - (m.timestamp || Date.now()))
  };
}

function finalizeStreamingMessages(prev: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of prev) {
    if (m.role === 'assistant' && m.status === 'streaming') {
      const next = finalizeStreamingAssistant(m);
      if (next) out.push(next);
    } else {
      out.push(m);
    }
  }
  return out;
}

export function ChatApp() {
  const [sessionId, setSessionId] = useState(() => sessionStore.loadActive().id);
  const [sessionList, setSessionList] = useState<ChatSessionMeta[]>(() => sessionStore.list());
  /** Open tabs only (persisted). History stays in the History panel — not auto-opened as tabs. */
  const [openTabIds, setOpenTabIds] = useState<string[]>(() => sessionStore.getOpenTabIds());
  /** ADDON-T07: recent checkpoints for the Checkpoints dropdown (host-populated) */
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const active = sessionStore.loadActive();
    return sanitizeLoadedMessages(active.messages || []);
  });
  const [mode, setMode] = useState<Mode>(() => sessionStore.loadActive().mode || 'agent');
  const [modeAuto, setModeAuto] = useState(() => {
    const loaded = sessionStore.loadActive();
    return (loaded.messages?.length ?? 0) === 0;
  });
  const [error, setError] = useState<string | null>(null);

  // HARB: 중급 모델 UX 상태바
  const [uxState, setUxState] = useState<HarnessUXState>({
    tier: 'A',
    modelName: 'flash',
    toolsUsed: 0,
    maxTools: 12,
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
  // Plan V2 (additive): structured PlanSession running alongside the
  // existing PlanModeController stage machine. See
  // src/plan/v2/PlanModeControllerAdapter.ts — it mirrors state INTO
  // planController rather than replacing it, so PlanReview/PlanEditor
  // keep working unmodified. Until plan generation itself is switched to
  // PlanV2Generator, planV2Adapter.session.getPlan() stays null and
  // recordToolEvent() below is a safe no-op.
  const planV2AdaptersRef = useRef<Map<string, PlanModeControllerAdapter>>(new Map());
  const planV2Adapter = useMemo(() => {
    const existing = planV2AdaptersRef.current.get(sessionId);
    if (existing) return existing;
    const created = new PlanModeControllerAdapter(sessionId, planController);
    planV2AdaptersRef.current.set(sessionId, created);
    return created;
  }, [sessionId, planController]);
  // Re-render on every PlanSession event (task status changes, phase
  // changes, manual verification, ...) — reads of planV2Adapter.session.*
  // in JSX are otherwise not React-reactive since PlanSession is a plain
  // mutable class instance, not React state.
  const [planV2Tick, setPlanV2Tick] = useState(0);
  useEffect(() => {
    return planV2Adapter.session.onEvent(() => setPlanV2Tick((t) => t + 1));
  }, [planV2Adapter]);
  const tasksAwaitingVerification = useMemo(() => {
    void planV2Tick; // dependency: recompute whenever the session emits an event
    const plan = planV2Adapter.session.getPlan();
    if (!plan) return [];
    return plan.tasks
      .filter((t) => planV2Adapter.session.getTaskStatus(t.id) === 'awaiting_verification')
      .map((t) => ({ id: t.id, title: t.title }));
  }, [planV2Adapter, planV2Tick]);
  const handleVerifyTaskManually = useCallback(
    (taskId: string) => {
      try {
        planV2Adapter.verifyTaskManually(taskId);
      } catch (e) {
        setError(e instanceof Error ? e.message : '작업을 확인 완료로 표시하지 못했습니다.');
      }
    },
    [planV2Adapter]
  );
  const [planStage, setPlanStage] = useState<PlanStage>('research');
  const [showClarifying, setShowClarifying] = useState(false);
  const [showPlanReview, setShowPlanReview] = useState(false);
  // Clarifying questions via AskQuestionTool bridge (RW-C5-02)
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  /** True while host is blocked on ask_question — Composer shows Waiting… not Streaming… */
  const [awaitingUser, setAwaitingUser] = useState(false);
  /** Plan V2 JSON generation after questions — keep timeline live */
  const [generatingPlan, setGeneratingPlan] = useState(false);
  /** Prefill composer after Stop on a user bubble */
  const [composerSeed, setComposerSeed] = useState<{
    text: string;
    nonce: number;
  } | null>(null);

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
  const SETTINGS_TAB_IDS = [
    'models',
    'permission',
    'queue',
    'harness',
    'context',
    'mcp',
    'features',
    'privacy',
    'json',
  ] as const;
  type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];
  
  function readLastSettingsTab(): SettingsTabId {
    try {
      const v = localStorage.getItem('agent-k.settings.lastTab');
      if (v && (SETTINGS_TAB_IDS as readonly string[]).includes(v)) {
        return v as SettingsTabId;
      }
    } catch {
      /* ignore */
    }
    return 'models';
  }
  
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>(readLastSettingsTab);
  const rememberSettingsTab = useCallback((tab: SettingsTabId) => {
    setSettingsTab(tab);
    try {
      localStorage.setItem('agent-k.settings.lastTab', tab);
    } catch {
      /* ignore */
    }
  }, []);
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
  const [composerModels, setComposerModels] = useState<string[]>(() => getComposerModels());
  const [modelContextBudget, setModelContextBudget] = useState<number>(() =>
    Number(configManager.get('agent-k.context.budget')) || 100000
  );
  const [modelContextSource, setModelContextSource] = useState<string>('fallback');
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>(() =>
    parseThinkingEffort(configManager.get('agent-k.thinking.effort'))
  );

  useEffect(() => {
    const syncModels = () => setComposerModels(getComposerModels());
    const unsubs = [
      configManager.on('agent-k.provider.model', (_k, v) => {
        setProviderModel(String(v || ''));
        syncModels();
      }),
      configManager.on('agent-k.provider.baseUrl', (_k, v) => {
        setProviderBaseUrl(String(v || ''));
      }),
      configManager.on('agent-k.provider.apiKey', (_k, v) => {
        setProviderApiKey(String(v || ''));
      }),
      configManager.on('agent-k.provider.availableModels', syncModels),
      configManager.on('agent-k.provider.models', syncModels),
      configManager.on('agent-k.thinking.effort', (_k, v) => {
        setThinkingEffort(parseThinkingEffort(v));
      }),
      configManager.on('agent-k.provider.type', (_k, v) => {
        setProviderType(String(v || 'litellm'));
      }),
      configManager.on('agent-k.context.budget', (_k, v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) setModelContextBudget(n);
      }),
    ];
    syncModels();
    return () => unsubs.forEach((u) => u());
  }, []);

  const { streaming, sendMessage, stop, regenerate } = useChatStream({
    baseUrl: providerBaseUrl || 'http://127.0.0.1:52415',
    model: providerModel,
    apiKey: providerApiKey || undefined,
    planStage,
    debugStage: mode === 'debug' ? debugController.getStage() : undefined,
    thinkingEffort
  });

  /** Plan Approve → Agent handoff calls handleSend after it is defined */
  const handleSendRef = useRef<
    | ((
        text: string,
        files: Attachment[],
        opts?: {
          apiUserContent?: string;
          modeOverride?: Mode;
          planStageOverride?: string;
        }
      ) => Promise<void>)
    | null
  >(null);
  /** ADDON-T10: handleSend (defined earlier) calls runSlashCommand (defined later) */
  const runSlashCommandRef = useRef<((cmd: SlashCommand) => void) | null>(null);
  const turnNumberRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /** Bumped on stop/resynth so in-flight handleSend (awaiting harness) is abandoned. */
  const sendEpochRef = useRef(0);
  /** After clarifying questions: next assistant complete → save as PLAN.md + open review */
  const promotePlanOnCompleteRef = useRef(false);
  /** Avoid re-promoting the same plan body in a loop */
  const lastPromotedPlanRef = useRef<string>('');
  const planStageRef = useRef(planStage);
  planStageRef.current = planStage;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const planFileExistsResolversRef = useRef(new Map<string, { resolve: (exists: boolean) => void; reject: (error: Error) => void; }>());
  const planV2GenerateResolversRef = useRef(new Map<string, { resolve: (result: PlanV2GenerationResult) => void; reject: (error: Error) => void; }>());
  const planV2TimedOutRef = useRef(new Set<string>());
  const planV2ActiveRequestRef = useRef<string | null>(null);
  const showPlanReviewRef = useRef(showPlanReview);
  showPlanReviewRef.current = showPlanReview;
  const showClarifyingRef = useRef(showClarifying);
  showClarifyingRef.current = showClarifying;
  const pendingQuestionsRef = useRef(pendingQuestions);
  pendingQuestionsRef.current = pendingQuestions;

  /** Per-tab Plan FSM — do not leak Review chrome across sessions */
  type PlanSessionSnap = {
    flow: ReturnType<PlanModeController['getState']>;
    showPlanReview: boolean;
    showClarifying: boolean;
    pendingQuestions: PendingQuestion[];
    lastPromotedPlan: string;
    promoteOnComplete: boolean;
  };
  const planSnapBySessionRef = useRef<Map<string, PlanSessionSnap>>(new Map());

  const resetPlanChrome = useCallback(() => {
    planController.reset();
    setPlanStage('research');
    setShowPlanReview(false);
    setShowClarifying(false);
    setPendingQuestions([]);
    lastPromotedPlanRef.current = '';
    promotePlanOnCompleteRef.current = false;
  }, [planController]);

  const parkPlanForSession = useCallback(
    (id: string) => {
      if (!id) return;
      planSnapBySessionRef.current.set(id, {
        flow: planController.getState(),
        showPlanReview: showPlanReviewRef.current,
        showClarifying: showClarifyingRef.current,
        pendingQuestions: pendingQuestionsRef.current.map((q) => ({ ...q })),
        lastPromotedPlan: lastPromotedPlanRef.current,
        promoteOnComplete: promotePlanOnCompleteRef.current
      });
    },
    [planController]
  );

  const restorePlanForSession = useCallback(
    (id: string) => {
      const snap = planSnapBySessionRef.current.get(id);
      if (!snap) {
        resetPlanChrome();
        return;
      }
      planController.hydrate(snap.flow, { emit: false });
      setPlanStage(snap.flow.stage || 'research');
      setShowPlanReview(Boolean(snap.showPlanReview));
      setShowClarifying(Boolean(snap.showClarifying));
      setPendingQuestions(snap.pendingQuestions || []);
      lastPromotedPlanRef.current = snap.lastPromotedPlan || '';
      promotePlanOnCompleteRef.current = Boolean(snap.promoteOnComplete);
    },
    [planController, resetPlanChrome]
  );

  /** Session that owns the in-flight host loop / ask_question waiter */
  const loopSessionIdRef = useRef<string | null>(null);
  /** Park Clarifying UI when user switches tabs while Waiting… */
  const parkedAwaitingRef = useRef<{
    sessionId: string;
    questions: PendingQuestion[];
  } | null>(null);
  /** Debug session file slug under `.agentk/debug/tmp/debug_<hash>.md` */
  const debugSessionSlugRef = useRef<string | undefined>(undefined);
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

  // Pin to bottom when user is already near bottom (never yank scroll during Thought)
  useEffect(() => {
    scrollMessagesToBottom(false);
  }, [messages, scrollMessagesToBottom]);

  // Follow DOM growth (Thought / markdown) only while stick-to-bottom is on
  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;

    const nudge = () => {
      if (stickToBottomRef.current) scrollMessagesToBottom(false);
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
  }, [scrollMessagesToBottom]);

  useEffect(() => {
    return msgQueue.subscribe(() => setQueueTick((t) => t + 1));
  }, [msgQueue]);

  useEffect(() => {
    stopHandlerRef.current = new StopHandler({ abort: stop, queue: msgQueue });
  }, [stop, msgQueue]);

  // Persist open tabs (closed tabs stay closed across reload)
  useEffect(() => {
    sessionStore.setOpenTabIds(openTabIds);
  }, [openTabIds]);

  /** New chat: archive current transcript, start empty session. */
  const handleNewChat = useCallback(() => {
    // New tab abandons any in-flight Wait/stream — do not leave a zombie ask_question
    if (streaming) {
      if (awaitingUser) {
        parkedAwaitingRef.current = null;
        setShowClarifying(false);
        setAwaitingUser(false);
        setPendingQuestions([]);
      } else {
        const kept = finalizeStreamingMessages(messagesRef.current);
        messagesRef.current = kept;
        setMessages(kept);
      }
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current += 1;
      loopSessionIdRef.current = null;
    }
    const snap = messagesRef.current.length ? messagesRef.current : messages;
    if (snap.length === 0) {
      // Still isolate Plan chrome — empty tab must not keep prior Review UI
      parkPlanForSession(sessionId);
      resetPlanChrome();
      setShowHistory(false);
      setError(null);
      setOpenTabIds((prev) =>
        prev.includes(sessionId) ? prev : [sessionId, ...prev]
      );
      setModeAuto(true);
      return;
    }
    parkPlanForSession(sessionId);
    sessionStore.saveMessages(sessionId, snap, mode);
    const next = sessionStore.createEmpty(mode);
    setSessionId(next.id);
    setMessages([]);
    stepStartRef.current = {};
    setSessionList(sessionStore.list());
    setOpenTabIds((prev) => [next.id, ...prev.filter((id) => id !== next.id)]);
    resetPlanChrome();
    setError(null);
    setShowHistory(false);
    setModeAuto(true);
  }, [
    streaming,
    awaitingUser,
    messages,
    sessionId,
    mode,
    parkPlanForSession,
    resetPlanChrome
  ]);

  const handleOpenSession = useCallback(
    (id: string) => {
      if (id === sessionId) {
        setShowHistory(false);
        return;
      }
      // Waiting…: keep host ask_question; park UI for this session
      if (streaming && awaitingUser) {
        parkedAwaitingRef.current = { sessionId, questions: pendingQuestions };
        setShowClarifying(false);
        setAwaitingUser(false);
      } else if (streaming) {
        const kept = finalizeStreamingMessages(messagesRef.current);
        messagesRef.current = kept;
        setMessages(kept);
        sessionStore.saveMessages(sessionId, kept, mode);
        stopHandlerRef.current?.stop('user_stop');
        sendEpochRef.current += 1;
        loopSessionIdRef.current = null;
      } else if (messages.length > 0) {
        sessionStore.saveMessages(sessionId, messages, mode);
      }
      parkPlanForSession(sessionId);
      const loaded = sessionStore.switchTo(id);
      if (!loaded) return;
      setSessionId(loaded.id);
      setMessages(sanitizeLoadedMessages(loaded.messages || []));
      setMode(loaded.mode || 'agent');
      setModeAuto((loaded.messages?.length ?? 0) === 0);
      stepStartRef.current = {};
      setSessionList(sessionStore.list());
      setOpenTabIds((prev) =>
        prev.includes(id) ? prev : [id, ...prev.filter((x) => x !== id)]
      );
      setError(null);
      setShowHistory(false);
      restorePlanForSession(id);
      const parked = parkedAwaitingRef.current;
      if (parked && parked.sessionId === id) {
        setPendingQuestions(parked.questions);
        setShowClarifying(true);
        setAwaitingUser(true);
        parkedAwaitingRef.current = null;
      } else if (!planSnapBySessionRef.current.has(id)) {
        setPendingQuestions([]);
        setShowClarifying(false);
      }
    },
    [
      sessionId,
      streaming,
      awaitingUser,
      messages,
      mode,
      pendingQuestions,
      parkPlanForSession,
      restorePlanForSession
    ]
  );

  const handleCloseTab = useCallback(
    (id: string) => {
      const remaining = openTabIds.filter((x) => x !== id);

      // Inactive tab — never abort the active session
      if (id !== sessionId) {
        setOpenTabIds(remaining);
        return;
      }

      if (streaming && awaitingUser) {
        parkedAwaitingRef.current = { sessionId, questions: pendingQuestions };
        setShowClarifying(false);
        setAwaitingUser(false);
      } else if (streaming) {
        const kept = finalizeStreamingMessages(messagesRef.current);
        messagesRef.current = kept;
        setMessages(kept);
        stopHandlerRef.current?.stop('user_stop');
        sendEpochRef.current += 1;
        loopSessionIdRef.current = null;
      }

      const snap = messagesRef.current.length ? messagesRef.current : messages;
      if (snap.length > 0) {
        sessionStore.saveMessages(sessionId, snap, mode);
      }
      parkPlanForSession(sessionId);

      const idx = openTabIds.indexOf(id);
      const neighborId =
        (idx >= 0 && openTabIds[idx + 1]) ||
        (idx > 0 && openTabIds[idx - 1]) ||
        remaining[0] ||
        undefined;

      if (neighborId && neighborId !== id) {
        const loaded = sessionStore.switchTo(neighborId);
        if (loaded) {
          setSessionId(loaded.id);
          setMessages(sanitizeLoadedMessages(loaded.messages || []));
          setMode(loaded.mode || 'agent');
          setModeAuto((loaded.messages?.length ?? 0) === 0);
          stepStartRef.current = {};
          setSessionList(sessionStore.list());
          setOpenTabIds(
            remaining.includes(neighborId) ? remaining : [neighborId, ...remaining]
          );
          restorePlanForSession(neighborId);
          const parked = parkedAwaitingRef.current;
          if (parked && parked.sessionId === neighborId) {
            setPendingQuestions(parked.questions);
            setShowClarifying(true);
            setAwaitingUser(true);
            parkedAwaitingRef.current = null;
          } else if (!planSnapBySessionRef.current.has(neighborId)) {
            setPendingQuestions([]);
            setShowClarifying(false);
          }
          setError(null);
          setShowHistory(false);
          return;
        }
      }

      const fresh = sessionStore.createEmpty(mode);
      setSessionId(fresh.id);
      setMessages([]);
      stepStartRef.current = {};
      setSessionList(sessionStore.list());
      setOpenTabIds([fresh.id]);
      resetPlanChrome();
      setError(null);
      setShowHistory(false);
    },
    [
      sessionId,
      openTabIds,
      streaming,
      awaitingUser,
      messages,
      mode,
      pendingQuestions,
      parkPlanForSession,
      restorePlanForSession,
      resetPlanChrome
    ]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      if (streaming && id === sessionId) {
        stopHandlerRef.current?.stop('user_stop');
        sendEpochRef.current += 1;
      }
      planSnapBySessionRef.current.delete(id);
      const next = sessionStore.delete(id);
      setSessionList(sessionStore.list());
      setOpenTabIds((prev) => prev.filter((x) => x !== id));
      if (!next) return;
      if (id === sessionId) {
        setSessionId(next.id);
        setMessages(sanitizeLoadedMessages(next.messages || []));
        setMode(next.mode || 'agent');
        setModeAuto((next.messages?.length ?? 0) === 0);
        stepStartRef.current = {};
        setOpenTabIds((prev) =>
          prev.includes(next.id) ? prev : [next.id, ...prev]
        );
        restorePlanForSession(next.id);
        setError(null);
      }
    },
    [streaming, sessionId, restorePlanForSession]
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
        // ADDON-T14: host runs the real git-diff review; only fall back to a
        // demo finding when there's no repo/diff to inspect.
        if (Array.isArray(data.findings) && data.findings.length) {
          setReviewFindings(data.findings as ReviewFinding[]);
        } else if (Array.isArray(data.findings)) {
          setReviewFindings([]);
        } else {
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
      }
      if (data.type === 'ui.artifacts.open') setShowArtifacts(true);
      if (data.type === 'settings.open') {
        if (typeof data.tab === 'string') {
          const tab = data.tab === 'secrets' ? 'models' : data.tab;
          if ((SETTINGS_TAB_IDS as readonly string[]).includes(tab)) {
            rememberSettingsTab(tab as SettingsTabId);
          }
        }
        setShowSettings(true);
      }
      if (data.type === 'plan.saved' && data.slug) {
        const existing = planController.getState().planDocument;
        if (existing) {
          // Patch slug/title only — never reset stage (Review must stay open)
          void planController.setPlanDocument({
            ...existing,
            slug: String(data.slug),
            title: String(data.title || existing.title)
          });
        }
        if (data.filePath) {
          console.info('[Agent K] Plan saved:', data.filePath);
          setError(null);
        }
        return;
      }
      if (data.type === 'plan.loaded' && data.content != null) {
        const existing = planController.getState().planDocument;
        if (existing) {
          void planController.setPlanDocument({
            ...existing,
            slug: String(data.slug || existing.slug),
            title: String(data.title || existing.title),
            content: String(data.content),
            sections: planGenerator.parseDocument(String(data.content)),
            todoCount: planGenerator.extractTodos(String(data.content)).length
          });
        }
        return;
      }
      if (data.type === 'plan.save.error' && data.error) {
        setError(`Plan 저장 실패: ${String(data.error)}`);
        return;
      }
      if (data.type === 'plan.load.error' && data.error) {
        setError(`Plan 로드 실패: ${String(data.error)}`);
        return;
      }
      if (data.type === 'debug.saved' && data.slug) {
        debugSessionSlugRef.current = String(data.slug);
        if (data.filePath) {
          console.info('[Agent K] Debug saved:', data.filePath);
        }
        return;
      }
      if (data.type === 'debug.save.error' && data.error) {
        setError(`Debug 저장 실패: ${String(data.error)}`);
        return;
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
        return;
      }
      // ADDON-T07: Checkpoints dropdown list refresh
      if (data.type === 'checkpoint.listResult') {
        const list = Array.isArray(data.checkpoints) ? data.checkpoints : [];
        setCheckpoints(
          list.map((c: any) => ({
            id: String(c.id),
            label: String(c.label || 'Checkpoint'),
            timestamp: Number(c.timestamp) || Date.now()
          }))
        );
        return;
      }
      // ADDON-T06: host-restored session metas (workspaceState survives restarts)
      if (data.type === 'host.sessions.hydrate') {
        const metas = Array.isArray(data.sessions) ? data.sessions : [];
        sessionStore.applyHostHydration(metas);
        setSessionList(sessionStore.list());
        return;
      }
      // Project / host config → webview ConfigManager
      if (data.type === 'config.hydrate' && data.values && typeof data.values === 'object') {
        configManager.syncFromVSCode(data.values as Record<string, unknown>);
        return;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [handleNewChat]);

  // ADDON-T06: request host session hydration once on mount
  useEffect(() => {
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'host.sessions.ready' });
    } catch {
      /* no host bridge (browser preview) */
    }
  }, []);

  useEffect(() => {
    const delay = streaming ? 400 : 0;
    const t = window.setTimeout(() => {
      sessionStore.saveMessages(sessionId, messages, mode);
      const list = sessionStore.list();
      setSessionList(list);
      // ADDON-T06: mirror session metas to host SessionManager (workspaceState)
      try {
        const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
        api?.postMessage?.({
          type: 'host.sessions.persist',
          sessions: sessionStore.exportMetasForHost(),
          currentId: sessionStore.getCurrentId()
        });
      } catch {
        /* no host bridge (browser preview) */
      }
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
    debugController.markReproduced();
    setDebugTick((t) => t + 1);
    setShowReproduce(false);
    // Persist debug session snapshot (Plan-style project-root tmp)
    const state = debugController.getState();
    const active = debugController.getActiveHypothesis();
    const title = active?.title || 'Debug Session';
    const content = [
      '# Debug Session Report',
      '',
      `**Stage**: ${state.stage}`,
      `**Updated**: ${new Date().toISOString()}`,
      '',
      debugController.buildContextBlock(),
      '',
      '## Reproduce',
      'User confirmed reproduction completed.',
      '',
      ...(reproduceSteps.length
        ? [
            '### Steps',
            ...reproduceSteps.map((s) => `${s.order}. ${s.description}`)
          ]
        : [])
    ].join('\n');
    try {
      const api =
        (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({
        type: 'debug.save',
        title,
        content,
        stage: state.stage,
        slug: debugSessionSlugRef.current,
        reproduce: reproduceSteps.length
          ? [
              '# Reproduce Script',
              '',
              `**Hypothesis**: ${active?.id || reproduceHypothesisId}`,
              '',
              '## Steps',
              ...reproduceSteps.map((s) => `${s.order}. ${s.description}`)
            ].join('\n')
          : undefined
      });
    } catch {
      /* ignore */
    }
  }, [debugController, reproduceSteps, reproduceHypothesisId]);

  const handleReproduceCancel = useCallback(() => {
    RuntimeServices.resolveReproduce(false);
    setShowReproduce(false);
  }, []);

  const requestWorkspaceFileExists = useCallback((relativePath: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      if (!api?.postMessage) {
        reject(new Error('VS Code API unavailable for Plan semantic validation.'));
        return;
      }
      const requestId = `plan_file_${uuidv4()}`;
      const timeout = window.setTimeout(() => {
        planFileExistsResolversRef.current.delete(requestId);
        reject(new Error(`Timed out checking workspace file: ${relativePath}`));
      }, 10000);
      planFileExistsResolversRef.current.set(requestId, {
        resolve: (exists) => { window.clearTimeout(timeout); resolve(exists); },
        reject: (error) => { window.clearTimeout(timeout); reject(error); }
      });
      api.postMessage({ type: 'plan.fileExists', requestId, path: relativePath });
    });
  }, []);

  const requestPlanV2 = useCallback(async (params: { goal: string; researchContext: string; rejectionFeedback?: string }) => {
    // Runs in the Extension Host, not here -- see the 'plan.v2.generate'
    // handler in extension.ts. Constructing LiteLLMProvider/LiteLLMPlanModel/
    // PlanV2Generator here and calling provider.fetch() from this webview
    // is a vscode-webview:// origin, subject to full CORS. A local/remote
    // model server that doesn't send Access-Control-Allow-Origin for that
    // origin gets its preflight rejected -- "blocked by CORS policy ...
    // Failed to fetch" -- surfaced as MODEL_REQUEST_FAILED, even though the
    // exact same request succeeds from the Agent/Debug chat loop, which
    // already runs in the Extension Host (Node has no CORS). Routing Plan
    // V2 generation through the host the same way fixes this instead of
    // trying to work around CORS client-side (not possible -- the server
    // would have to add the header itself).
    return new Promise<PlanV2GenerationResult>((resolve, reject) => {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      if (!api?.postMessage) {
        reject(new Error('VS Code API unavailable for Plan V2 generation.'));
        return;
      }
      const requestId = `plan_v2_${uuidv4()}`;
      planV2ActiveRequestRef.current = requestId;
      // Generation can involve several LLM round-trips (attempts) against
      // a possibly-slow local model -- give it real headroom, well above
      // the single-request timeout used for file-existence checks.
      const timeout = window.setTimeout(() => {
        planV2GenerateResolversRef.current.delete(requestId);
        planV2TimedOutRef.current.add(requestId);
        try {
          api.postMessage({ type: 'plan.v2.cancel', requestId });
        } catch {
          /* ignore */
        }
        if (planV2ActiveRequestRef.current === requestId) {
          planV2ActiveRequestRef.current = null;
        }
        reject(
          new Error(
            'Plan 생성이 180초를 초과해 중단했습니다. 호스트 요청을 취소했습니다. 이미 생성이 끝나 있으면 잠시 후 자동으로 반영됩니다.'
          )
        );
      }, 180000);
      planV2GenerateResolversRef.current.set(requestId, {
        resolve: (result) => {
          window.clearTimeout(timeout);
          planV2TimedOutRef.current.delete(requestId);
          if (planV2ActiveRequestRef.current === requestId) {
            planV2ActiveRequestRef.current = null;
          }
          resolve(result);
        },
        reject: (error) => {
          window.clearTimeout(timeout);
          if (planV2ActiveRequestRef.current === requestId) {
            planV2ActiveRequestRef.current = null;
          }
          reject(error);
        }
      });
      api.postMessage({
        type: 'plan.v2.generate',
        requestId,
        goal: params.goal,
        researchContext: params.researchContext,
        rejectionFeedback: params.rejectionFeedback,
        providerType,
        baseUrl: providerBaseUrl || undefined,
        apiKey: providerApiKey || undefined,
        model: providerModel
      });
    });
  }, [providerType, providerBaseUrl, providerApiKey, providerModel]);

  useEffect(() => {
    return () => {
      const id = planV2ActiveRequestRef.current;
      if (!id) return;
      try {
        const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
        api?.postMessage?.({ type: 'plan.v2.cancel', requestId: id });
      } catch {
        /* ignore */
      }
    };
  }, []);

  // ─── Plan mode lifecycle (RW-C5-01) ───────────────────
  useEffect(() => {
    planController.onStageChangeCallback((stage: PlanStage) => {
      setPlanStage(stage);
      setShowClarifying(stage === 'questions');
      // Never auto-open empty Plan editor on "planning" — agent writes the plan first.
      // Open editor only in review when a real document exists.
      if (stage === 'review' && planController.getState().planDocument?.content?.trim()) {
        setShowPlanReview(true);
      } else if (stage === 'planning' || stage === 'research' || stage === 'questions') {
        setShowPlanReview(false);
      }
    });
  }, [planController]);

  /** Persist plan draft + open Review overlay (idempotent per content hash) */
  const promotePlanToReview = useCallback(
    (planMdRaw: string, opts?: { slug?: string; title?: string }) => {
      const planMd = dedupeRepeatedPlanDocument(planMdRaw.trim());
      if (!planMd || planMd === '(no response)') return false;

      const titleMatch = planMd.match(/^#\s+(.+)$/m);
      const title = (opts?.title || titleMatch?.[1] || 'Plan').trim();
      const existingSlug = planController.getState().planDocument?.slug;
      const forced =
        opts?.slug && /^plan_[a-f0-9]+$/i.test(opts.slug) ? opts.slug : undefined;
      const slugForSave =
        forced ||
        (existingSlug && /^plan_[a-f0-9]+$/i.test(existingSlug)
          ? existingSlug
          : undefined);

      // Always write `<workspace>/.agentk/plans/tmp/plan_*.md` (even on re-open)
      try {
        const api =
          (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
        if (!api?.postMessage) {
          setError('Plan 저장: VS Code API를 사용할 수 없습니다. F5로 Extension Host를 다시 여세요.');
        } else {
          api.postMessage({
            type: 'plan.save',
            title,
            content: planMd,
            slug: slugForSave
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Plan 저장 요청 실패');
      }

      if (planMd === lastPromotedPlanRef.current && planStageRef.current === 'review') {
        setShowPlanReview(true);
        return true;
      }

      let sections: ReturnType<typeof planGenerator.parseDocument> = [];
      try {
        sections = planGenerator.parseDocument(planMd);
      } catch {
        sections = [];
      }
      void planController
        .setPlanDocument({
          slug: slugForSave || existingSlug || 'plan_pending',
          title,
          content: planMd,
          sections,
          todoCount: planGenerator.extractTodos(planMd).length,
          createdAt: Date.now()
        })
        .then(() => planController.moveToReview())
        .then(() => {
          lastPromotedPlanRef.current = planMd;
          promotePlanOnCompleteRef.current = false;
          setPlanStage('review');
          setShowPlanReview(true);
          // Always replace the latest assistant bubble with summary+TODO
          const summary = buildPlanChatSummary(planMd);
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role !== 'assistant') continue;
              next[i] = {
                ...next[i],
                content: summary,
                openingLead: undefined,
                turnProse: undefined
              };
              break;
            }
            messagesRef.current = next;
            return next;
          });
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Plan review로 이동하지 못했습니다.');
        });
      return true;
    },
    [planController]
  );

  const commitPlanV2Result = useCallback(
    async (result: PlanV2GenerationResult, opts?: { late?: boolean }) => {
      if (!result.ok || !result.plan) return false;
      const state = planV2Adapter.session.getState();
      await planV2Adapter.acceptGeneratedPlan(result.plan, {
        attempts: result.attempts,
        failures: result.failures,
        researchContext: state.researchFindings
      });
      const rendered = planV2Adapter.getFullPlanContext();
      const summary = buildPlanChatSummary(rendered);
      const content = opts?.late
        ? `Plan 생성이 타임아웃 이후 완료되어 반영했습니다.\n\n${summary}`
        : summary;
      setMessages((prev) => {
        const next = [
          ...prev,
          {
            id: uuidv4(),
            role: 'assistant' as const,
            content,
            timestamp: Date.now(),
            status: 'complete' as const
          }
        ];
        messagesRef.current = next;
        return next;
      });
      setPlanStage('review');
      setShowPlanReview(true);
      setError(null);
      return true;
    },
    [planV2Adapter]
  );

  /** Editor CodeLens / title: Build or Open Review on plan_*.md */
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'plan.fileExists.result' && data.requestId != null) {
        const requestId = String(data.requestId);
        const resolver = planFileExistsResolversRef.current.get(requestId);
        if (resolver) {
          planFileExistsResolversRef.current.delete(requestId);
          resolver.resolve(Boolean(data.exists));
        }
        return;
      }

      if (data.type === 'plan.v2.generate.result' && data.requestId != null) {
        const requestId = String(data.requestId);
        const resolver = planV2GenerateResolversRef.current.get(requestId);
        if (resolver) {
          planV2GenerateResolversRef.current.delete(requestId);
          if (data.error) {
            resolver.reject(new Error(String(data.error)));
          } else {
            resolver.resolve(data.result as PlanV2GenerationResult);
          }
          return;
        }
        if (planV2TimedOutRef.current.has(requestId)) {
          planV2TimedOutRef.current.delete(requestId);
          if (data.aborted || data.error) return;
          const late = data.result as PlanV2GenerationResult;
          if (late?.ok && late.plan) {
            void commitPlanV2Result(late, { late: true });
          }
        }
        return;
      }

      if (data.type === 'plan.toolEvidence') {
        // Plan V2 Evidence Engine — best-effort; no-ops until planV2Adapter
        // actually holds a structured PlanDocument. See PlanSession.ts.
        try {
          planV2Adapter.recordToolEvent(
            toObservedToolCall(String(data.name || ''), data.args, { success: Boolean(data.success) })
          );
        } catch {
          /* evidence correlation must never break the chat loop */
        }
        return;
      }

      if (data.type === 'plan.buildFromEditor') {
        const content = String(data.content || '').trim();
        if (!content) {
          setError('에디터 Plan이 비어 있어 Build할 수 없습니다.');
          return;
        }
        const slugRaw = String(data.slug || '');
        const slug =
          slugRaw && /^plan_[a-f0-9]+$/i.test(slugRaw) ? slugRaw : 'plan_pending';
        const title = String(data.title || 'Plan');
        setMode('plan');
        setShowPlanReview(false);
        lastPromotedPlanRef.current = content;
        void (async () => {
          try {
            await planController.setPlanDocument({
              slug,
              title,
              content,
              sections: planGenerator.parseDocument(content),
              todoCount: planGenerator.extractTodos(content).length,
              createdAt: Date.now()
            });
            // Editor "Build" used to call planController.advanceToBuild()
            // directly here -- the legacy stage FSM jumps straight to
            // 'build' while PlanSession (the V2 source of truth) never
            // sees a plan.approved event and can be left in whatever
            // phase it was already in (review/planning/even idle if the
            // editor was opened straight from a saved .md with no chat
            // session behind it). That's exactly the desync case Plan V2's
            // design doc warns about ("Session: review, Legacy: build --
            // risky, this was the old bug") and the same free-form-bypass
            // shape as "확정 진행하세요": legacy stage moves, PlanSession
            // doesn't, so EvidenceEngine/task tracking runs against a
            // session that never actually holds this plan.
            // Route through the same door as the chat Approve button
            // (ensureStructuredPlan + approve) using the edited markdown's
            // own goal/content as the research context, instead of
            // re-deriving one from a chat session that may not exist for
            // an editor-only flow.
            const researchContext =
              planV2Adapter.session.getState().researchFindings ||
              buildPlanResearchContext(planController) ||
              content;
            const goalFallback =
              planV2Adapter.session.getState().goal ||
              textFromPlanController(planController) ||
              title;
            await planV2Adapter.ensureStructuredPlan({
              goalFallback,
              researchContext,
              generate: () =>
                requestPlanV2({
                  goal: goalFallback,
                  researchContext,
                  rejectionFeedback: planV2Adapter.session.getState().rejectionFeedback.slice(-1)[0]
                })
            });
            await planV2Adapter.approve();
            await planController.advanceToBuild();
            setShowPlanReview(false);
            setPlanStage('build');
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : '에디터에서 Build를 시작하지 못했습니다.'
            );
          }
        })();
        return;
      }

      if (data.type === 'plan.openReviewFromEditor') {
        const content = String(data.content || '').trim();
        if (!content) {
          setError('에디터 Plan이 비어 있어 Review를 열 수 없습니다.');
          return;
        }
        setMode('plan');
        const slugRaw = String(data.slug || '');
        promotePlanToReview(content, {
          slug: slugRaw,
          title: String(data.title || '')
        });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [planController, promotePlanToReview, planV2Adapter, requestPlanV2, commitPlanV2Result]);

  /**
   * Recovery: PLAN is visible in chat but stage stuck on Plan —
   * auto-open Review when we detect a plan document.
   */
  useEffect(() => {
    if (mode !== 'plan') return;
    if (streaming) return;
    if (showPlanReview) return;
    if (planV2Adapter.session.getPlan()) return;
    const stage = planStage;
    if (stage !== 'planning' && stage !== 'questions' && stage !== 'research') return;
    const md = findLatestPlanMarkdown(messages);
    if (!md || !looksLikePlanDocument(md)) return;
    if (md === lastPromotedPlanRef.current) return;
    // Defer slightly so onComplete promote can win the race first
    const t = window.setTimeout(() => {
      if (planStageRef.current === 'review') return;
      promotePlanToReview(md);
    }, 400);
    return () => window.clearTimeout(t);
  }, [mode, planStage, messages, streaming, showPlanReview, promotePlanToReview, planV2Adapter]);

  // ─── AskQuestionTool in-process callback (same-bundle tests only)
  // Live Agent path uses host postMessage ask_question → delta.askQuestion
  useEffect(() => {
    askQuestionTool.onNewQuestionCallback((q: PendingQuestion) => {
      setPendingQuestions(prev => {
        if (prev.find(p => p.id === q.id)) return prev;
        const normQ = String(q.question || '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        if (
          prev.some(
            (p) =>
              String(p.question || '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase() === normQ
          )
        ) {
          return prev;
        }
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
      debugSessionSlugRef.current = undefined;
    }
  }, [mode, debugController]);

  // Reset plan chrome when leaving plan (keep chat messages).
  // Do NOT call run() on enter — that wiped Review state and leaked across tabs
  // when New chat kept mode=plan. Per-session snap park/restore owns the FSM.
  useEffect(() => {
    if (mode !== 'plan') {
      planController.reset();
      setPlanStage('research');
      setShowClarifying(false);
      setShowPlanReview(false);
      setPendingQuestions([]);
      lastPromotedPlanRef.current = '';
      promotePlanOnCompleteRef.current = false;
      planSnapBySessionRef.current.delete(sessionIdRef.current);
    }
  }, [mode, planController]);

  /**
   * Remove orphan empty streaming assistants; finalize non-empty ones.
   * Prevents hourglass bubbles left after abort/stop/resynth.
   */
  const cleanupStreamingAssistants = useCallback((prev: ChatMessage[]): ChatMessage[] => {
    return finalizeStreamingMessages(prev);
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
    opts?: {
      apiUserContent?: string;
      modeOverride?: Mode;
      planStageOverride?: string;
    }
  ) => {
    if (!text.trim() && files.length === 0) return;
    setError(null);

    // ADDON-T10: raw "/command" typed + Enter (not via composer palette Tab-select)
    if (files.length === 0 && text.trim().startsWith('/')) {
      const resolved = resolveSlashCommand(text);
      if (resolved.ok) {
        runSlashCommandRef.current?.(resolved.cmd);
        return;
      }
      setError(resolved.error);
      return;
    }

    const epoch = ++sendEpochRef.current;
    const planPhase = planV2Adapter.session.getPhase();
    const { mode: effectiveMode, decision: modeDecision } = resolveSendMode({
      userMessage: text,
      picker: modeAuto ? 'auto' : mode,
      lastTurn: lastConversationTurn(messagesRef.current),
      planSessionActive: PLAN_STICKY_PHASES.has(planPhase),
      modeOverride: opts?.modeOverride
    });
    if (effectiveMode !== mode) {
      setMode(effectiveMode);
    }
    loopSessionIdRef.current = sessionIdRef.current;

    if (effectiveMode === 'plan') {
      const phase = planV2Adapter.session.getPhase();
      if (phase === 'idle' || phase === 'completed' || phase === 'failed') {
        await planV2Adapter.start(text);
      }
    }

    // Prefetch / context: @file/@folder + inline log/snippet / line ranges
    const displayText = text;
    const mentionBlock = formatAttachmentsForPayload(files);
    let payload = opts?.apiUserContent ?? text;
    if (mentionBlock) {
      // API/harness: Cursor-like context from chips (UI bubble keeps plain text + chips)
      payload = payload.trim()
        ? `${mentionBlock}\n\n${payload}`
        : `${mentionBlock}\n\nPlease analyze the attached context.`;
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
      const harnessCtx = await buildHarnessTurnContext(
        prefetchSource || displayText,
        effectiveMode,
        'A'
      );
      if (epoch !== sendEpochRef.current) return; // superseded by stop/resynth
      payload = prependHarnessToUserPayload(payload, harnessCtx, effectiveMode);
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
      status: 'complete',
      metadata: {
        mode: effectiveMode,
        modeDecision
      }
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
    // New turn — pin to latest (user just sent)
    stickToBottomRef.current = true;
    scrollMessagesToBottom(true);
    // Fresh steps for this assistant bubble (Cursor-style, on the message)
    stepStartRef.current = {};
    turnNumberRef.current += 1;

    // AgentLoop status → toolStatus (never mix into content)
    let sawProse = false;
    /** After first tool call, further content is the final answer (not the opening lead) */
    let toolsStarted = false;
    let planPinned = false;

    const TOOL_KINDS = new Set([
      'searching',
      'reading',
      'editing',
      'running',
      'browsing',
      'asking'
    ]);

    const sealLeadFromMessage = (
      msg: ChatMessage,
      explicitTurn?: number | null
    ): ChatMessage => {
      const sealed = sealBodyBeforeTools(msg, resolveSealTurn(msg, explicitTurn));
      if (effectiveMode === 'plan' && !planPinned) {
        const md = extractPlanMarkdownFromMessage(sealed);
        if (looksLikePlanDocument(md) || looksLikePlanDraft(md)) {
          planPinned = true;
          promotePlanToReview(md);
        }
      }
      return sealed;
    };

    sendMessage(
      payload,
      files,
      apiMessages,
      effectiveMode,
      // onDelta — timeline (PRD-C0 §5.3) | ask_question | status | streamed prose
      (delta: StreamDelta) => {
        if (epoch !== sendEpochRef.current) return;
        // Host ask_question → show ClarifyingQuestions (webview cannot see host singleton)
        // Require id only — empty question used to skip UI while host still blocked → "Streaming…" freeze
        if (delta.askQuestion?.id) {
          const q = delta.askQuestion;
          const normalized = normalizeMcqQuestion(
            q.question ||
              '확인이 필요합니다. 아래에서 선택하거나 기타에 적어 주세요.',
            q.options
          );
          if (effectiveMode === 'plan') {
            planController.enterQuestionsStage();
          }
          // Debug hypothesis: register MCQ options as selectable hypotheses
          if (
            effectiveMode === 'debug' &&
            debugController.getStage() === 'hypothesis' &&
            normalized.options.length >= 2
          ) {
            for (const opt of normalized.options) {
              const title = String(opt).trim();
              if (!title || /^기타$/i.test(title) || /^other$/i.test(title)) continue;
              if (!debugController.getHypotheses().some((h) => h.title === title)) {
                debugController.addHypothesis(title, title, []);
              }
            }
            setDebugTick((t) => t + 1);
          }
          const ownerId = loopSessionIdRef.current || sessionIdRef.current;
          const qEntry = {
            id: q.id,
            question: normalized.question,
            options: normalized.options,
            required: q.required !== false,
            allowMultiple: Boolean(q.allowMultiple),
            answered: false,
          };
          // User is on another chat tab — park Waiting UI for the owner session
          if (ownerId && ownerId !== sessionIdRef.current) {
            parkedAwaitingRef.current = {
              sessionId: ownerId,
              questions: [qEntry]
            };
            planController.addQuestion({ id: q.id, question: normalized.question });
            return;
          }
          setPendingQuestions((prev) => {
            if (prev.find((p) => p.id === q.id)) return prev;
            // Model sometimes fires ask_question twice with different ids — same prompt
            const normQ = normalized.question.replace(/\s+/g, ' ').trim().toLowerCase();
            if (
              prev.some(
                (p) =>
                  String(p.question || '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase() === normQ
              )
            ) {
              return prev;
            }
            planController.addQuestion({ id: q.id, question: normalized.question });
            return [...prev, qEntry];
          });
          setShowClarifying(true);
          setAwaitingUser(true);
          return;
        }
        // Host debug FSM stage sync
        if (delta.debugStage && effectiveMode === 'debug') {
          debugController.syncStageFromHost(delta.debugStage as DebugStage);
          setDebugTick((t) => t + 1);
          return;
        }
        // Tools began — first dig ack → lead; mid-dig self-talk → Thought
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
              newMsgs[lastIdx] = sealLeadFromMessage(
                newMsgs[lastIdx],
                delta.sealTurn
              );
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
            id:
              delta.fileEdit.id ||
              `fe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
            const key = (fe.absPath || fe.path || '').replace(/\\/g, '/');
            const prevEdits = msg.fileEdits || [];
            // Same path+turn → replace (host sometimes double-posts one write)
            const idx = key
              ? prevEdits.findIndex((x) => {
                  const xk = (x.absPath || x.path || '').replace(/\\/g, '/');
                  return xk === key && (x.turn || 0) === (fe.turn || 0);
                })
              : -1;
            const fileEdits =
              idx >= 0
                ? prevEdits.map((x, i) =>
                    i === idx ? { ...fe, id: x.id || fe.id } : x
                  )
                : [...prevEdits, fe];
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
              msg = sealLeadFromMessage(msg, tl.turn);
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
              thoughtRole:
                tl.thoughtRole ??
                (tl.kind === 'thinking'
                  ? steps[idx]?.thoughtRole ?? 'opening'
                  : steps[idx]?.thoughtRole),
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
              thoughtRole: 'opening' as const,
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
          if (delta.status === 'asking') {
            const ownerId = loopSessionIdRef.current || sessionIdRef.current;
            if (!ownerId || ownerId === sessionIdRef.current) {
              setAwaitingUser(true);
            }
          }
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
              const newMsgs = [...prev];
              newMsgs[lastIdx] = {
                ...newMsgs[lastIdx],
                toolStatus: undefined // status lives in MessageSteps now
                // Never wipe content here — caused mid-answer flicker
              };
              return newMsgs;
            }
            return prev;
          });
          return;
        }
        if (delta.content) {
          if (planPinned) return;
          sawProse = true;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
              const newMsgs = [...prev];
              const msg = newMsgs[lastIdx];
              // Keep one content stream — mid-timeline seal places it after Thought
              newMsgs[lastIdx] = {
                ...msg,
                toolStatus: undefined,
                openingLead: undefined,
                content: (msg.content || '') + delta.content!
              };
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
        let completedAssistant: ChatMessage | undefined;
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx < 0 || prev[lastIdx].role !== 'assistant') return prev;
          // Already sealed (e.g. cleanup raced) — still capture for plan promote
          if (prev[lastIdx].status !== 'streaming') {
            completedAssistant = prev[lastIdx];
            return prev;
          }
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
          // Fold any legacy openingLead into body — no top lead promotion
          const leadLeft = (newMsgs[lastIdx].openingLead || '').trim();
          const body = content.trim();
          const finalContent = (
            leadLeft && body && !body.includes(leadLeft)
              ? `${leadLeft}${body}`.trim()
              : body || leadLeft
          );
          const draft = dedupeAssistantBody({
            ...newMsgs[lastIdx],
            toolStatus: undefined,
            openingLead: undefined,
            content: finalContent,
            steps,
            workedDurationMs: Math.max(
              0,
              Date.now() - (newMsgs[lastIdx].timestamp || Date.now())
            )
          });
          const hasBody = Boolean(draft.content?.trim());
          const hasOther =
            (draft.turnProse?.length ?? 0) > 0 ||
            (draft.steps?.length ?? 0) > 0 ||
            (draft.fileEdits?.length ?? 0) > 0 ||
            (draft.terminalRuns?.length ?? 0) > 0;
          newMsgs[lastIdx] = {
            ...draft,
            status: hasBody || hasOther ? 'complete' : 'error',
            content: hasBody ? draft.content : hasOther ? '' : '(no response)'
          };
          completedAssistant = newMsgs[lastIdx];
          messagesRef.current = newMsgs;
          return newMsgs;
        });
        // Plan mode: after planning turn, promote assistant text → PlanReview + plan_<hash>.md
        const stageNow = planStageRef.current;
        const shouldPromotePlan =
          effectiveMode === 'plan' &&
          !planV2Adapter.session.getPlan() &&
          (promotePlanOnCompleteRef.current ||
            stageNow === 'planning' ||
            stageNow === 'questions' ||
            stageNow === 'research');
        if (shouldPromotePlan) {
          const last =
            completedAssistant ||
            [...messagesRef.current]
              .reverse()
              .find((m) => m.role === 'assistant');
          let planMd = extractPlanMarkdownFromMessage(last);
          const soft =
            promotePlanOnCompleteRef.current || stageNow === 'planning';
          const ok = soft
            ? looksLikePlanDraft(planMd) || looksLikePlanDocument(planMd)
            : looksLikePlanDocument(planMd);
          if (!ok) {
            planMd = findLatestPlanMarkdown(messagesRef.current);
          }
          if (
            looksLikePlanDocument(planMd) ||
            (soft && looksLikePlanDraft(planMd))
          ) {
            promotePlanToReview(planMd);
          }
          // Do not clear promote flag on empty — wait for recovery / next complete
        }
        if (
          effectiveMode === 'plan' &&
          (planStageRef.current === 'research' ||
            planStageRef.current === 'questions') &&
          planController.getQuestions().length > 0 &&
          pendingQuestionsRef.current.length > 0
        ) {
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
                : err,
              workedDurationMs: Math.max(
                0,
                Date.now() - (newMsgs[lastIdx].timestamp || Date.now())
              )
            };
            return newMsgs;
          }
          return prev;
        });
      },
      opts?.planStageOverride
        ? { planStageOverride: opts.planStageOverride }
        : undefined
    );
  }, [mode, modeAuto, sendMessage, planStage, planController, planV2Adapter, cleanupStreamingAssistants, promotePlanToReview, scrollMessagesToBottom]);

  handleSendRef.current = handleSend;

  // Build-ready: Agent handoff without wiping the chat (RW-C5-04)
  useEffect(() => {
    planController.onBuildReadyCallback((_context: string) => {
      const planState = planController.getState();
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current += 1;
      setAwaitingUser(false);
      setShowClarifying(false);
      setMessages(cleanupStreamingAssistants);
      setMode('agent');
      setModeAuto(false);

      const structuredPlan = planV2Adapter.session.getPlan();
      const apiContent = structuredPlan
        ? [
            'Execute the approved Agent K plan using the current task as the execution focus.',
            '',
            planV2Adapter.getCurrentTaskContext(),
            '',
            'Use tool evidence to make progress. Do not claim a task is verified unless its verification evidence succeeds.',
            'When the current task is verified, continue with the next unblocked task.'
          ].join('\n')
        : [
            'I have approved the plan. Here is the context:',
            '',
            _context,
            '',
            'Please execute the plan step by step.'
          ].join('\n');

      queueMicrotask(() => {
        void handleSendRef.current?.('승인한 계획을 실행해 주세요. 현재 작업을 완료하고 검증까지 진행해 주세요.', [], {
          apiUserContent: apiContent,
          modeOverride: 'agent'
        });
      });
    });
  }, [planController, planV2Adapter, cleanupStreamingAssistants]);


  /**
   * Interrupt & Resynthesize.
   * - drainQueue true (default, Enter): merge remaining queue into instruction
   * - drainQueue false (Apply now): only the given text; leave other queue items
   */
  const handleResynthesize = useCallback((text: string, opts?: { drainQueue?: boolean }) => {
    stopHandlerRef.current?.interruptForResynthesize();
    sendEpochRef.current += 1;
    const drainQueue = opts?.drainQueue !== false;
    const drained = drainQueue ? msgQueue.drain() : [];
    msgQueue.pruneSettled();
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
      msgQueue.pruneSettled();
      if (drained[0]) handleSend(drained.join('\n\n'), []);
    }
  }, [msgQueue, streaming, handleSend]);

  // Flush Alt+Enter queue when the current stream finishes
  useEffect(() => {
    if (streaming) return;
    if (msgQueue.getQueued().length === 0) return;
    const t = window.setTimeout(() => {
      const drained = msgQueue.drain();
      msgQueue.pruneSettled();
      if (drained.length > 0) {
        handleSend(drained.join('\n\n'), []);
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [streaming, msgQueue, handleSend]);

  const beginPlanGenerationUi = useCallback(() => {
    setGeneratingPlan(true);
    setAwaitingUser(false);
    setShowClarifying(false);
    setMessages((prev) => {
      const next = [...prev];
      let idx = -1;
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') {
          idx = i;
          break;
        }
      }
      const nextTurn = (steps: ChatMessage['steps']): number => {
        let max = 0;
        for (const s of steps || []) {
          if (s.id === PLAN_V2_GENERATE_STEP_ID) continue;
          if (typeof s.turn === 'number' && s.turn > 0) {
            max = Math.max(max, s.turn);
            continue;
          }
          const m = String(s.id || '').match(
            /(?:thinking|planning|tool|step)[^\d]*(\d+)/i
          );
          max = Math.max(max, m ? Number(m[1]) : 1);
        }
        return max + 1;
      };
      const makeStep = (turn: number) => ({
        id: PLAN_V2_GENERATE_STEP_ID,
        kind: 'thinking' as const,
        label: 'Creating plan',
        itemStatus: 'running' as const,
        thoughtRole: 'opening' as const,
        turn
      });
      if (idx < 0) {
        next.push({
          id: uuidv4(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          status: 'streaming',
          steps: [makeStep(1)]
        });
      } else {
        const msg = next[idx];
        const existing = (msg.steps || []).find(
          (s) => s.id === PLAN_V2_GENERATE_STEP_ID
        );
        const step = makeStep(
          existing && typeof existing.turn === 'number' && existing.turn > 0
            ? existing.turn
            : nextTurn(msg.steps)
        );
        const steps = [
          ...(msg.steps || []).map((s) =>
            s.kind === 'asking' && s.itemStatus === 'running'
              ? { ...s, itemStatus: 'done' as const }
              : s.id === PLAN_V2_GENERATE_STEP_ID
                ? step
                : s
          )
        ];
        if (!steps.some((s) => s.id === PLAN_V2_GENERATE_STEP_ID)) {
          steps.push(step);
        }
        next[idx] = { ...msg, status: 'streaming', steps };
      }
      messagesRef.current = next;
      return next;
    });
  }, []);

  const endPlanGenerationUi = useCallback((ok: boolean) => {
    setGeneratingPlan(false);
    setMessages((prev) => {
      const next = prev.map((m) => {
        if (
          m.role !== 'assistant' ||
          !m.steps?.some((s) => s.id === PLAN_V2_GENERATE_STEP_ID)
        ) {
          return m;
        }
        const steps = m.steps.map((s) =>
          s.id === PLAN_V2_GENERATE_STEP_ID
            ? {
                ...s,
                itemStatus: (ok ? 'done' : 'error') as 'done' | 'error',
                label: ok ? 'Created plan' : 'Failed to create plan'
              }
            : s
        );
        return {
          ...m,
          status: m.status === 'streaming' ? 'complete' : m.status,
          steps
        };
      });
      messagesRef.current = next;
      return next;
    });
  }, []);

  /** Stop button — abort + clear streaming orphans; composer accepts new messages */
  const handleStop = useCallback(() => {
    stopHandlerRef.current?.stop('user_stop');
    sendEpochRef.current += 1; // abandon in-flight handleSend awaiting harness
    setAwaitingUser(false);
    setShowClarifying(false);
    if (generatingPlan) {
      const id = planV2ActiveRequestRef.current;
      if (id) {
        try {
          const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
          api?.postMessage?.({ type: 'plan.v2.cancel', requestId: id });
        } catch {
          /* ignore */
        }
      }
      endPlanGenerationUi(false);
    }
    setMessages(cleanupStreamingAssistants);
    setError(null);
  }, [cleanupStreamingAssistants, generatingPlan, endPlanGenerationUi]);

  /** User bubble Stop: halt run and put that message back in the composer for resend */
  const handleStopAndPrefill = useCallback(
    (content: string) => {
      handleStop();
      setComposerSeed({ text: content, nonce: Date.now() });
    },
    [handleStop]
  );

  /** Apply now: only that one item — do not drain the rest of the queue */
  const handleQueueApplyNow = useCallback((messageId: string) => {
    const msg = msgQueue.take(messageId);
    msgQueue.pruneSettled();
    if (msg) {
      handleResynthesize(msg.text, { drainQueue: false });
    }
  }, [msgQueue, handleResynthesize]);

  const handleQueueCancel = useCallback((messageId: string) => {
    msgQueue.cancelQueued(messageId);
    msgQueue.pruneSettled();
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

  const handleFork = useCallback(
    (messageId: string) => {
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return;
      if (streaming) {
        stopHandlerRef.current?.stop('user_stop');
        sendEpochRef.current += 1;
      }
      const snap = messagesRef.current.length ? messagesRef.current : messages;
      if (snap.length > 0) {
        sessionStore.saveMessages(sessionId, snap, mode);
      }
      parkPlanForSession(sessionId);
      const sliced = snap.slice(0, idx + 1);
      const forked = sessionStore.forkFromMessages(sliced, mode);
      setSessionId(forked.id);
      setMessages(sanitizeLoadedMessages(forked.messages || []));
      stepStartRef.current = {};
      setSessionList(sessionStore.list());
      setOpenTabIds((prev) => [
        forked.id,
        ...prev.filter((id) => id !== forked.id)
      ]);
      resetPlanChrome();
      setAwaitingUser(false);
      setError(null);
      parkedAwaitingRef.current = null;
      loopSessionIdRef.current = null;
    },
    [messages, streaming, sessionId, mode, parkPlanForSession, resetPlanChrome]
  );

  const handleModeChange = useCallback((newMode: ModePicker) => {
    if (newMode === 'auto') {
      setModeAuto(true);
      return;
    }
    if (newMode === mode && !modeAuto) return;
    setModeAuto(false);
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
    setShowPlanReview(false);
    setError(null);
  }, [mode, modeAuto, streaming, cleanupStreamingAssistants]);

  /** ADDON-T10: append a lightweight system notice (never sent back to the model — host filters role=system) */
  const pushSystemNotice = useCallback((content: string) => {
    const notice: ChatMessage = {
      id: uuidv4(),
      role: 'system',
      content,
      timestamp: Date.now(),
      status: 'complete'
    };
    setMessages((prev) => [...prev, notice]);
  }, []);

  /**
   * ADDON-T10: dispatch a resolved SlashCommand — shared by the composer
   * palette (Tab-select) and raw `/foo` + Enter (resolveSlashCommand).
   */
  const runSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      if (cmd.action === 'newChat') {
        handleNewChat();
        return;
      }
      if (cmd.action === 'settings') {
        setShowSettings(true);
        setSettingsTab('models');
        return;
      }
      if (cmd.action === 'mode' && cmd.mode) {
        handleModeChange(cmd.mode);
        return;
      }
      if (cmd.action === 'compact') {
        try {
          const api =
            (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
          api?.postMessage?.({ type: 'session.compact', sessionId, messageCount: messages.length });
        } catch {
          /* no host bridge (browser preview) */
        }
        pushSystemNotice(
          'Compaction requested — older turns will be summarized to free up context. (This is a best-effort request; full compaction may not be wired for every provider yet.)'
        );
        return;
      }
      if (cmd.action === 'cost') {
        const tokens = uxState.contextTokens || 0;
        const content =
          tokens > 0
            ? `Cost: ~${tokens.toLocaleString()} tokens used this session (model: ${providerModel}). Actual billing depends on your provider's pricing.`
            : 'Cost: no usage recorded yet this session — see the Status Bar for live token/cost details.';
        pushSystemNotice(content);
        return;
      }
      if (cmd.action === 'model') {
        setShowSettings(true);
        setSettingsTab('models');
        return;
      }
      if (cmd.action === 'permissions') {
        setShowSettings(true);
        setSettingsTab('permission');
        return;
      }
      if (cmd.action === 'help') {
        const lines = SLASH_COMMANDS.map((c) => `${c.label} — ${c.description}`);
        pushSystemNotice(['Available commands:', ...lines].join('\n'));
        return;
      }
      if (cmd.action === 'bestOfN') {
        try {
          const api =
            (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
          api?.postMessage?.({ type: 'host.bestOfN' });
        } catch {
          /* ignore */
        }
      }
    },
    [handleNewChat, handleModeChange, pushSystemNotice, sessionId, messages.length, uxState.contextTokens, providerModel]
  );
  runSlashCommandRef.current = runSlashCommand;

  // ─── C5-C7 핸들러 ─────────────────────────────────────

  /** Mark in-bubble ask_question rows done so the live blink stops immediately */
  const sealAskingSteps = useCallback(() => {
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (m.role !== 'assistant' || !m.steps?.length) return m;
        let local = false;
        const steps = m.steps.map((s) => {
          if (s.kind === 'asking' && s.itemStatus === 'running') {
            local = true;
            changed = true;
            return { ...s, itemStatus: 'done' as const };
          }
          return s;
        });
        return local ? { ...m, steps } : m;
      });
      return changed ? next : prev;
    });
  }, []);

  /** Plan/Agent: 질문 답변 → host RuntimeServices.resolveQuestion */
  const handlePlanAnswer = useCallback((id: string, answer: string) => {
    const next = pendingQuestionsRef.current.map((q) =>
      q.id === id ? { ...q, answer, answered: true } : q
    );
    pendingQuestionsRef.current = next;
    setPendingQuestions(next);
    planController.answerQuestion(id, answer);

    // Plan mode: selection only — hold agent until Complete Questions
    if (mode === 'plan') {
      return;
    }

    try {
      const api =
        (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'chat.answer', qid: id, answer });
    } catch {
      /* ignore */
    }
    askQuestionTool.answerQuestion(id, answer);

    if (mode === 'debug' && debugController.getStage() === 'hypothesis') {
      const match =
        debugController.getHypotheses().find((h) => h.title === answer) ||
        debugController.getHypotheses().find((h) => answer.includes(h.title));
      if (match) {
        try {
          debugController.selectHypothesis(match.id);
          setDebugTick((t) => t + 1);
        } catch {
          /* ignore */
        }
      }
    }

    const remainingUnanswered = next.filter(
      (q) => q.required !== false && !(q.answer || '').trim()
    ).length;
    if (remainingUnanswered > 0) {
      return;
    }
    sealAskingSteps();
    setShowClarifying(false);
    setAwaitingUser(false);
  }, [planController, mode, debugController, sealAskingSteps]);

  /** Plan: 질문 완료 → Planning 단계 + 계획 문서 작성 (ask_question 잠금) */
  const questionsCompleteInFlightRef = useRef(false);
  const handleQuestionsComplete = useCallback(() => {
    if (mode !== 'plan') {
      sealAskingSteps();
      setShowClarifying(false);
      setAwaitingUser(false);
      return;
    }
    if (questionsCompleteInFlightRef.current) return;
    questionsCompleteInFlightRef.current = true;

    if (streaming) {
      // Host plan.v2.generate also abortHostChatLoop() and waits on the
      // send chain before the LLM call — research turns cannot overlap.
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current += 1;
      const kept = cleanupStreamingAssistants(messagesRef.current);
      messagesRef.current = kept;
      setMessages(kept);
    }
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'chat.question.cancel' });
    } catch {
      /* ignore */
    }

    setPlanStage('planning');
    planStageRef.current = 'planning';
    setShowClarifying(false);
    setAwaitingUser(false);
    setShowPlanReview(false);
    setPendingQuestions([]);
    sealAskingSteps();
    promotePlanOnCompleteRef.current = false;
    beginPlanGenerationUi();

    const qa = planController
      .getQuestions()
      .map((q) => `- **Q:** ${q.question}\n  **A:** ${q.answer || '(no answer)'}`)
      .join('\n');
    const research = (planController.getState().researchResults || '').trim();

    void planController
      .moveToPlanning()
      .then(async () => {

        await planV2Adapter.completeResearch([
          buildPlanResearchContext(planController),
          research ? `Research notes:\n${research.slice(0, 6000)}` : '',
          'Clarifying answers:',
          qa || '(none)'
        ].filter(Boolean).join('\n\n'));

        const state = planV2Adapter.session.getState();
        const result = await requestPlanV2({
          goal: state.goal || textFromPlanController(planController),
          researchContext: state.researchFindings,
          rejectionFeedback: state.rejectionFeedback.slice(-1)[0]
        });
        if (!result.ok || !result.plan) {
          const last = result.failures[result.failures.length - 1];
          const details = last?.errors.map((e) => `- [${e.code}] ${e.message}`).join('\n') || '(no details)';
          endPlanGenerationUi(false);
          setError(`구조화된 Plan 생성에 실패했습니다.\n${details}`);
          return;
        }
        endPlanGenerationUi(true);
        await commitPlanV2Result(result);
      })
      .catch((e) => {
        endPlanGenerationUi(false);
        setError(e instanceof Error ? e.message : '구조화된 Plan 생성에 실패했습니다.');
      })
      .finally(() => { questionsCompleteInFlightRef.current = false; });
  }, [
    planController, mode, streaming, cleanupStreamingAssistants, sealAskingSteps,
    planV2Adapter, requestPlanV2, commitPlanV2Result, beginPlanGenerationUi, endPlanGenerationUi
  ]);


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

  /** Plan: Save draft content during review (does NOT build) */
  const handlePlanEdit = useCallback((content: string) => {
    const existing = planController.getState().planDocument;
    if (!existing) return;
    void planController.setPlanDocument({ ...existing, content });
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({
        type: 'plan.save',
        title: existing.title,
        content,
        quiet: true,
        slug:
          existing.slug && /^plan_[a-f0-9]+$/i.test(existing.slug)
            ? existing.slug
            : undefined
      });
    } catch {
      /* ignore */
    }
  }, [planController]);

  /** Open plan markdown in the real VS Code editor */
  const handleOpenPlanInEditor = useCallback((content: string) => {
    const existing = planController.getState().planDocument;
    if (!existing) return;
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({
        type: 'plan.save',
        title: existing.title,
        content,
        slug:
          existing.slug && /^plan_[a-f0-9]+$/i.test(existing.slug)
            ? existing.slug
            : undefined,
        openInEditor: true,
        quiet: true
      });
    } catch {
      setError('에디터에서 Plan을 열 수 없습니다.');
    }
  }, [planController]);

  /** Reload plan from disk when returning to Review (after editor edits) */
  useEffect(() => {
    if (!showPlanReview || mode !== 'plan') return;
    const slug = planController.getState().planDocument?.slug;
    if (!slug || !/^plan_[a-f0-9]+$/i.test(slug)) return;
    const reload = () => {
      try {
        const api =
          (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
        api?.postMessage?.({ type: 'plan.load', slug });
      } catch {
        /* ignore */
      }
    };
    reload();
    const onVis = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', reload);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', reload);
    };
  }, [showPlanReview, mode, planController]);

  /**
   * Plan: Approve & Execute — single door into Agent handoff.
   * Markdown-only Review is not enough: ensure PlanSession holds a structured
   * plan (regenerate once if needed), then approve. Free-form chat like
   * "확정 진행하세요" is not a substitute for this path.
   */
  const handlePlanApprove = useCallback((_content: string) => {
    void (async () => {
      try {
        const researchContext =
          planV2Adapter.session.getState().researchFindings ||
          buildPlanResearchContext(planController);
        const goalFallback =
          planV2Adapter.session.getState().goal ||
          textFromPlanController(planController) ||
          'Plan';

        await planV2Adapter.ensureStructuredPlan({
          goalFallback,
          researchContext,
          generate: () =>
            requestPlanV2({
              goal: goalFallback,
              researchContext,
              rejectionFeedback: planV2Adapter.session.getState().rejectionFeedback.slice(-1)[0]
            })
        });

        await planV2Adapter.approve();
        await planController.advanceToBuild();
        setShowPlanReview(false);
        setPlanStage('build');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Plan 승인에 실패했습니다.');
      }
    })();
  }, [planController, planV2Adapter, requestPlanV2]);

  /** Plan: Request Changes → revise PLAN.md only, never implement */
  const handlePlanReject = useCallback((reason?: string) => {
    setShowPlanReview(false);
    promotePlanOnCompleteRef.current = false;
    void (async () => {
      await planV2Adapter.reject(reason || '계획을 더 명확하게 다듬어 주세요.');
      setPlanStage('planning');
      beginPlanGenerationUi();
      const state = planV2Adapter.session.getState();
      const result = await requestPlanV2({
        goal: state.goal || textFromPlanController(planController),
        researchContext: state.researchFindings || buildPlanResearchContext(planController),
        rejectionFeedback: reason || state.rejectionFeedback.slice(-1)[0]
      });
      if (!result.ok || !result.plan) {
        const last = result.failures[result.failures.length - 1];
        const details = last?.errors.map((e) => `- [${e.code}] ${e.message}`).join('\n') || '(no details)';
        endPlanGenerationUi(false);
        setError(`수정된 Plan 생성에 실패했습니다.\n${details}`);
        return;
      }
      endPlanGenerationUi(true);
      await planV2Adapter.acceptGeneratedPlan(result.plan, {
        attempts: result.attempts,
        failures: result.failures,
        researchContext: state.researchFindings
      });
      setPlanStage('review');
      setShowPlanReview(true);
    })().catch((e) => {
      endPlanGenerationUi(false);
      setError(e instanceof Error ? e.message : 'Plan 수정에 실패했습니다.');
    });
  }, [planController, planV2Adapter, requestPlanV2, beginPlanGenerationUi, endPlanGenerationUi]);

  /** Plan: close review overlay without approving (stay on Review stage) */
  const handlePlanReviewClose = useCallback(() => {
    setShowPlanReview(false);
  }, []);

  /** Re-open Review UI (or promote latest plan markdown into Review) */
  const handleOpenReview = useCallback(() => {
    if (planStage === 'review') {
      const doc = planController.getState().planDocument?.content?.trim();
      if (doc) {
        setShowPlanReview(true);
        return;
      }
    }
    const md = findLatestPlanMarkdown(messages);
    if (md) promotePlanToReview(md);
  }, [planStage, planController, messages, promotePlanToReview]);

  /** Discard plan document and leave Review (no window.confirm — blocked in webview) */
  const handleDiscardPlan = useCallback(() => {
    const discarded =
      planController.getState().planDocument?.content?.trim() ||
      findLatestPlanMarkdown(messages);
    planV2Adapter.discard();
    // Prevent recovery effect from immediately re-promoting the same chat plan
    lastPromotedPlanRef.current = discarded || 'discarded';
    promotePlanOnCompleteRef.current = false;
    setShowPlanReview(false);
    setShowClarifying(false);
    setPendingQuestions([]);
    setAwaitingUser(false);
    setPlanStage('research');
    parkPlanForSession(sessionIdRef.current);
  }, [planController, planV2Adapter, messages, parkPlanForSession]);

  /** Debug: 가설 선택 → 계측 단계 진입 (RW-C6-01) */
  const handleSelectHypothesis = useCallback((id: string) => {
    try {
      debugController.selectHypothesis(id);
      setDebugTick(t => t + 1);
      const hyp = debugController.getHypotheses().find((h) => h.id === id);
      const state = debugController.getState();
      const content = [
        '# Debug Session Report',
        '',
        `**Stage**: ${state.stage}`,
        `**Updated**: ${new Date().toISOString()}`,
        '',
        `## Selected hypothesis`,
        hyp ? `- **${hyp.title}**: ${hyp.description}` : `- id: ${id}`,
        '',
        debugController.buildContextBlock()
      ].join('\n');
      try {
        const api =
          (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
        api?.postMessage?.({
          type: 'debug.save',
          title: hyp?.title || 'Debug Session',
          content,
          stage: state.stage,
          slug: debugSessionSlugRef.current
        });
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to select hypothesis');
    }
  }, [debugController]);

  /** Debug: Analyze → Confirm & Fix (Plan Approve equivalent) */
  const handleConfirmFix = useCallback(() => {
    const active = debugController.getActiveHypothesis();
    if (active) {
      debugController.confirmHypothesis(active.id, ['User confirmed via Confirm & Fix']);
    } else {
      const pending = debugController.getHypotheses().find((h) => h.status === 'investigating');
      if (pending) {
        debugController.confirmHypothesis(pending.id, ['User confirmed via Confirm & Fix']);
      }
    }
    debugController.moveToFix();
    setDebugTick((t) => t + 1);

    const state = debugController.getState();
    const confirmed = debugController.getActiveHypothesis();
    const title = confirmed?.title || active?.title || 'Debug Session';
    const content = [
      '# Debug Session Report',
      '',
      `**Stage**: ${state.stage}`,
      `**Updated**: ${new Date().toISOString()}`,
      '',
      '## Confirmed for Fix',
      confirmed
        ? `- **${confirmed.title}**: ${confirmed.description}`
        : '- (no active hypothesis)',
      '',
      debugController.buildContextBlock()
    ].join('\n');
    try {
      const api =
        (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({
        type: 'debug.save',
        title,
        content,
        stage: state.stage,
        slug: debugSessionSlugRef.current,
        logs: state.logs.length ? state.logs.join('\n') : undefined
      });
    } catch {
      /* ignore */
    }

    void handleSend(
      [
        '사용자가 Confirm & Fix를 눌렀습니다. 확정된 가설에 대해 **최소 수정만** 적용하세요.',
        '계측 마커 제거는 Cleanup 단계에서 합니다.',
        active ? `## Confirmed hypothesis\n${active.title}\n${active.description}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      []
    );
  }, [debugController, handleSend]);

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
    setComposerModels(getComposerModels());
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

  const handleThinkingEffortChange = useCallback((next: ThinkingEffort) => {
    const capped = clampThinkingEffort(
      next,
      resolveThinkingCapability(providerModel)
    );
    setThinkingEffort(capped);
    void configManager.set('agent-k.thinking.effort', capped);
  }, [providerModel]);

  // When model changes, snap effort onto levels that model accepts
  useEffect(() => {
    const cap = resolveThinkingCapability(providerModel);
    setThinkingEffort((prev) => {
      const next = clampThinkingEffort(prev, cap);
      if (next !== prev) {
        void configManager.set('agent-k.thinking.effort', next);
      }
      return next;
    });
  }, [providerModel]);

  const composerThinkingOptions = useMemo(
    () => thinkingOptionsForModel(providerModel),
    [providerModel]
  );

  const composerModelOptions = useMemo(() => {
    const ids = [...composerModels];
    if (providerModel && !ids.includes(providerModel)) ids.unshift(providerModel);
    return ids;
  }, [composerModels, providerModel]);

  // Load /v1/models into Composer whenever the provider endpoint changes
  useEffect(() => {
    let cancelled = false;
    const base = providerBaseUrl.replace(/\/$/, '');
    if (!base) return;
    void (async () => {
      const result = await refreshComposerModels({
        baseUrl: base,
        apiKey: providerApiKey || undefined,
        model: providerModel,
        providerType:
          providerType || String(configManager.get('agent-k.provider.type') || '')
      });
      if (cancelled) return;
      if (result.ok) {
        setComposerModels(getComposerModels());
        const active = String(configManager.get('agent-k.provider.model') || '').trim();
        if (active && active !== providerModel) {
          setProviderModel(active);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerBaseUrl, providerApiKey, providerType]);

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

  /** ADDON-T07: Checkpoints dropdown — refresh from host */
  const handleListCheckpoints = useCallback(() => {
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'checkpoint.list' });
    } catch {
      /* no host bridge (browser preview) */
    }
  }, []);

  /** ADDON-T07: restore a specific checkpoint picked from the dropdown */
  const handleRestoreCheckpoint = useCallback((id: string) => {
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'checkpoint.restore', id });
      setMessages((prev) =>
        prev.map((m) => (m.fileEdits?.length ? { ...m, fileEdits: [] } : m))
      );
    } catch {
      setError('체크포인트 복원 요청에 실패했습니다.');
    }
  }, []);

  // ─── Render ────────────────────────────────────────────
  /** Empty = top composer; once messages exist = thread + bottom composer (Cursor-like) */
  const hasConversation = messages.length > 0;

  return (
    <div className="chat-container" data-ak-ui="v0.0.2">
      <div className="chat-shell">
        <aside
          className={`chat-rail${showHistory ? ' is-open' : ''}`}
          aria-hidden={!showHistory}
          aria-label={showHistory ? '채팅 기록' : undefined}
        >
          {showHistory ? (
            <HistoryPanel
              sessions={sessionList}
              currentId={sessionId}
              onSelect={handleOpenSession}
              onDelete={handleDeleteSession}
              onNew={handleNewChat}
              onClose={handleCloseHistory}
            />
          ) : null}
        </aside>

        <div
          className={`chat-main${hasConversation ? ' chat-main--active' : ' chat-main--empty'}`}
        >
      <ChatSessionTabs
        sessions={sessionList}
        currentId={sessionId}
        openTabIds={openTabIds}
        onSelect={handleOpenSession}
        onCloseTab={handleCloseTab}
        onNew={handleNewChat}
        onHistory={handleToggleHistory}
        onSettings={handleToggleSettings}
        historyOpen={showHistory}
      />

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

      {/* Mode chrome — actions only; stage progress runs in the background */}
      {mode === 'plan' && (
        <PlanModeHeader
          currentStage={planStage}
          stages={['research', 'questions', 'planning', 'review', 'build']}
          reviewOpen={showPlanReview}
          canOpenReview={
            (planStage === 'planning' &&
              looksLikePlanDocument(findLatestPlanMarkdown(messages))) ||
            (planStage === 'review' &&
              Boolean(
                planController.getState().planDocument?.content?.trim() ||
                  looksLikePlanDocument(findLatestPlanMarkdown(messages))
              ))
          }
          onOpenReview={handleOpenReview}
          onDiscardPlan={handleDiscardPlan}
        />
      )}

      {mode === 'debug' && (
        <DebugModeUI
          currentStage={debugController.getStage()}
          hypotheses={debugController.getHypotheses()}
          activeHypothesisId={debugController.getState().activeHypothesisId}
          onSelectHypothesis={handleSelectHypothesis}
          onConfirmFix={handleConfirmFix}
        />
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

      {/* Plan review: Approve & Execute is the only path into Build */}
      {showPlanReview && planController.getState().planDocument?.content?.trim() ? (
        <div className="plan-editor-overlay" role="dialog" aria-label="Plan review">
          <PlanReview
            document={planController.getState().planDocument!}
            questionsAnswered={planController.areAllQuestionsAnswered()}
            onApprove={handlePlanApprove}
            onReject={handlePlanReject}
            onEdit={handlePlanEdit}
            onOpenInEditor={planV2Adapter.session.getPlan() ? undefined : handleOpenPlanInEditor}
            structuredSourceOfTruth={Boolean(planV2Adapter.session.getPlan())}
            tasksAwaitingVerification={tasksAwaitingVerification}
            onVerifyTask={handleVerifyTaskManually}
            onClose={handlePlanReviewClose}
            onDiscard={handleDiscardPlan}
          />
        </div>
      ) : null}

      {/* ── Settings Panel ──────────────────────────────── */}
      {showSettings && (
        <div className="settings-overlay" role="dialog" aria-label="Settings">
          <SettingsPanel
            key={settingsTab}
            initialTab={settingsTab}
            onTabChange={(tab) => rememberSettingsTab(tab as SettingsTabId)}
            onClose={handleCloseSettings}
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
        {(() => {
          const lastUserId = [...messages]
            .reverse()
            .find((m) => m.role === 'user')?.id;
          const lastAssistantId = [...messages]
            .reverse()
            .find((m) => m.role === 'assistant')?.id;
          return messages.map((item) => (
            <MessageBubble
              key={item.id}
              message={item}
              isStreaming={
                (streaming || generatingPlan) &&
                messages[messages.length - 1]?.id === item.id
              }
              isAgentRunning={streaming || generatingPlan}
              isLastUser={item.role === 'user' && item.id === lastUserId}
              isLastAssistant={
                item.role === 'assistant' && item.id === lastAssistantId
              }
              onEdit={handleEditMessage}
              onFork={handleFork}
              onStopAndPrefill={handleStopAndPrefill}
              onCopy={(content) => navigator.clipboard.writeText(content)}
              onOpenFile={handleOpenFile}
              onContinueMission={() => {
                void handleSendRef.current?.(
                  mode === 'plan'
                    ? '이어서 진행해 주세요. 리서치를 마쳤으면 결정이 필요할 때만 질문하고, 아니면 계획 문서를 작성한 뒤 요약+TODO만 보여 주세요. 혼자 질문/계획을 반복하지 마세요.'
                    : '계속. 중단하지 말고 위 도구 결과에 이어서 임무를 끝까지 완료해.',
                  []
                );
              }}
              onRegenerate={() => {
                const btn = document.querySelector(
                  '.composer-usage__regen'
                ) as HTMLButtonElement | null;
                if (btn && !btn.disabled) btn.click();
              }}
            />
          ));
        })()}
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
        {/* Stick ask_question UI above composer — never scroll off-screen at top */}
        {showClarifying && pendingQuestions.length > 0 && (
          <div className="clarifying-dock" role="region" aria-label="Clarifying questions">
            <ClarifyingQuestions
              questions={pendingQuestions.map(q => ({
                id: q.id,
                type: q.allowMultiple ? ('multiple' as const) : ('single' as const),
                question: q.question,
                options: q.options,
                required: q.required,
                answer: q.answer,
                allowMultiple: Boolean(q.allowMultiple)
              }))}
              variant={mode}
              onAnswer={handlePlanAnswer}
              onComplete={handleQuestionsComplete}
              onCancel={handleQuestionsCancel}
            />
          </div>
        )}
        <ChangedFilesBar
          files={sessionFileEdits}
          onOpenFile={handleOpenFile}
          onUndoAll={handleUndoAllEdits}
          onReview={handleReviewEdits}
          isStreaming={streaming || generatingPlan}
          onStop={handleStop}
          checkpoints={checkpoints}
          onListCheckpoints={handleListCheckpoints}
          onRestoreCheckpoint={handleRestoreCheckpoint}
        />
        <Composer
          onSend={handleSend}
          disabled={streaming || generatingPlan}
          onStop={handleStop}
          seedText={composerSeed?.text ?? null}
          seedNonce={composerSeed?.nonce ?? 0}
          onSlashCommand={runSlashCommand}
          onRegenerate={() => {
            stepStartRef.current = {};
    let toolsStarted = false;
    let planPinned = false;
    const TOOL_KINDS = new Set([
              'searching',
              'reading',
              'editing',
              'running',
              'browsing',
              'asking'
            ]);
            const sealLeadFromMessage = (
              msg: ChatMessage,
              explicitTurn?: number | null
            ): ChatMessage => {
              const sealed = sealBodyBeforeTools(msg, resolveSealTurn(msg, explicitTurn));
              if (mode === 'plan' && !planPinned) {
                const md = extractPlanMarkdownFromMessage(sealed);
                if (looksLikePlanDocument(md) || looksLikePlanDraft(md)) {
                  planPinned = true;
                  promotePlanToReview(md);
                }
              }
              return sealed;
            };
            regenerate(
              messages,
              mode,
              (delta: StreamDelta) => {
                if (delta.askQuestion?.id) {
                  const q = delta.askQuestion;
                  const normalized = normalizeMcqQuestion(
                    q.question ||
                      '확인이 필요합니다. 아래에서 선택하거나 기타에 적어 주세요.',
                    q.options
                  );
                  setPendingQuestions((prev) => {
                    if (prev.find((p) => p.id === q.id)) return prev;
                    const normQ = normalized.question
                      .replace(/\s+/g, ' ')
                      .trim()
                      .toLowerCase();
                    if (
                      prev.some(
                        (p) =>
                          String(p.question || '')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .toLowerCase() === normQ
                      )
                    ) {
                      return prev;
                    }
                    return [
                      ...prev,
                      {
                        id: q.id,
                        question: normalized.question,
                        options: normalized.options,
                        required: q.required !== false,
                        answered: false,
                      },
                    ];
                  });
                  setShowClarifying(true);
                  setAwaitingUser(true);
                  return;
                }
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
                      newMsgs[lastIdx] = sealLeadFromMessage(
                        newMsgs[lastIdx],
                        delta.sealTurn
                      );
                      return newMsgs;
                    }
                    return prev;
                  });
                  return;
                }
                if (delta.fileEdit) {
                  const fe = {
                    ...delta.fileEdit,
                    id:
                      delta.fileEdit.id ||
                      `fe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
                    const key = (fe.absPath || fe.path || '').replace(/\\/g, '/');
                    const prevEdits = msg.fileEdits || [];
                    const idx = key
                      ? prevEdits.findIndex((x) => {
                          const xk = (x.absPath || x.path || '').replace(
                            /\\/g,
                            '/'
                          );
                          return xk === key && (x.turn || 0) === (fe.turn || 0);
                        })
                      : -1;
                    const fileEdits =
                      idx >= 0
                        ? prevEdits.map((x, i) =>
                            i === idx ? { ...fe, id: x.id || fe.id } : x
                          )
                        : [...prevEdits, fe];
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
                      msg = sealLeadFromMessage(msg, tl.turn);
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
                      thoughtRole:
                        tl.thoughtRole ??
                        (tl.kind === 'thinking'
                          ? steps[idx]?.thoughtRole ?? 'opening'
                          : steps[idx]?.thoughtRole),
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
                      thoughtRole: 'opening' as const,
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
                  if (delta.status === 'asking') {
                    setAwaitingUser(true);
                  }
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
                  if (planPinned) return;
                  setMessages((prev) => {
                    const lastIdx = prev.length - 1;
                    if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
                      const newMsgs = [...prev];
                      const msg = newMsgs[lastIdx];
                      const hasToolStep = (msg.steps || []).some((s) => TOOL_KINDS.has(s.kind));
                      newMsgs[lastIdx] = {
                        ...msg,
                        toolStatus: undefined,
                        openingLead: undefined,
                        content: (msg.content || '') + delta.content!
                      };
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
                    const leadLeft = (newMsgs[lastIdx].openingLead || '').trim();
                    const body = content.trim();
                    const finalContent = (
                      leadLeft && body && !body.includes(leadLeft)
                        ? `${leadLeft}${body}`.trim()
                        : body || leadLeft
                    );
                    newMsgs[lastIdx] = {
                      ...newMsgs[lastIdx],
                      status: finalContent ? 'complete' : 'error',
                      toolStatus: undefined,
                      openingLead: undefined,
                      content: finalContent || '(no response)',
                      steps,
                      workedDurationMs: Math.max(
                        0,
                        Date.now() - (newMsgs[lastIdx].timestamp || Date.now())
                      )
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
                      content: err,
                      workedDurationMs: Math.max(
                        0,
                        Date.now() - (newMsgs[lastIdx].timestamp || Date.now())
                      )
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
          isStreaming={streaming || generatingPlan}
          isAwaitingUser={awaitingUser}
          isGeneratingPlan={generatingPlan}
          mode={modeAuto ? 'auto' : mode}
          onModeChange={handleModeChange}
          modeLabels={MODE_LABELS}
          modeTooltips={MODE_TOOLTIPS}
          modelLabel={modelLabel}
          modelId={providerModel}
          modelOptions={composerModelOptions}
          onModelChange={handleModelChange}
          thinkingEffort={thinkingEffort}
          onThinkingEffortChange={
            composerThinkingOptions.length > 0
              ? handleThinkingEffortChange
              : undefined
          }
          thinkingOptions={composerThinkingOptions}
          contextUsagePercent={contextUsagePercent}
          contextUsageLabel={contextUsageLabel}
        />
      </footer>
        </div>
      </div>
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
