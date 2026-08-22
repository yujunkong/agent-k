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
import { ConversationTurn } from './conversation';
import { selectActiveConversationMessages } from './conversation/conversationVariants';
import { PLAN_V2_GENERATE_STEP_ID, planGenerateWorkEvent } from './planGenerateStep';
import { Composer } from './components/Composer';
import { ChangedFilesBar } from './components/ChangedFilesBar';
import type { CheckpointSummary } from './components/ChangedFilesBar';
import {
  SubagentDetailView,
  collectSubagentTimeline,
  type SubagentDetailTab
} from './components/SubagentDetailView';
import { useChatStream } from './hooks/useChatStream';
import { useChatSessions, sessionStore } from './hooks/useChatSessions';
import { SendEpochMap } from './sendEpoch';
import { useHostMessages } from './hooks/useHostMessages';
import { getVsCodeApi } from './host/vscodeApi';
import {
  patchSubagentResultInEvents,
  settleWorkEvents,
  applyWorkEvent,
  upsertWorkEvents,
  workEventFromSubagentHostEvent
} from './conversation/conversationWorkEvent';
import {
  applyHostWorktreeApplyResult,
  applyHostWorktreeRejectResult,
  applyHostWorktreeReviewResult,
  beginSubagentWorktreeAction,
  type SubagentResult
} from './conversation/subagentResult';
import {
  formatInlineEditForPayload,
  parseInlineEditHostMessage,
  toInlineEditAgentRequest,
  type InlineEditContext
} from './inlineEdit';
import {
  inlineEditRejectRestorePayload,
  isInlineEditPreview,
  patchMessagesFileEditReview
} from './inlineEditReview';
import {
  MODE_LABELS,
  MODE_TOOLTIPS,
  PLAN_STICKY_PHASES,
  textFromPlanController,
  buildPlanResearchContext,
  shortModelName,
  collectSessionFileEdits,
  sanitizeLoadedMessages,
  finalizeStreamingMessages
} from './chatAppHelpers';
import {
  appendRegenerateAssistantTurn,
  createStreamingAssistantTurn
} from './regenerateTurn';
import { configManager } from '../core/ConfigManager';
import type { ChatMessage, FileEditPreview, Mode, ModePicker, Attachment } from './types';
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
import { PlanExecutionStatus } from './components/PlanExecutionStatus';
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
import type { ChatSession, ChatSessionMeta } from './ChatSessionStore';
// RW-C5-02: ask_question 도구 → ClarifyingQuestions 브리지
import { askQuestionTool } from '../tools/session/AskQuestionTool';
import type { PendingQuestion } from '../tools/session/AskQuestionTool';
import { PlanToAgent } from '../plan/PlanToAgent';
import type { ProviderType } from '../providers/types';
import { PlanModeControllerAdapter, toObservedToolCall } from '../plan/v2';
import type { ExecutionPlan } from '../plan/execution';
import {
  finalizePlanExecution,
  recordTaskExecutionFailed,
  recordTaskExecutionStarted,
  startPlanExecution,
  updatePlanExecutionSnapshot
} from '../plan/execution/planExecutionPersistence';
import { shouldShowPlanExecutionBar } from '../plan/execution/planExecutionPresentation';
import type { PlanV2GenerationResult } from '../plan/v2/PlanV2Generator';
import {
  PLAN_V2_GENERATE_TIMEOUT_MESSAGE,
  createPlanV2GenerateWatchdog
} from './planV2GenerateWatchdog';
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
import { buildResynthesizeMessages } from '../loop/synthesizeInstructions';
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
  prependHarnessToUserPayload
} from './harnessBridge';
import {
  createAssistantStreamSession
} from './assistantStreamSession';
import {
  getComposerModels,
  getUnifiedComposerModels,
  persistProviderModel,
  refreshComposerModels
} from './providerModels';
import { normalizeModelId } from '../providers/normalizeModelId';
import { getActiveProviderName } from '../providers/ModelResolver';
import { getProviderConnections } from '../providers/ProviderConnections';
import { setProviderConfigStore } from '../providers/configStore';
// ADDON-T10: slash command UX (/compact /cost /model /permissions /help)
import { SLASH_COMMANDS, resolveSlashCommand, type SlashCommand } from './composerPalette';

// Wire @agent-k/providers store → webview ConfigManager (same bag Settings + Composer use).
setProviderConfigStore({
  get: (key) => configManager.get(key),
  update: (values) => configManager.update(values),
});

export function ChatApp() {
  // Persist ConfigManager writes into VS Code / Cursor User settings.json via host.
  useEffect(() => {
    configManager.bindVSCodeUpdater((key, value) => {
      const api = getVsCodeApi();
      api?.postMessage({ type: 'config.update', key, value });
    });
  }, []);
  /** ADDON-T07: recent checkpoints for the Checkpoints dropdown (host-populated) */
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
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
  // Plan mode: one PlanModeController per chat session (never share across tabs).
  const planV2AdaptersRef = useRef<Map<string, PlanModeControllerAdapter>>(new Map());
  const [planStage, setPlanStage] = useState<PlanStage>('research');
  const [showClarifying, setShowClarifying] = useState(false);
  const [showPlanReview, setShowPlanReview] = useState(false);
  // Clarifying questions via AskQuestionTool bridge (RW-C5-02)
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  /** True while host is blocked on ask_question — Composer shows Waiting… not Streaming… */
  const [awaitingUser, setAwaitingUser] = useState(false);
  /** Plan V2 JSON generation after questions — keep timeline live */
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const generatingPlanRef = useRef(generatingPlan);
  generatingPlanRef.current = generatingPlan;
  /** Prefill composer after Stop on a user bubble */
  const [composerSeed, setComposerSeed] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
  /** Inline Edit selection context — never mixed into composerSeed text */
  const [inlineEditSeed, setInlineEditSeed] = useState<InlineEditContext | null>(
    null
  );
  const inlineEditSeedRef = useRef<InlineEditContext | null>(null);
  inlineEditSeedRef.current = inlineEditSeed;

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

  const [providerModel, setProviderModel] = useState(() => {
    // Prefer tab-scoped session provider so reload keeps the active tab's model.
    // No baked-in personal model — empty until Settings / discovery.
    const fromSession = sessionStore.loadActive().provider?.model;
    return String(fromSession || configManager.get('agent-k.provider.model') || '');
  });
  const [providerBaseUrl, setProviderBaseUrl] = useState(() => {
    const fromSession = sessionStore.loadActive().provider?.baseUrl;
    return String(fromSession || configManager.get('agent-k.provider.baseUrl') || '');
  });
  const [providerApiKey, setProviderApiKey] = useState(() => {
    const fromSession = sessionStore.loadActive().provider?.apiKey;
    return String(
      fromSession ?? configManager.get('agent-k.provider.apiKey') ?? ''
    );
  });
  const [providerType, setProviderType] = useState(() => {
    const fromSession = sessionStore.loadActive().provider?.type;
    return String(fromSession || configManager.get('agent-k.provider.type') || 'litellm');
  });
  const [composerModels, setComposerModels] = useState<string[]>(() => getComposerModels());
  const [modelContextBudget, setModelContextBudget] = useState<number>(() =>
    Number(configManager.get('agent-k.context.budget')) || 100000
  );
  const [modelContextSource, setModelContextSource] = useState<string>('fallback');
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>(() => {
    const fromSession = sessionStore.loadActive().provider?.thinkingEffort;
    return parseThinkingEffort(
      fromSession ?? configManager.get('agent-k.thinking.effort')
    );
  });

  // Refs so parkProvider can snapshot latest values without stale closures.
  const providerModelRef = useRef(providerModel);
  const providerBaseUrlRef = useRef(providerBaseUrl);
  const providerApiKeyRef = useRef(providerApiKey);
  const providerTypeRef = useRef(providerType);
  const thinkingEffortRef = useRef(thinkingEffort);
  providerModelRef.current = providerModel;
  providerBaseUrlRef.current = providerBaseUrl;
  providerApiKeyRef.current = providerApiKey;
  providerTypeRef.current = providerType;
  thinkingEffortRef.current = thinkingEffort;

  /** Skip global config writes while restoring a tab's provider (prevents cross-tab bleed). */
  const isRestoringProviderRef = useRef(false);

  /** Write current Composer provider fields into a session (tab-scoped). */
  const persistProviderToSession = useCallback(
    (id: string, patch?: Partial<NonNullable<ChatSession['provider']>>) => {
      if (!id) return;
      sessionStore.setProvider(id, {
        model: providerModelRef.current,
        thinkingEffort: thinkingEffortRef.current,
        type: providerTypeRef.current,
        baseUrl: providerBaseUrlRef.current,
        apiKey: providerApiKeyRef.current,
        ...patch
      });
    },
    []
  );

  useEffect(() => {
    const syncModels = () => setComposerModels(getComposerModels());
    const writeThroughCurrent = (
      patch: Partial<NonNullable<ChatSession['provider']>>
    ) => {
      // Settings → active tab: keep session provider aligned with globals.
      const id = sessionStore.getCurrentId();
      if (id) persistProviderToSession(id, patch);
    };
    const unsubs = [
      configManager.on('agent-k.provider.model', (_k, v) => {
        const model = String(v || '');
        setProviderModel(model);
        syncModels();
        writeThroughCurrent({ model });
      }),
      configManager.on('agent-k.provider.baseUrl', (_k, v) => {
        const baseUrl = String(v || '');
        setProviderBaseUrl(baseUrl);
        writeThroughCurrent({ baseUrl });
      }),
      configManager.on('agent-k.provider.apiKey', (_k, v) => {
        const apiKey = String(v || '');
        setProviderApiKey(apiKey);
        writeThroughCurrent({ apiKey });
      }),
      configManager.on('agent-k.provider.availableModels', syncModels),
      configManager.on('agent-k.provider.models', syncModels),
      configManager.on('agent-k.thinking.effort', (_k, v) => {
        const effort = parseThinkingEffort(v);
        setThinkingEffort(effort);
        writeThroughCurrent({ thinkingEffort: effort });
      }),
      configManager.on('agent-k.provider.type', (_k, v) => {
        const type = String(v || 'litellm');
        setProviderType(type);
        writeThroughCurrent({ type });
      }),
      configManager.on('agent-k.context.budget', (_k, v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) setModelContextBudget(n);
      }),
    ];
    syncModels();
    return () => unsubs.forEach((u) => u());
  }, [persistProviderToSession]);

  const handleWorktreeResultRef = useRef<
    (payload: Record<string, unknown>) => void
  >(() => {});

  const { streaming, sendMessage, stop, regenerate, sendWorktreeReview, sendWorktreeApply, sendWorktreeReject } = useChatStream({
    baseUrl: providerBaseUrl || '',
    model: providerModel,
    apiKey: providerApiKey || undefined,
    planStage,
    debugStage: mode === 'debug' ? debugController.getStage() : undefined,
    thinkingEffort,
    // Tab-scoped streaming UI + Stop (declared before useChatSessions — avoid circular hook order).
    activeRuntimeKey: sessionStore.getCurrentId() ?? undefined,
    onWorktreeResult: (payload) => handleWorktreeResultRef.current(payload)
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
  /** Bumped on stop/resynth so in-flight handleSend (awaiting harness) is abandoned. Per session so a second tab cannot stale the first. */
  const sendEpochRef = useRef(new SendEpochMap());
  /** After clarifying questions: next assistant complete → save as PLAN.md + open review */
  const promotePlanOnCompleteRef = useRef(false);
  /** Avoid re-promoting the same plan body in a loop */
  const lastPromotedPlanRef = useRef<string>('');
  const planStageRef = useRef(planStage);
  planStageRef.current = planStage;
  const sessionIdRef = useRef(sessionStore.loadActive().id);
  const planFileExistsResolversRef = useRef(new Map<string, { resolve: (exists: boolean) => void; reject: (error: Error) => void; }>());
  const planV2GenerateResolversRef = useRef(new Map<string, {
    sessionId: string;
    resolve: (result: PlanV2GenerationResult) => void;
    reject: (error: Error) => void;
    beginGenerateTimeout: () => void;
  }>());
  const planV2TimedOutRef = useRef(new Set<string>());
  const planV2ActiveRequestRef = useRef<string | null>(null);
  const showPlanReviewRef = useRef(showPlanReview);
  showPlanReviewRef.current = showPlanReview;
  const showClarifyingRef = useRef(showClarifying);
  showClarifyingRef.current = showClarifying;
  const pendingQuestionsRef = useRef(pendingQuestions);
  pendingQuestionsRef.current = pendingQuestions;

  /** After Plan Approve → Build: do not wipe plan chrome when mode flips to agent. */
  const planBuildHandoffRef = useRef(false);

  /**
   * Per-tab Plan chrome. Flow lives on each session's PlanModeController;
   * snap parks UI flags so background Review does not paint the active Analysis tab.
   */
  type PlanSessionSnap = {
    flow: ReturnType<PlanModeController['getState']>;
    showPlanReview: boolean;
    showClarifying: boolean;
    pendingQuestions: PendingQuestion[];
    lastPromotedPlan: string;
    promoteOnComplete: boolean;
    generatingPlan: boolean;
  };
  const planSnapBySessionRef = useRef<Map<string, PlanSessionSnap>>(new Map());

  /** Apply stage chrome only for the owning tab; otherwise update parked snap. */
  const applyPlanStageUi = useCallback(
    (ownerSessionId: string, stage: PlanStage, ctrl: PlanModeController) => {
      const hasDoc = Boolean(ctrl.getState().planDocument?.content?.trim());
      const openReview = stage === 'review' && hasDoc;
      const closeReview =
        stage === 'planning' || stage === 'research' || stage === 'questions';
      if (ownerSessionId === sessionIdRef.current) {
        setPlanStage(stage);
        setShowClarifying(stage === 'questions');
        if (openReview) setShowPlanReview(true);
        else if (closeReview) setShowPlanReview(false);
        return;
      }
      const prev = planSnapBySessionRef.current.get(ownerSessionId);
      planSnapBySessionRef.current.set(ownerSessionId, {
        flow: ctrl.getState(),
        showPlanReview: openReview
          ? true
          : closeReview
            ? false
            : Boolean(prev?.showPlanReview),
        showClarifying: stage === 'questions',
        pendingQuestions: prev?.pendingQuestions?.map((q) => ({ ...q })) || [],
        lastPromotedPlan: prev?.lastPromotedPlan || '',
        promoteOnComplete: Boolean(prev?.promoteOnComplete),
        generatingPlan: Boolean(prev?.generatingPlan)
      });
    },
    []
  );

  /** Create/reuse a Plan V2 adapter with its own legacy controller (tab isolation). */
  const ensurePlanAdapter = useCallback(
    (id: string): PlanModeControllerAdapter => {
      const key = String(id || '').trim() || 'global';
      const existing = planV2AdaptersRef.current.get(key);
      if (existing) return existing;
      const created = new PlanModeControllerAdapter(key);
      // Owner-gated: background moveToReview must not flip the visible tab's Review.
      created.legacy.onStageChangeCallback((stage: PlanStage) => {
        applyPlanStageUi(key, stage, created.legacy);
      });
      planV2AdaptersRef.current.set(key, created);
      return created;
    },
    [applyPlanStageUi]
  );

  const resetPlanChrome = useCallback(() => {
    planBuildHandoffRef.current = false;
    const currentId = sessionIdRef.current;
    if (currentId) {
      ensurePlanAdapter(currentId).legacy.reset();
    }
    setPlanStage('research');
    setShowPlanReview(false);
    setShowClarifying(false);
    setPendingQuestions([]);
    setGeneratingPlan(false);
    lastPromotedPlanRef.current = '';
    promotePlanOnCompleteRef.current = false;
  }, [ensurePlanAdapter]);

  const parkPlanForSession = useCallback(
    (id: string) => {
      if (!id) return;
      const ctrl = ensurePlanAdapter(id).legacy;
      planSnapBySessionRef.current.set(id, {
        flow: ctrl.getState(),
        showPlanReview: showPlanReviewRef.current,
        showClarifying: showClarifyingRef.current,
        pendingQuestions: pendingQuestionsRef.current.map((q) => ({ ...q })),
        lastPromotedPlan: lastPromotedPlanRef.current,
        promoteOnComplete: promotePlanOnCompleteRef.current,
        generatingPlan: generatingPlanRef.current
      });
    },
    [ensurePlanAdapter]
  );

  const restorePlanForSession = useCallback(
    (id: string) => {
      const adapter = ensurePlanAdapter(id);
      const snap = planSnapBySessionRef.current.get(id);
      if (!snap) {
        // Fresh tab: use this session's controller stage, clear chrome flags.
        setPlanStage(adapter.legacy.getState().stage || 'research');
        setShowPlanReview(false);
        setShowClarifying(false);
        setPendingQuestions([]);
        setGeneratingPlan(false);
        lastPromotedPlanRef.current = '';
        promotePlanOnCompleteRef.current = false;
        return;
      }
      adapter.legacy.hydrate(snap.flow, { emit: false });
      setPlanStage(snap.flow.stage || 'research');
      setShowPlanReview(Boolean(snap.showPlanReview));
      setShowClarifying(Boolean(snap.showClarifying));
      setPendingQuestions(snap.pendingQuestions || []);
      setGeneratingPlan(Boolean(snap.generatingPlan));
      lastPromotedPlanRef.current = snap.lastPromotedPlan || '';
      promotePlanOnCompleteRef.current = Boolean(snap.promoteOnComplete);
    },
    [ensurePlanAdapter]
  );

  /** Persist leaving-tab provider into session store (mirror plan park). */
  const parkProviderForSession = useCallback(
    (id: string) => {
      if (!id) return;
      persistProviderToSession(id);
    },
    [persistProviderToSession]
  );

  /**
   * Restore Composer provider from session.
   * Local React state only — do not thrash global active connection on tab switch.
   * New/empty sessions (no provider yet): keep the visible Composer selection and
   * stamp it onto the session so New Chat inherits the tab you left, not stale globals.
   */
  const restoreProviderForSession = useCallback(
    (id: string) => {
      isRestoringProviderRef.current = true;
      const p = sessionStore.get(id)?.provider;
      if (!p?.model && !p?.thinkingEffort && !p?.baseUrl && !p?.type) {
        persistProviderToSession(id);
        isRestoringProviderRef.current = false;
        return;
      }
      setProviderModel(String(p?.model || configManager.get('agent-k.provider.model') || ''));
      setProviderBaseUrl(
        String(p?.baseUrl || configManager.get('agent-k.provider.baseUrl') || '')
      );
      setProviderApiKey(
        String(p?.apiKey ?? configManager.get('agent-k.provider.apiKey') ?? '')
      );
      setProviderType(
        String(p?.type || configManager.get('agent-k.provider.type') || 'litellm')
      );
      setThinkingEffort(
        parseThinkingEffort(
          p?.thinkingEffort ?? configManager.get('agent-k.thinking.effort')
        )
      );
      // Release after React applies restored state (avoid thrashing global config).
      queueMicrotask(() => {
        isRestoringProviderRef.current = false;
      });
    },
    [persistProviderToSession]
  );

  /** Session that owns the in-flight host loop / ask_question waiter */
  const loopSessionIdRef = useRef<string | null>(null);
  /** Park Clarifying UI when user switches tabs while Waiting… */
  const parkedAwaitingRef = useRef<{
    sessionId: string;
    questions: PendingQuestion[];
  } | null>(null);

  const {
    sessionId,
    setSessionId,
    sessionList,
    setSessionList,
    openTabIds,
    setOpenTabIds,
    messages,
    setMessages,
    messagesRef,
    updateSessionMessages,
    getSessionMessages,
    handleNewChat,
    handleOpenSession,
    handleCloseTab,
    handleDeleteSession,
    applyHostHydration
  } = useChatSessions({
    mode,
    setMode,
    setModeAuto,
    streaming,
    awaitingUser,
    pendingQuestions,
    sendEpochRef,
    loopSessionIdRef,
    stopHandlerRef,
    stepStartRef,
    parkedAwaitingRef,
    setError,
    setShowHistory,
    setShowClarifying,
    setAwaitingUser,
    setPendingQuestions,
    lifecycle: {
      parkPlanForSession,
      restorePlanForSession,
      parkProviderForSession,
      restoreProviderForSession,
      resetPlanChrome,
      hasPlanSnap: (id) => planSnapBySessionRef.current.has(id),
      onDeletePlanSnap: (id) => {
        planSnapBySessionRef.current.delete(id);
        planV2AdaptersRef.current.delete(id);
      }
    }
  });
  sessionIdRef.current = sessionId;

  // Cursor-style subagent progress tabs (no composer — detail pane only).
  // Persisted in localStorage so tab switches / reload keep individual agent tabs open.
  const [subagentTabs, setSubagentTabs] = useState<SubagentDetailTab[]>(() =>
    sessionStore.getSubagentTabs()
  );
  const [activeSubagentId, setActiveSubagentId] = useState<string | null>(null);

  // Persist subagent tab strip whenever it changes.
  useEffect(() => {
    sessionStore.setSubagentTabs(subagentTabs);
  }, [subagentTabs]);

  const handleOpenSubagent = useCallback(
    (subagentId: string, title: string) => {
      const id = String(subagentId || '').trim();
      if (!id) return;
      const tabTitle = String(title || '').trim() || 'Agent';
      setSubagentTabs((prev) => {
        if (prev.some((t) => t.id === id)) {
          return prev.map((t) =>
            t.id === id ? { ...t, title: tabTitle, parentSessionId: sessionId } : t
          );
        }
        return [
          ...prev,
          { id, title: tabTitle, parentSessionId: sessionId }
        ];
      });
      setActiveSubagentId(id);
    },
    [sessionId]
  );

  const handleSelectSubagentTab = useCallback(
    (id: string) => {
      const tab = subagentTabs.find((t) => t.id === id);
      if (!tab) return;
      // Jump to the parent chat session so messages/provider match this agent run.
      if (tab.parentSessionId !== sessionId) {
        handleOpenSession(tab.parentSessionId);
      }
      setActiveSubagentId(id);
    },
    [subagentTabs, sessionId, handleOpenSession]
  );

  const handleCloseSubagentTab = useCallback((id: string) => {
    setSubagentTabs((prev) => prev.filter((t) => t.id !== id));
    setActiveSubagentId((cur) => (cur === id ? null : cur));
  }, []);

  const handleSelectSessionTab = useCallback(
    (id: string) => {
      // Leave subagent detail view but keep agent tabs in the strip.
      setActiveSubagentId(null);
      handleOpenSession(id);
    },
    [handleOpenSession]
  );

  // Drop subagent tabs whose parent session was deleted (not on every tab switch).
  useEffect(() => {
    const validSessionIds = new Set(sessionList.map((s) => s.id));
    setSubagentTabs((prev) => {
      const next = prev.filter((t) => validSessionIds.has(t.parentSessionId));
      return next.length === prev.length ? prev : next;
    });
  }, [sessionList]);

  useEffect(() => {
    setActiveSubagentId((cur) => {
      if (!cur) return null;
      return subagentTabs.some((t) => t.id === cur) ? cur : null;
    });
  }, [subagentTabs]);

  const activeSubagentTab = useMemo(
    () => subagentTabs.find((t) => t.id === activeSubagentId) || null,
    [subagentTabs, activeSubagentId]
  );

  /** Messages for the active subagent's parent session (may differ from current tab). */
  const subagentParentMessages = useMemo(() => {
    if (!activeSubagentTab) return messages;
    if (activeSubagentTab.parentSessionId === sessionId) return messages;
    return getSessionMessages(activeSubagentTab.parentSessionId);
  }, [activeSubagentTab, sessionId, messages, getSessionMessages]);

  const subagentDetailData = useMemo(() => {
    if (!activeSubagentTab) return null;
    return collectSubagentTimeline(subagentParentMessages, activeSubagentTab.id);
  }, [activeSubagentTab, subagentParentMessages]);

  // Plan V2 (additive): structured PlanSession running alongside the
  // existing PlanModeController stage machine. See
  // src/plan/v2/PlanModeControllerAdapter.ts — each chat tab owns its own
  // legacy controller so Review chrome cannot bleed into Analysis tabs.
  const planV2Adapter = useMemo(
    () => ensurePlanAdapter(sessionId),
    [sessionId, ensurePlanAdapter]
  );
  /** Visible Plan FSM for the active tab only. */
  const planController = planV2Adapter.legacy;
  /** Resolve the Plan V2 adapter that owns a given chat session. */
  const getPlanV2AdapterForSession = useCallback(
    (id: string) => ensurePlanAdapter(id),
    [ensurePlanAdapter]
  );
  const [planV2Tick, setPlanV2Tick] = useState(0);
  useEffect(() => {
    return planV2Adapter.session.onEvent(() => setPlanV2Tick((t) => t + 1));
  }, [planV2Adapter]);
  const tasksAwaitingVerification = useMemo(() => {
    void planV2Tick;
    const plan = planV2Adapter.session.getPlan();
    if (!plan) return [];
    return plan.tasks
      .filter((t) => planV2Adapter.session.getTaskStatus(t.id) === 'awaiting_verification')
      .map((t) => ({ id: t.id, title: t.title }));
  }, [planV2Adapter, planV2Tick]);
  const activeExecutionPlan = useMemo(() => {
    void planV2Tick;
    return planV2Adapter.session.getExecutionPlan();
  }, [planV2Adapter, planV2Tick]);
  const showPlanExecutionBar = useMemo(
    () => shouldShowPlanExecutionBar(activeExecutionPlan),
    [activeExecutionPlan]
  );
  const handleVerifyTaskManually = useCallback(
    (taskId: string) => {
      try {
        planV2Adapter.verifyTaskManually(taskId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not mark the task as verified.');
      }
    },
    [planV2Adapter]
  );

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
        getVsCodeApi();
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
      const api = getVsCodeApi();
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
      const api = getVsCodeApi();
      if (!api?.postMessage) {
        reject(new Error('VS Code API unavailable for Plan V2 generation.'));
        return;
      }
      const requestId = `plan_v2_${uuidv4()}`;
      const ownerSessionId = sessionIdRef.current;
      planV2ActiveRequestRef.current = requestId;
      const fireWatchdog = (message: string) => {
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
        reject(new Error(message));
      };
      const watchdog = createPlanV2GenerateWatchdog({
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (id) => window.clearTimeout(id as number),
        onGenerateTimeout: () => fireWatchdog(PLAN_V2_GENERATE_TIMEOUT_MESSAGE)
      });
      planV2GenerateResolversRef.current.set(requestId, {
        sessionId: ownerSessionId,
        resolve: (result) => {
          watchdog.clear();
          planV2TimedOutRef.current.delete(requestId);
          if (planV2ActiveRequestRef.current === requestId) {
            planV2ActiveRequestRef.current = null;
          }
          resolve(result);
        },
        reject: (error) => {
          watchdog.clear();
          if (planV2ActiveRequestRef.current === requestId) {
            planV2ActiveRequestRef.current = null;
          }
          reject(error);
        },
        beginGenerateTimeout: watchdog.beginGenerateTimeout
      });
      api.postMessage({
        type: 'plan.v2.generate',
        requestId,
        sessionId: ownerSessionId,
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
        const api = getVsCodeApi();
        api?.postMessage?.({ type: 'plan.v2.cancel', requestId: id });
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Stage chrome is wired per adapter in ensurePlanAdapter (owner-gated).

  /** Persist plan draft + open Review overlay (idempotent per content hash) */
  const promotePlanToReview = useCallback(
    (planMdRaw: string, opts?: { slug?: string; title?: string; sessionId?: string }) => {
      const planMd = dedupeRepeatedPlanDocument(planMdRaw.trim());
      if (!planMd || planMd === '(no response)') return false;

      const ownerSessionId = String(opts?.sessionId || sessionIdRef.current || '').trim();
      const ownerCtrl = ensurePlanAdapter(ownerSessionId).legacy;
      const isActiveOwner = ownerSessionId === sessionIdRef.current;

      const titleMatch = planMd.match(/^#\s+(.+)$/m);
      const title = (opts?.title || titleMatch?.[1] || 'Plan').trim();
      const existingSlug = ownerCtrl.getState().planDocument?.slug;
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
          getVsCodeApi();
        if (!api?.postMessage) {
          if (isActiveOwner) {
            setError('Plan save: VS Code API is unavailable. Press F5 to reopen the Extension Host.');
          }
        } else {
          api.postMessage({
            type: 'plan.save',
            title,
            content: planMd,
            slug: slugForSave,
            sessionId: ownerSessionId
          });
        }
      } catch (e) {
        if (isActiveOwner) {
          setError(e instanceof Error ? e.message : 'Plan save request failed');
        }
      }

      if (planMd === lastPromotedPlanRef.current && planStageRef.current === 'review') {
        if (isActiveOwner) setShowPlanReview(true);
        else {
          const prev = planSnapBySessionRef.current.get(ownerSessionId);
          planSnapBySessionRef.current.set(ownerSessionId, {
            flow: ownerCtrl.getState(),
            showPlanReview: true,
            showClarifying: Boolean(prev?.showClarifying),
            pendingQuestions: prev?.pendingQuestions?.map((q) => ({ ...q })) || [],
            lastPromotedPlan: planMd,
            promoteOnComplete: false,
            generatingPlan: Boolean(prev?.generatingPlan)
          });
        }
        return true;
      }

      let sections: ReturnType<typeof planGenerator.parseDocument> = [];
      try {
        sections = planGenerator.parseDocument(planMd);
      } catch {
        sections = [];
      }
      void ownerCtrl
        .setPlanDocument({
          slug: slugForSave || existingSlug || 'plan_pending',
          title,
          content: planMd,
          sections,
          todoCount: planGenerator.extractTodos(planMd).length,
          createdAt: Date.now()
        })
        .then(() => ownerCtrl.moveToReview())
        .then(() => {
          lastPromotedPlanRef.current = isActiveOwner
            ? planMd
            : lastPromotedPlanRef.current;
          promotePlanOnCompleteRef.current = isActiveOwner
            ? false
            : promotePlanOnCompleteRef.current;
          // Always replace the latest assistant bubble with summary+TODO on the owner tab.
          const summary = buildPlanChatSummary(planMd);
          updateSessionMessages(ownerSessionId, (prev) => {
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
            return next;
          });
          if (isActiveOwner) {
            setPlanStage('review');
            setShowPlanReview(true);
            promotePlanOnCompleteRef.current = false;
            lastPromotedPlanRef.current = planMd;
          } else {
            const prev = planSnapBySessionRef.current.get(ownerSessionId);
            planSnapBySessionRef.current.set(ownerSessionId, {
              flow: ownerCtrl.getState(),
              showPlanReview: true,
              showClarifying: false,
              pendingQuestions: prev?.pendingQuestions?.map((q) => ({ ...q })) || [],
              lastPromotedPlan: planMd,
              promoteOnComplete: false,
              generatingPlan: Boolean(prev?.generatingPlan)
            });
          }
        })
        .catch((e) => {
          if (isActiveOwner) {
            setError(e instanceof Error ? e.message : 'Could not move to Plan review.');
          }
        });
      return true;
    },
    [ensurePlanAdapter, updateSessionMessages]
  );

  const commitPlanV2Result = useCallback(
    async (
      result: PlanV2GenerationResult,
      ownerSessionId: string,
      opts?: { late?: boolean }
    ) => {
      if (!result.ok || !result.plan) return false;
      const ownerAdapter = getPlanV2AdapterForSession(ownerSessionId);
      const phase = ownerAdapter.session.getPhase();
      if (opts?.late && (phase === 'executing' || phase === 'completed')) {
        return false;
      }
      const state = ownerAdapter.session.getState();
      await ownerAdapter.acceptGeneratedPlan(result.plan, {
        attempts: result.attempts,
        failures: result.failures,
        researchContext: state.researchFindings
      });
      const rendered = ownerAdapter.getFullPlanContext();
      const summary = buildPlanChatSummary(rendered);
      const content = opts?.late
        ? `Plan generation finished after timeout and was applied.\n\n${summary}`
        : summary;
      updateSessionMessages(ownerSessionId, (prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: 'assistant' as const,
          content,
          timestamp: Date.now(),
          status: 'complete' as const
        }
      ]);
      if (ownerSessionId === sessionIdRef.current) {
        setPlanStage('review');
        setShowPlanReview(true);
        setGeneratingPlan(false);
        setError(null);
      } else {
        // Park Review for the owner tab — do not paint Analysis/Agent chrome.
        const prev = planSnapBySessionRef.current.get(ownerSessionId);
        planSnapBySessionRef.current.set(ownerSessionId, {
          flow: ownerAdapter.legacy.getState(),
          showPlanReview: true,
          showClarifying: false,
          pendingQuestions: prev?.pendingQuestions?.map((q) => ({ ...q })) || [],
          lastPromotedPlan: rendered,
          promoteOnComplete: false,
          generatingPlan: false
        });
      }
      return true;
    },
    [getPlanV2AdapterForSession, updateSessionMessages]
  );

  useHostMessages({
    'session.new': () => {
      handleNewChat();
    },
    'ui.history.open': () => {
      setShowHistory(true);
    },
    'ui.design.open': () => {
      setShowDesignMode(true);
    },
    'ui.review.open': (data) => {
      setShowReview(true);
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
    },
    'ui.artifacts.open': () => {
      setShowArtifacts(true);
    },
    'settings.open': (data) => {
      if (typeof data.tab === 'string') {
        const tab = data.tab === 'secrets' ? 'models' : data.tab;
        if ((SETTINGS_TAB_IDS as readonly string[]).includes(tab)) {
          rememberSettingsTab(tab as SettingsTabId);
        }
      }
      setShowSettings(true);
    },
    'plan.saved': (data) => {
      if (!data.slug) return;
      // Prefer owning session when host echoes sessionId; else active tab.
      const ownerId = String(data.sessionId || sessionIdRef.current || '').trim();
      const ctrl = ensurePlanAdapter(ownerId).legacy;
      const existing = ctrl.getState().planDocument;
      if (existing) {
        void ctrl.setPlanDocument({
          ...existing,
          slug: String(data.slug),
          title: String(data.title || existing.title)
        });
      }
      if (data.filePath) {
        console.info('[Agent K] Plan saved:', data.filePath);
        if (ownerId === sessionIdRef.current) setError(null);
      }
    },
    'plan.loaded': (data) => {
      if (data.content == null) return;
      const ownerId = String(data.sessionId || sessionIdRef.current || '').trim();
      const ctrl = ensurePlanAdapter(ownerId).legacy;
      const existing = ctrl.getState().planDocument;
      if (existing) {
        void ctrl.setPlanDocument({
          ...existing,
          slug: String(data.slug || existing.slug),
          title: String(data.title || existing.title),
          content: String(data.content),
          sections: planGenerator.parseDocument(String(data.content)),
          todoCount: planGenerator.extractTodos(String(data.content)).length
        });
      }
    },
    'plan.save.error': (data) => {
      if (data.error) setError(`Plan save failed: ${String(data.error)}`);
    },
    'plan.load.error': (data) => {
      if (data.error) setError(`Plan load failed: ${String(data.error)}`);
    },
    'debug.saved': (data) => {
      if (!data.slug) return;
      debugSessionSlugRef.current = String(data.slug);
      if (data.filePath) {
        console.info('[Agent K] Debug saved:', data.filePath);
      }
    },
    'debug.save.error': (data) => {
      if (data.error) setError(`Debug save failed: ${String(data.error)}`);
    },
    'model.context': (data) => {
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
    },
    'checkpoint.listResult': (data) => {
      const list = Array.isArray(data.checkpoints) ? data.checkpoints : [];
      setCheckpoints(
        list.map((c: { id?: unknown; label?: unknown; timestamp?: unknown }) => ({
          id: String(c.id),
          label: String(c.label || 'Checkpoint'),
          timestamp: Number(c.timestamp) || Date.now()
        }))
      );
    },
    'host.sessions.hydrate': (data) => {
      const metas = Array.isArray(data.sessions) ? data.sessions : [];
      applyHostHydration(metas as ChatSessionMeta[]);
    },
    'config.hydrate': (data) => {
      if (data.values && typeof data.values === 'object') {
        configManager.syncFromVSCode(data.values as Record<string, unknown>);
        // Flat settings.json → Settings AI Providers list + Composer catalog.
        void getProviderConnections();
        setComposerModels(getComposerModels());
      }
    },
    'plan.fileExists.result': (data) => {
      if (data.requestId == null) return;
      const requestId = String(data.requestId);
      const resolver = planFileExistsResolversRef.current.get(requestId);
      if (resolver) {
        planFileExistsResolversRef.current.delete(requestId);
        resolver.resolve(Boolean(data.exists));
      }
    },
    'plan.v2.generate.started': (data) => {
      if (data.requestId == null) return;
      planV2GenerateResolversRef.current.get(String(data.requestId))?.beginGenerateTimeout();
    },
    'plan.v2.generate.result': (data) => {
      if (data.requestId == null) return;
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
          // Do not fall back to the visible tab — that reintroduces cross-tab bleed.
          const ownerSessionId = String(data.sessionId || '').trim();
          if (!ownerSessionId) return;
          void commitPlanV2Result(late, ownerSessionId, { late: true });
        }
      }
    },
    'plan.toolEvidence': (data) => {
      try {
        const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
        const ownerAdapter = getPlanV2AdapterForSession(ownerSessionId);
        const phase = ownerAdapter.session.getPhase();
        if (phase !== 'executing' && phase !== 'completed') return;
        ownerAdapter.recordToolEvent(
          toObservedToolCall(
            String(data.name || ''),
            data.args as Record<string, unknown> | undefined,
            { success: Boolean(data.success) }
          )
        );
      } catch {
        /* evidence correlation must never break the chat loop */
      }
    },
    'plan.execution.started': (data) => {
      const plan = data.executionPlan as ExecutionPlan | undefined;
      if (!plan) return;
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      const ownerAdapter = getPlanV2AdapterForSession(ownerSessionId);
      if (!ownerAdapter.session.getExecutionPlan()) {
        startPlanExecution(ownerAdapter.session, plan);
      }
    },
    'plan.execution.updated': (data) => {
      const plan = data.executionPlan as ExecutionPlan | undefined;
      if (!plan) return;
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      const ownerAdapter = getPlanV2AdapterForSession(ownerSessionId);

      // Record task-level execution events so PlanSession.executionError
      // is populated before finalizePlanExecution reads it.
      const taskId = data.taskId as string | undefined;
      const taskEvent = data.taskEvent as string | undefined;
      if (taskId && taskEvent) {
        const execTask = plan.tasks.find((t) => t.id === taskId);
        if (execTask) {
          if (taskEvent === 'started') {
            recordTaskExecutionStarted(
              ownerAdapter.session, taskId, execTask.execution, execTask.subagentId
            );
          } else if (taskEvent === 'failed') {
            const error = (data.error as string) || `Task "${execTask.title}" failed`;
            recordTaskExecutionFailed(ownerAdapter.session, execTask, error);
          }
        }
      }

      updatePlanExecutionSnapshot(ownerAdapter.session, plan);
    },
    'plan.execution.complete': (data) => {
      const plan = data.executionPlan as ExecutionPlan | undefined;
      if (!plan) return;
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      const ownerAdapter = getPlanV2AdapterForSession(ownerSessionId);
      finalizePlanExecution(ownerAdapter.session, plan);
      const fail = plan.status === 'failed';
      if (fail && ownerSessionId === sessionIdRef.current) {
        setError(ownerAdapter.session.getExecutionError() ?? 'Plan execution failed.');
      }
      updateSessionMessages(ownerSessionId, (prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant' || !last.workItems?.length) return prev;
        return [
          ...prev.slice(0, -1),
          { ...last, workItems: settleWorkEvents(last.workItems, fail ? 'error' : 'complete') }
        ];
      });
    },
    'plan.execution.error': (data) => {
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      if (ownerSessionId === sessionIdRef.current) {
        setError(String(data.error || 'Plan execution failed.'));
      }
    },
    'plan.execution.diagnostic': (_data) => {
      // Diagnostic events are logged host-side; webview receives them for
      // future structured trace UI. No-op for now — workEvent variant below
      // handles the timeline row.
    },
    'plan.execution.workEvent': (data) => {
      const workEvent = data.workEvent as import('./conversation/conversationWorkEvent').ConversationWorkEvent | undefined;
      if (!workEvent?.id) return;
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      updateSessionMessages(ownerSessionId, (prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        const updated = applyWorkEvent(last.workItems, workEvent);
        return [...prev.slice(0, -1), { ...last, workItems: updated }];
      });
    },
    // Plan execute posts this as a top-level host message (not chat.stream).
    'subagent.event': (data) => {
      const workEvent = workEventFromSubagentHostEvent(data as Record<string, unknown>);
      if (!workEvent) return;
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      updateSessionMessages(ownerSessionId, (prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        const updated = applyWorkEvent(last.workItems, workEvent);
        return [...prev.slice(0, -1), { ...last, workItems: updated }];
      });
    },
    'plan.buildFromEditor': (data) => {
      const content = String(data.content || '').trim();
      if (!content) {
        setError('Editor Plan is empty — cannot Build.');
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
                rejectionFeedback:
                  planV2Adapter.session.getState().rejectionFeedback.slice(-1)[0]
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
              : 'Could not start Build from the editor.'
          );
        }
      })();
    },
    'plan.openReviewFromEditor': (data) => {
      const content = String(data.content || '').trim();
      if (!content) {
        setError('Editor Plan is empty — cannot open Review.');
        return;
      }
      setMode('plan');
      const slugRaw = String(data.slug || '');
      promotePlanToReview(content, {
        slug: slugRaw,
        title: String(data.title || '')
      });
    },
    'inline.edit.request': (data) => {
      const parsed = parseInlineEditHostMessage(data);
      if (!parsed) return;
      setInlineEditSeed(parsed.context);
      if (parsed.instruction) {
        setComposerSeed({ text: parsed.instruction, nonce: Date.now() });
      }
    }
  });

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
  // Skip during Approve→Build handoff — setMode('agent') must not wipe the
  // execution FSM or re-stamp Composer from stale globals.
  // Only reset THIS session's controller — parked Plan tabs keep their FSM.
  useEffect(() => {
    if (mode !== 'plan') {
      if (planBuildHandoffRef.current) return;
      const currentId = sessionIdRef.current;
      if (currentId) {
        ensurePlanAdapter(currentId).legacy.reset();
        planSnapBySessionRef.current.delete(currentId);
      }
      setPlanStage('research');
      setShowClarifying(false);
      setShowPlanReview(false);
      setPendingQuestions([]);
      setGeneratingPlan(false);
      lastPromotedPlanRef.current = '';
      promotePlanOnCompleteRef.current = false;
    }
  }, [mode, ensurePlanAdapter]);

  /**
   * Remove orphan empty streaming assistants; finalize non-empty ones.
   * Prevents hourglass bubbles left after abort/stop/resynth.
   */
  const cleanupStreamingAssistants = useCallback((prev: ChatMessage[]): ChatMessage[] => {
    return finalizeStreamingMessages(prev);
  }, []);

  const makeAssistantStream = useCallback(
    (effectiveMode: Mode, isStale?: () => boolean, ownerSessionId?: string) => {
      const ownerId = ownerSessionId || sessionIdRef.current;
      const ownerAdapter = ensurePlanAdapter(ownerId);
      return createAssistantStreamSession({
        isStale,
        ownerSessionId: ownerId,
        mode: effectiveMode,
        stepStartRef,
        turnNumberRef,
        sessionIdRef,
        loopSessionIdRef,
        parkedAwaitingRef,
        messagesRef,
        planStageRef,
        pendingQuestionsRef,
        promotePlanOnCompleteRef,
        // Owner's controller — background ask_question must not mutate Analysis tab FSM.
        planController: ownerAdapter.legacy,
        debugController,
        planV2HasPlan: () => Boolean(ownerAdapter.session.getPlan()),
        setMessages,
        updateSessionMessages,
        getSessionMessages,
        setPendingQuestions,
        setShowClarifying,
        setAwaitingUser,
        setDebugTick,
        setError,
        promotePlanToReview: (md: string) =>
          promotePlanToReview(md, { sessionId: ownerId })
      });
    },
    [
      debugController,
      ensurePlanAdapter,
      promotePlanToReview,
      updateSessionMessages,
      getSessionMessages
    ]
  );

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

    const ownerId = sessionIdRef.current;
    const epoch = sendEpochRef.current.bump(ownerId);
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
    loopSessionIdRef.current = ownerId;

    if (effectiveMode === 'plan') {
      const phase = planV2Adapter.session.getPhase();
      if (phase === 'idle' || phase === 'completed' || phase === 'failed') {
        await planV2Adapter.start(text);
      }
    }

    // Prefetch / context: @file/@folder + inline log/snippet / line ranges
    const displayText = text;
    const mentionBlock = formatAttachmentsForPayload(files);
    const inlineCtx = inlineEditSeedRef.current;
    const inlineBlock = inlineCtx ? formatInlineEditForPayload(inlineCtx) : '';
    let payload = opts?.apiUserContent ?? text;
    if (inlineBlock) {
      payload = payload.trim()
        ? `${inlineBlock}\n\n${payload}`
        : inlineBlock;
    }
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
      const prefetchSource = [inlineBlock, mentionBlock, displayText].filter(Boolean).join('\n');
      const harnessCtx = await buildHarnessTurnContext(
        prefetchSource || displayText,
        effectiveMode,
        'A'
      );
      if (sendEpochRef.current.isStale(ownerId, epoch)) return; // superseded by stop/resynth on this tab
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
      if (sendEpochRef.current.isStale(ownerId, epoch)) return;
      /* prefetch 실패는 비치명 */
    }

    if (sendEpochRef.current.isStale(ownerId, epoch)) return;

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
    const contextMessages = selectActiveConversationMessages(
      nextMessages.filter((m) => m.id !== assistantMsg.id)
    );

    const apiMessages = contextMessages.map((m) =>
      m.id === userMsg.id ? { ...m, content: payload } : m
    );
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    // New turn — pin to latest (user just sent)
    stickToBottomRef.current = true;
    scrollMessagesToBottom(true);
    // Fresh steps for this assistant bubble (Cursor-style, on the message)
    stepStartRef.current = {};
    turnNumberRef.current += 1;

    const stream = makeAssistantStream(
      effectiveMode,
      () => sendEpochRef.current.isStale(ownerId, epoch),
      ownerId
    );
    sendMessage(
      payload,
      files,
      apiMessages,
      effectiveMode,
      stream.onDelta,
      stream.onComplete,
      stream.onError,
      {
        ...(opts?.planStageOverride
          ? { planStageOverride: opts.planStageOverride }
          : {}),
        runtimeKey: ownerId,
        ...(inlineCtx
          ? { inlineEdit: toInlineEditAgentRequest(displayText, inlineCtx) }
          : {})
      }
    );
    if (inlineCtx) setInlineEditSeed(null);
  }, [mode, modeAuto, sendMessage, planStage, planController, planV2Adapter, cleanupStreamingAssistants, promotePlanToReview, scrollMessagesToBottom, makeAssistantStream]);

  handleSendRef.current = handleSend;

  const handleRegenerate = useCallback(() => {
    const ownerId = sessionIdRef.current;
    const epoch = sendEpochRef.current.bump(ownerId);
    stepStartRef.current = {};
    loopSessionIdRef.current = ownerId;
    const snapshot = messagesRef.current;
    const stream = makeAssistantStream(
      mode,
      () => sendEpochRef.current.isStale(ownerId, epoch),
      ownerId
    );
    regenerate(
      snapshot,
      mode,
      stream.onDelta,
      stream.onComplete,
      stream.onError,
      () => {
        const assistantMsg = createStreamingAssistantTurn(uuidv4());
        const cleaned = cleanupStreamingAssistants(messagesRef.current);
        const next = appendRegenerateAssistantTurn(cleaned, assistantMsg);
        messagesRef.current = next;
        setMessages(next);
        stickToBottomRef.current = true;
        scrollMessagesToBottom(true);
        turnNumberRef.current += 1;
      }
    );
  }, [
    mode,
    regenerate,
    makeAssistantStream,
    cleanupStreamingAssistants,
    scrollMessagesToBottom
  ]);

  // Build-ready: structured plan → host DAG executor; legacy markdown → agent handoff
  useEffect(() => {
    planController.onBuildReadyCallback((_context: string) => {
      // Keep Composer model/thinking across Approve — park before mode flip.
      const sid = sessionIdRef.current;
      if (sid) persistProviderToSession(sid);
      planBuildHandoffRef.current = true;

      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current.bump(sid);
      setAwaitingUser(false);
      setShowClarifying(false);
      setMessages(cleanupStreamingAssistants);
      setMode('agent');
      setModeAuto(false);
      setPlanStage('build');

      // Mode flip can thrash globals; restore this tab's Composer selection.
      queueMicrotask(() => {
        if (sid) restoreProviderForSession(sid);
      });

      const structuredPlan = planV2Adapter.session.getPlan();
      if (structuredPlan) {
        queueMicrotask(() => {
          void (async () => {
            try {
              const executionPlan = planV2Adapter.toExecutionPlan({ approvedAt: Date.now() });
              if (!planV2Adapter.session.getExecutionPlan()) {
                startPlanExecution(planV2Adapter.session, executionPlan);
              }
              const api = getVsCodeApi();
              if (!api?.postMessage) {
                setError('Plan execution requires the VS Code extension host.');
                return;
              }
              const requestId = `plan-exec-${Date.now().toString(36)}`;
              const executionSnapshot =
                planV2Adapter.session.getExecutionPlan() ?? executionPlan;
              // Use Composer (tab-scoped) runtime — not VS Code global defaults.
              api.postMessage({
                type: 'plan.execute',
                requestId,
                sessionId: sid,
                parentTurnId: `turn-${turnNumberRef.current}`,
                executionPlan: executionSnapshot,
                repoRoot: structuredPlan.repoRoot ?? executionSnapshot.repoRoot,
                model: providerModelRef.current,
                baseUrl: providerBaseUrlRef.current,
                apiKey: providerApiKeyRef.current || undefined,
                providerType: providerTypeRef.current,
                thinkingEffort: thinkingEffortRef.current
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Failed to start plan execution.');
            }
          })();
        });
        return;
      }

      const apiContent = [
        'I have approved the plan. Here is the context:',
        '',
        _context,
        '',
        'Please execute the plan step by step.'
      ].join('\n');

      queueMicrotask(() => {
        void handleSendRef.current?.('Please execute the approved plan. Finish the current work and run verification.', [], {
          apiUserContent: apiContent,
          modeOverride: 'agent'
        });
      });
    });
  }, [
    planController,
    planV2Adapter,
    cleanupStreamingAssistants,
    persistProviderToSession,
    restoreProviderForSession
  ]);

  /**
   * Interrupt & Resynthesize.
   * - drainQueue true (default, Enter): merge remaining queue into instruction
   * - drainQueue false (Apply now): only the given text; leave other queue items
   */
  const handleResynthesize = useCallback((text: string, opts?: { drainQueue?: boolean }) => {
    stopHandlerRef.current?.interruptForResynthesize();
    sendEpochRef.current.bump(sessionIdRef.current);
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

    const ownerId = sessionIdRef.current;
    const epochAtSchedule = sendEpochRef.current.get(ownerId);
    setTimeout(() => {
      if (sendEpochRef.current.isStale(ownerId, epochAtSchedule)) return;
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

  const beginPlanGenerationUi = useCallback((ownerSessionId?: string) => {
    const ownerId = String(ownerSessionId || sessionIdRef.current || '').trim();
    const isActive = ownerId === sessionIdRef.current;
    if (isActive) {
      setGeneratingPlan(true);
      setAwaitingUser(false);
      setShowClarifying(false);
    } else {
      const prev = planSnapBySessionRef.current.get(ownerId);
      planSnapBySessionRef.current.set(ownerId, {
        flow: ensurePlanAdapter(ownerId).legacy.getState(),
        showPlanReview: Boolean(prev?.showPlanReview),
        showClarifying: false,
        pendingQuestions: prev?.pendingQuestions?.map((q) => ({ ...q })) || [],
        lastPromotedPlan: prev?.lastPromotedPlan || '',
        promoteOnComplete: Boolean(prev?.promoteOnComplete),
        generatingPlan: true
      });
    }
    updateSessionMessages(ownerId, (prev) => {
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
      const planEvent = planGenerateWorkEvent('running');
      if (idx < 0) {
        next.push({
          id: uuidv4(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          status: 'streaming',
          steps: [makeStep(1)],
          workItems: [planEvent]
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
        next[idx] = {
          ...msg,
          status: 'streaming',
          steps,
          workItems: upsertWorkEvents(msg.workItems, planEvent)
        };
      }
      return next;
    });
  }, [ensurePlanAdapter, updateSessionMessages]);

  const endPlanGenerationUi = useCallback(
    (ok: boolean, ownerSessionId?: string) => {
      const ownerId = String(ownerSessionId || sessionIdRef.current || '').trim();
      const isActive = ownerId === sessionIdRef.current;
      if (isActive) {
        setGeneratingPlan(false);
      } else {
        const prev = planSnapBySessionRef.current.get(ownerId);
        if (prev) {
          planSnapBySessionRef.current.set(ownerId, {
            ...prev,
            generatingPlan: false
          });
        }
      }
      updateSessionMessages(ownerId, (prev) =>
        prev.map((m) => {
          if (
            m.role !== 'assistant' ||
            (!m.steps?.some((s) => s.id === PLAN_V2_GENERATE_STEP_ID) &&
              !m.workItems?.some((e) => e.id === PLAN_V2_GENERATE_STEP_ID))
          ) {
            return m;
          }
          const steps = (m.steps || []).map((s) =>
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
            steps,
            workItems: upsertWorkEvents(
              m.workItems,
              planGenerateWorkEvent(ok ? 'complete' : 'error')
            )
          };
        })
      );
    },
    [updateSessionMessages]
  );

  /** Stop button — abort + clear streaming orphans; composer accepts new messages */
  const handleStop = useCallback(() => {
    stopHandlerRef.current?.stop('user_stop');
    sendEpochRef.current.bump(sessionIdRef.current); // abandon in-flight handleSend awaiting harness
    setAwaitingUser(false);
    setShowClarifying(false);
    if (generatingPlan) {
      const id = planV2ActiveRequestRef.current;
      if (id) {
        try {
          const api = getVsCodeApi();
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
        sendEpochRef.current.bump(sessionIdRef.current);
      }
      const snap = messagesRef.current.length ? messagesRef.current : messages;
      if (snap.length > 0) {
        sessionStore.saveMessages(sessionId, snap, mode);
      }
      parkPlanForSession(sessionId);
      parkProviderForSession(sessionId);
      const sliced = snap.slice(0, idx + 1);
      const forked = sessionStore.forkFromMessages(sliced, mode);
      // Fork inherits the leaving tab's provider selection (still in React state).
      persistProviderToSession(forked.id);
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
    [
      messages,
      streaming,
      sessionId,
      mode,
      parkPlanForSession,
      parkProviderForSession,
      persistProviderToSession,
      resetPlanChrome
    ]
  );

  const handleModeChange = useCallback((newMode: ModePicker) => {
    if (newMode === 'auto') {
      setModeAuto(true);
      return;
    }
    if (newMode === mode && !modeAuto) return;
    // User left Build handoff intentionally — allow plan chrome reset again.
    if (newMode !== 'agent') {
      planBuildHandoffRef.current = false;
    }
    setModeAuto(false);
    // Shared transcript across modes — only tools/prompts change.
    // Stop in-flight stream so the next send uses the new mode cleanly.
    if (streaming) {
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current.bump(sessionIdRef.current);
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
            getVsCodeApi();
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
            getVsCodeApi();
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
        getVsCodeApi();
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
    const sessionPhase = planV2Adapter.session.getPhase();
    if (sessionPhase === 'executing' && planStageRef.current === 'build') {
      try {
        const api = getVsCodeApi();
        for (const q of pendingQuestionsRef.current) {
          const answer = (q.answer || '').trim();
          if (!answer) continue;
          api?.postMessage?.({ type: 'chat.answer', qid: q.id, answer });
        }
      } catch {
        /* ignore */
      }
      sealAskingSteps();
      setShowClarifying(false);
      setAwaitingUser(false);
      setPendingQuestions([]);
      return;
    }
    if (questionsCompleteInFlightRef.current) return;
    questionsCompleteInFlightRef.current = true;

    if (streaming) {
      // Host plan.v2.generate also abortHostChatLoop() and waits on the
      // send chain before the LLM call — research turns cannot overlap.
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current.bump(sessionIdRef.current);
      const kept = cleanupStreamingAssistants(messagesRef.current);
      messagesRef.current = kept;
      setMessages(kept);
    }
    try {
      const api = getVsCodeApi();
      for (const q of pendingQuestionsRef.current) {
        api?.postMessage?.({ type: 'chat.question.cancel', qid: q.id });
      }
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
          setError(`Failed to generate a structured Plan.\n${details}`);
          return;
        }
        endPlanGenerationUi(true);
        await commitPlanV2Result(result, sessionIdRef.current);
      })
      .catch((e) => {
        endPlanGenerationUi(false);
        setError(e instanceof Error ? e.message : 'Failed to generate a structured Plan.');
      })
      .finally(() => { questionsCompleteInFlightRef.current = false; });
  }, [
    planController, mode, streaming, cleanupStreamingAssistants, sealAskingSteps,
    planV2Adapter, requestPlanV2, commitPlanV2Result, beginPlanGenerationUi, endPlanGenerationUi
  ]);


  /** Plan/Agent: 질문 취소 — must unblock host waiter */
  const handleQuestionsCancel = useCallback(() => {
    try {
      const api = getVsCodeApi();
      for (const q of pendingQuestionsRef.current) {
        api?.postMessage?.({ type: 'chat.question.cancel', qid: q.id });
      }
    } catch {
      /* ignore */
    }
    askQuestionTool.clear(pendingQuestionsRef.current.map((q) => q.id));
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
      const api = getVsCodeApi();
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
      const api = getVsCodeApi();
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
      setError('Could not open the Plan from the editor.');
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
          getVsCodeApi();
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
        setError(e instanceof Error ? e.message : 'Failed to approve the Plan.');
      }
    })();
  }, [planController, planV2Adapter, requestPlanV2]);

  /** Plan: Request Changes → revise PLAN.md only, never implement */
  const handlePlanReject = useCallback((reason?: string) => {
    setShowPlanReview(false);
    promotePlanOnCompleteRef.current = false;
    void (async () => {
      await planV2Adapter.reject(reason || 'Please refine the plan so it is clearer.');
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
        setError(`Failed to regenerate the Plan.\n${details}`);
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
      setError(e instanceof Error ? e.message : 'Failed to revise the Plan.');
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
          getVsCodeApi();
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
        getVsCodeApi();
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
        'The user pressed Confirm & Fix. Apply a **minimal change** for the confirmed hypothesis.',
        'Remove instrumentation markers in the Cleanup stage.',
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
    // Restore this tab's provider from session store — do not overwrite with globals.
    const id = sessionStore.getCurrentId();
    if (id) {
      restoreProviderForSession(id);
    }
    setComposerModels(getComposerModels());
  }, [restoreProviderForSession]);

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
        getVsCodeApi();
      api?.postMessage?.({ type: 'file.open', path: filePath });
    } catch {
      /* ignore */
    }
  }, []);

  const requestModelContext = useCallback(() => {
    try {
      const api =
        getVsCodeApi();
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

  const unifiedModels = useMemo(() => getUnifiedComposerModels(), [composerModels]);
  const activeProviderName = getActiveProviderName();
  const modelCanonical = normalizeModelId(providerModel) || providerModel;
  const unifiedCurrent = unifiedModels.find((m) => m.canonicalId === modelCanonical);
  const modelLabel = unifiedCurrent
    ? `${unifiedCurrent.displayName}${activeProviderName ? ` · ${activeProviderName}` : ''}`
    : shortModelName(providerModel);

  const handleModelChange = useCallback((next: string) => {
    if (!next) return;
    persistProviderModel(next);
    const model = String(configManager.get('agent-k.provider.model') || next);
    const type = String(configManager.get('agent-k.provider.type') || 'litellm');
    const baseUrl = String(configManager.get('agent-k.provider.baseUrl') || '');
    const apiKey = String(configManager.get('agent-k.provider.apiKey') || '');
    setProviderModel(model);
    setProviderType(type);
    setProviderBaseUrl(baseUrl);
    setProviderApiKey(apiKey);
    // Keep this tab's provider independent of other sessions.
    persistProviderToSession(sessionIdRef.current, {
      model,
      type,
      baseUrl,
      apiKey
    });
  }, [persistProviderToSession]);

  const handleThinkingEffortChange = useCallback((next: ThinkingEffort) => {
    const capped = clampThinkingEffort(
      next,
      resolveThinkingCapability(providerModel)
    );
    setThinkingEffort(capped);
    void configManager.set('agent-k.thinking.effort', capped);
    persistProviderToSession(sessionIdRef.current, { thinkingEffort: capped });
  }, [providerModel, persistProviderToSession]);

  // When model changes, snap effort onto levels that model accepts
  useEffect(() => {
    if (isRestoringProviderRef.current) return;
    const cap = resolveThinkingCapability(providerModel);
    setThinkingEffort((prev) => {
      const next = clampThinkingEffort(prev, cap);
      if (next !== prev) {
        void configManager.set('agent-k.thinking.effort', next);
        const id = sessionStore.getCurrentId();
        if (id) persistProviderToSession(id, { thinkingEffort: next });
      }
      return next;
    });
  }, [providerModel, persistProviderToSession]);

  const composerThinkingOptions = useMemo(
    () => thinkingOptionsForModel(providerModel),
    [providerModel]
  );

  const composerModelOptions = useMemo(() => {
    if (unifiedModels.length > 0) {
      return unifiedModels.map((m) => ({
        id: m.canonicalId,
        label: m.displayName,
        providerName:
          m.canonicalId === modelCanonical
            ? (activeProviderName || m.providers[0]?.connectionName)
            : m.providers[0]?.connectionName,
        tags: m.tags
      }));
    }
    const ids = [...composerModels];
    if (providerModel && !ids.includes(providerModel)) ids.unshift(providerModel);
    return ids;
  }, [composerModels, providerModel, unifiedModels, activeProviderName, modelCanonical]);

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
      setError('No checkpoint to undo.');
      return;
    }
    // Earliest checkpoint undoes the whole edit batch for this session
    const earliest = withCp[0].checkpointId!;
    try {
      const api =
        getVsCodeApi();
      api?.postMessage?.({ type: 'checkpoint.restore', id: earliest });
      setMessages((prev) =>
        prev.map((m) => (m.fileEdits?.length ? { ...m, fileEdits: [] } : m))
      );
    } catch {
      setError('Undo All request failed.');
    }
  }, [sessionFileEdits]);

  const handleReviewEdits = useCallback(() => {
    if (!sessionFileEdits.length) return;
    // Open first changed file; list is already expandable in the bar
    const first = sessionFileEdits[0];
    handleOpenFile(first.absPath || first.path);
  }, [sessionFileEdits, handleOpenFile]);

  const handleAcceptFileEdit = useCallback((file: FileEditPreview) => {
    if (!isInlineEditPreview(file)) return;
    setMessages((prev) => patchMessagesFileEditReview(prev, file.id, 'accepted'));
  }, []);

  const handleRejectFileEdit = useCallback((file: FileEditPreview) => {
    if (!isInlineEditPreview(file)) return;
    if (file.checkpointId) {
      try {
        getVsCodeApi()?.postMessage?.(inlineEditRejectRestorePayload(file.checkpointId));
      } catch {
        setError('Inline Edit reject failed.');
      }
    }
    setMessages((prev) => patchMessagesFileEditReview(prev, file.id, 'rejected'));
  }, []);

  const patchSubagentWorktreeState = useCallback(
    (subagentId: string, patch: (prev: SubagentResult) => SubagentResult) => {
      const updater = (prev: ChatMessage[]) =>
        prev.map((msg) => {
          if (!Array.isArray(msg.workItems) || !msg.workItems.length) return msg;
          const nextItems = patchSubagentResultInEvents(msg.workItems, subagentId, patch);
          if (nextItems === msg.workItems) return msg;
          return { ...msg, workItems: nextItems };
        });
      setMessages(updater);
      updateSessionMessages(sessionIdRef.current, updater);
    },
    [setMessages, updateSessionMessages]
  );

  const handleWorktreeResult = useCallback(
    (payload: Record<string, unknown>) => {
      const subagentId = String(payload.subagentId || '').trim();
      if (!subagentId) return;
      const type = String(payload.type || '');
      patchSubagentWorktreeState(subagentId, (prev) => {
        if (type === 'worktree.review.result') {
          return applyHostWorktreeReviewResult(prev, payload);
        }
        if (type === 'worktree.apply.result') {
          return applyHostWorktreeApplyResult(prev, payload);
        }
        if (type === 'worktree.reject.result') {
          return applyHostWorktreeRejectResult(prev, payload);
        }
        return prev;
      });
    },
    [patchSubagentWorktreeState]
  );

  useEffect(() => {
    handleWorktreeResultRef.current = handleWorktreeResult;
  }, [handleWorktreeResult]);

  const handleWorktreeReview = useCallback(
    (subagentId: string) => {
      patchSubagentWorktreeState(subagentId, (prev) =>
        beginSubagentWorktreeAction(prev, 'reviewing')
      );
      sendWorktreeReview(subagentId);
    },
    [patchSubagentWorktreeState, sendWorktreeReview]
  );

  const handleWorktreeApply = useCallback(
    (subagentId: string) => {
      patchSubagentWorktreeState(subagentId, (prev) =>
        beginSubagentWorktreeAction(prev, 'applying')
      );
      sendWorktreeApply(subagentId);
    },
    [patchSubagentWorktreeState, sendWorktreeApply]
  );

  const handleWorktreeReject = useCallback(
    (subagentId: string) => {
      patchSubagentWorktreeState(subagentId, (prev) =>
        beginSubagentWorktreeAction(prev, 'rejecting')
      );
      sendWorktreeReject(subagentId);
    },
    [patchSubagentWorktreeState, sendWorktreeReject]
  );

  /** ADDON-T07: Checkpoints dropdown — refresh from host */
  const handleListCheckpoints = useCallback(() => {
    try {
      const api = getVsCodeApi();
      api?.postMessage?.({ type: 'checkpoint.list' });
    } catch {
      /* no host bridge (browser preview) */
    }
  }, []);

  /** ADDON-T07: restore a specific checkpoint picked from the dropdown */
  const handleRestoreCheckpoint = useCallback((id: string) => {
    try {
      const api = getVsCodeApi();
      api?.postMessage?.({ type: 'checkpoint.restore', id });
      setMessages((prev) =>
        prev.map((m) => (m.fileEdits?.length ? { ...m, fileEdits: [] } : m))
      );
    } catch {
      setError('Checkpoint restore request failed.');
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
          aria-label={showHistory ? 'Chat history' : undefined}
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
        onSelect={handleSelectSessionTab}
        onCloseTab={handleCloseTab}
        onNew={handleNewChat}
        onHistory={handleToggleHistory}
        onSettings={handleToggleSettings}
        historyOpen={showHistory}
        subagentTabs={subagentTabs}
        activeSubagentId={activeSubagentId}
        onSelectSubagent={handleSelectSubagentTab}
        onCloseSubagent={handleCloseSubagentTab}
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

      {showPlanExecutionBar && activeExecutionPlan ? (
        <PlanExecutionStatus plan={activeExecutionPlan} />
      ) : null}

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

      {/* Plan review: only while this tab is in plan mode (tab isolation). */}
      {mode === 'plan' &&
      showPlanReview &&
      planController.getState().planDocument?.content?.trim() ? (
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
        {activeSubagentTab && subagentDetailData ? (
          <SubagentDetailView
            title={activeSubagentTab.title}
            items={subagentDetailData.items}
            fileEdits={subagentDetailData.fileEdits}
            terminalRuns={subagentDetailData.terminalRuns}
            isStreaming={subagentDetailData.isStreaming}
            workedDurationMs={subagentDetailData.workedDurationMs}
            onBack={() => setActiveSubagentId(null)}
            onOpenFile={handleOpenFile}
            onAcceptFile={handleAcceptFileEdit}
            onRejectFile={handleRejectFileEdit}
            onWorktreeReview={handleWorktreeReview}
            onWorktreeApply={handleWorktreeApply}
            onWorktreeReject={handleWorktreeReject}
          />
        ) : (
        (() => {
          const lastUserId = [...messages]
            .reverse()
            .find((m) => m.role === 'user')?.id;
          const lastAssistantId = [...messages]
            .reverse()
            .find((m) => m.role === 'assistant')?.id;
          return messages.map((item) => (
            <ConversationTurn
              key={item.id}
              message={item}
              isStreaming={
                (streaming || generatingPlan || showPlanExecutionBar) &&
                messages[messages.length - 1]?.id === item.id
              }
              isAgentRunning={streaming || generatingPlan || showPlanExecutionBar}
              isLastUser={item.role === 'user' && item.id === lastUserId}
              isLastAssistant={
                item.role === 'assistant' && item.id === lastAssistantId
              }
              onEdit={handleEditMessage}
              onFork={handleFork}
              onStopAndPrefill={handleStopAndPrefill}
              onCopy={(content) => navigator.clipboard.writeText(content)}
              onOpenSubagent={handleOpenSubagent}
              onOpenFile={handleOpenFile}
              onAcceptFile={handleAcceptFileEdit}
              onRejectFile={handleRejectFileEdit}
              onWorktreeReview={handleWorktreeReview}
              onWorktreeApply={handleWorktreeApply}
              onWorktreeReject={handleWorktreeReject}
              onContinueMission={() => {
                void handleSendRef.current?.(
                  mode === 'plan'
                    ? 'Please continue. If research is done, ask only when a decision is needed; otherwise write the plan document and show a summary + TODOs. Do not loop questions and planning by yourself.'
                    : 'Continue. Do not stop — finish the task using the tool results above.',
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
        })()
        )}
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
        {showClarifying && pendingQuestions.length > 0 && !activeSubagentTab && (
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
          onAcceptFile={handleAcceptFileEdit}
          onRejectFile={handleRejectFileEdit}
        />
        {/* Keep Composer mounted while subagent tab is active so model/draft state is not lost. */}
        <div
          className={
            activeSubagentTab
              ? 'ak-composer-host ak-composer-host--hidden'
              : 'ak-composer-host'
          }
          aria-hidden={Boolean(activeSubagentTab)}
        >
        <Composer
          onSend={handleSend}
          disabled={streaming || generatingPlan}
          onStop={handleStop}
          seedText={composerSeed?.text ?? null}
          seedNonce={composerSeed?.nonce ?? 0}
          inlineEdit={inlineEditSeed}
          onClearInlineEdit={() => setInlineEditSeed(null)}
          onSlashCommand={runSlashCommand}
          onRegenerate={handleRegenerate}
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
          modelId={modelCanonical || providerModel}
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
        </div>
        {activeSubagentTab ? (
          <div className="ak-subagent-detail__composer-placeholder" aria-hidden>
            Agent progress — chat input stays on the main session tab
          </div>
        ) : null}
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
