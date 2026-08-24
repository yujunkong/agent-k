/**
 * ChatApp — 메인 채팅 애플리케이션 orchestrator (C5-C7 UI 통합)
 *
 * mode=plan  → sticky PlanCard (Build / Reject / PlanView / Discard)
 * mode=debug → DebugModeUI 패널
 * ⚙️ 설정   → SettingsPanel
 * ask_question 도구 → ClarifyingQuestions 모달
 *
 * 실제 로직은 packages/chat-ui/src/chat/app/ 하위 훅으로 이전됨:
 *   useChatProvider / useChatPlanMode / useChatDebugMode / useChatSendFlow
 *   useChatWorktree / useChatFileEdits / useChatPanels / useChatHostBridge
 * UI chrome: ChatModeChrome / ChatComposerFooter
 */
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { ConversationTurn } from './conversation';
import { selectActiveConversationMessages } from './conversation/conversationVariants';
import type { SubagentDetailTab } from './components/SubagentDetailTab';
import { useChatStream } from './hooks/useChatStream';
import { useChatSessions, sessionStore } from './hooks/useChatSessions';
import {
  ensureSubagentChildSession,
  ensureChildAssistantStreaming,
  rollingLineFromChildMessages,
  scrubChildStreamDelta
} from './subagentChildSession';
import { SendEpochMap, SessionTurnMap, SessionStepStartMap } from './sendEpoch';
import { getVsCodeApi } from './host/vscodeApi';
import type { InlineEditContext } from './inlineEdit';
import {
  MODE_LABELS,
  MODE_TOOLTIPS,
  estimateMessagesTokens,
} from './chatAppHelpers';
import { configManager } from '../core/ConfigManager';
import type { ChatMessage, Mode } from './types';
import './chat.css';

import { SettingsPanel } from '../settings/SettingsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { DesignModePanel } from '../browser/DesignModePanel';
import { FindingList } from '../review/FindingList';
import { ArtifactGallery } from '../artifacts/ArtifactGallery';
import { UXForMediumPanel } from '../harness/UXForMediumPanel';
import type { HarnessUXState, UXEventType } from '../harness/UXForMedium';
import { ChatSessionTabs } from './components/ChatSessionTabs';
import { MessageQueue } from '../loop/MessageQueue';
import { StopHandler } from '../loop/StopHandler';
import type { SlashCommand } from './composerPalette';
import type { Attachment } from './types';

// app/ 훅과 컴포넌트
import {
  useChatProvider,
  useChatPlanMode,
  useChatDebugMode,
  useChatSendFlow,
  useChatWorktree,
  useChatFileEdits,
  useChatPanels,
  ChatModeChrome,
  ChatComposerFooter,
  useChatHostBridge
} from './app';
import type { SettingsTabId } from './app';

// Wire @agent-k/providers store → webview ConfigManager (모듈 진입 시 한 번만)
import { setProviderConfigStore } from '../providers/configStore';
setProviderConfigStore({
  get: (key) => configManager.get(key),
  update: (values) => configManager.update(values),
});

export function ChatApp() {
  // VS Code 설정 write-through 바인딩
  useEffect(() => {
    configManager.bindVSCodeUpdater((key, value) => {
      const api = getVsCodeApi();
      api?.postMessage({ type: 'config.update', key, value });
    });
  }, []);

  // ─── 공유 핵심 상태 ────────────────────────────────────────
  const [mode, setMode] = useState<Mode>(() => sessionStore.loadActive().mode || 'agent');
  const [modeAuto, setModeAuto] = useState(() => {
    const loaded = sessionStore.loadActive();
    if (loaded.modeAuto !== undefined) return Boolean(loaded.modeAuto);
    return (loaded.messages?.length ?? 0) === 0;
  });
  const [error, setError] = useState<string | null>(null);
  const [awaitingUser, setAwaitingUser] = useState(false);
  const [composerSeed, setComposerSeed] = useState<{ text: string; nonce: number } | null>(null);
  /** Session tab click → focus footer composer (includes same-tab re-click) */
  const [composerFocusNonce, setComposerFocusNonce] = useState(0);
  /** Only one user bubble may be in pencil-edit at a time */
  const [editingUser, setEditingUser] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const [inlineEditSeed, setInlineEditSeed] = useState<InlineEditContext | null>(null);
  // Per-tab park maps for Composer chrome that is not in sessionStore
  const queueBySessionRef = useRef(new Map<string, import('../loop/MessageQueue').QueuedMessage[]>());
  const inlineEditBySessionRef = useRef(new Map<string, InlineEditContext | null>());
  const inlineEditSeedRef = useRef(inlineEditSeed);
  inlineEditSeedRef.current = inlineEditSeed;

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

  // ─── 공유 핵심 refs ────────────────────────────────────────
  const sessionIdRef = useRef(sessionStore.loadActive().id);
  const sendEpochRef = useRef(new SendEpochMap());
  const turnNumberRef = useRef(new SessionTurnMap());
  const loopSessionIdRef = useRef<string | null>(null);
  const parkedAwaitingRef = useRef<{ sessionId: string; questions: any[] } | null>(null);
  const stopHandlerRef = useRef<StopHandler | null>(null);
  const stepStartRef = useRef(new SessionStepStartMap());
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  /** Plan Approve → Agent handoff calls handleSend after it is defined */
  const handleSendRef = useRef<
    | ((
        text: string,
        files: Attachment[],
        opts?: { apiUserContent?: string; modeOverride?: Mode; planStageOverride?: string }
      ) => Promise<void>)
    | null
  >(null);
  /** ADDON-T10: handleSend calls runSlashCommand (defined later) */
  const runSlashCommandRef = useRef<((cmd: SlashCommand) => void) | null>(null);

  /** handleWorktreeResultRef — useChatStream 콜백; useChatWorktree에서 최신 구현체로 교체 */
  const handleWorktreeResultRef = useRef<(payload: Record<string, unknown>) => void>(() => {});
  /** SUB-010 — child stream routing (wired after sendFlow / sessions) */
  const handleChildDeltaRef = useRef<
    (sessionId: string, delta: import('./types').StreamDelta, stream: Record<string, unknown>) => void
  >(() => {});
  const handleSubagentLifecycleRef = useRef<(stream: Record<string, unknown>) => void>(() => {});
  // Comment: SUB-010 — childStreamSessionsRef + terminal fence (no reopen after settle)
  const childStreamSessionsRef = useRef(
    new Map<string, { onDelta: (d: import('./types').StreamDelta) => void; onComplete: () => void; onError: (e: string) => void }>()
  );
  const childTerminalRef = useRef(new Set<string>());

  // useChatSessions lifecycle relay refs (plan/provider 훅이 나중에 채움)
  const parkPlanRelayRef = useRef<(id: string) => void>(() => {});
  const restorePlanRelayRef = useRef<(id: string) => void>(() => {});
  const resetPlanRelayRef = useRef<() => void>(() => {});
  const hasPlanSnapRelayRef = useRef<(id: string) => boolean>(() => false);
  const onDeletePlanSnapRelayRef = useRef<(id: string) => void>(() => {});
  const parkProviderRelayRef = useRef<(id: string) => void>(() => {});
  const restoreProviderRelayRef = useRef<(id: string) => void>(() => {});

  // updateSessionMessages relay ref (useChatSessions 이후 populated)
  const updateSessionMessagesRef = useRef<
    (id: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => void
  >(() => {});

  // setMessages relay ref — useChatSessions 이후 plan 훅에 주입
  const setMessagesForPlanRef = useRef<import('react').Dispatch<import('react').SetStateAction<ChatMessage[]>>>(() => {});
  // streaming relay ref — useChatStream 이후 plan 훅에 주입
  const streamingForPlanRef = useRef(false);

  // messagesRef — useChatSessions가 채우는 공유 ref
  const messagesRef = useRef<ChatMessage[]>([]);

  // debugControllerRef — useChatDebugMode 이후 populated (plan answer debug 분기)
  const debugControllerRef = useRef<import('../debug/DebugModeController').DebugModeController | null>(null);

  // ─── MessageQueue ──────────────────────────────────────────
  const [msgQueue] = useState(() => {
    const ms =
      Number(configManager.get('agent-k.queue.resynthesizeDebounceMs')) ||
      Number(configManager.get('agent-k.queue.debounceMs')) ||
      300;
    return new MessageQueue(ms);
  });
  const [queueTick, setQueueTick] = useState(0);

  // ─── Provider 훅 (useChatStream 전에 호출 — model/url 필요) ──
  const provider = useChatProvider();

  // ─── Plan 훅 (useChatStream 전에 호출 — planStage 필요) ─────
  // setMessagesRef / streamingRef 는 아래에서 sessions/stream 초기화 후 채워짐
  const plan = useChatPlanMode({
    mode,
    setMode,
    sessionIdRef,
    updateSessionMessagesRef,
    messagesRef,
    setMessagesRef: setMessagesForPlanRef,
    setError,
    setAwaitingUser,
    streamingRef: streamingForPlanRef,
    stopHandlerRef,
    sendEpochRef,
    providerType: provider.providerType,
    providerBaseUrl: provider.providerBaseUrl,
    providerApiKey: provider.providerApiKey,
    providerModel: provider.providerModel,
    debugControllerRef,
    setDebugTick: () => {}
  });

  // ─── Stream 훅 ──────────────────────────────────────────────
  // runtimeKey tracks the active tab for streaming chrome (Stop / spinner).
  // Seeded from store; synced to React sessionId in useLayoutEffect below.
  const [runtimeKey, setRuntimeKey] = useState(
    () => sessionStore.loadActive().id
  );
  const {
    streaming,
    sendMessage,
    stop,
    sendWorktreeReview,
    sendWorktreeApply,
    sendWorktreeReject
  } = useChatStream({
    baseUrl: provider.providerBaseUrl || '',
    model: provider.providerModel,
    apiKey: provider.providerApiKey || undefined,
    planStage: plan.planStage,
    debugStage: undefined, // debug 훅 초기화 후 re-render 시 최신값이 반영됨
    thinkingEffort: provider.thinkingEffort,
    activeRuntimeKey: runtimeKey,
    onWorktreeResult: (payload) => handleWorktreeResultRef.current(payload),
    onChildDelta: (sessionId, delta, stream) =>
      handleChildDeltaRef.current(sessionId, delta, stream),
    onSubagentLifecycle: (stream) => handleSubagentLifecycleRef.current(stream)
  });

  // History setter relay — panels mounts after sessions
  const setShowHistoryRelayRef = useRef<React.Dispatch<React.SetStateAction<boolean>>>(
    () => {}
  );

  // ─── Sessions 훅 ─────────────────────────────────────────────
  const {
    sessionId,
    setSessionId,
    sessionList,
    setSessionList,
    openTabIds,
    setOpenTabIds,
    messages,
    setMessages,
    messagesRef: sessionsMessagesRef,
    updateSessionMessages,
    getSessionMessages,
    handleNewChat,
    handleOpenSession,
    handleCloseTab,
    handleDeleteSession,
    applyHostHydration
  } = useChatSessions({
    mode,
    modeAuto,
    setMode,
    setModeAuto,
    streaming,
    awaitingUser,
    pendingQuestions: plan.pendingQuestions,
    sendEpochRef,
    loopSessionIdRef,
    stopHandlerRef,
    stepStartRef,
    parkedAwaitingRef,
    setError,
    setShowHistory: (v) => setShowHistoryRelayRef.current(v),
    setShowClarifying: plan.setShowClarifying,
    setAwaitingUser,
    setPendingQuestions: plan.setPendingQuestions,
    sessionIdRef,
    parkQueueForSession: (id) => {
      if (!id) return;
      queueBySessionRef.current.set(id, msgQueue.snapshotQueued());
      msgQueue.clear();
      setQueueTick((t) => t + 1);
    },
    restoreQueueForSession: (id) => {
      if (!id) return;
      const parked = queueBySessionRef.current.get(id) || [];
      msgQueue.restoreQueued(parked);
      setQueueTick((t) => t + 1);
    },
    parkInlineEditForSession: (id) => {
      if (!id) return;
      inlineEditBySessionRef.current.set(id, inlineEditSeedRef.current);
      setInlineEditSeed(null);
    },
    restoreInlineEditForSession: (id) => {
      if (!id) return;
      const parked = inlineEditBySessionRef.current.has(id)
        ? inlineEditBySessionRef.current.get(id) ?? null
        : null;
      setInlineEditSeed(parked);
    },
    lifecycle: {
      parkPlanForSession: (id) => parkPlanRelayRef.current(id),
      restorePlanForSession: (id) => restorePlanRelayRef.current(id),
      parkProviderForSession: (id) => parkProviderRelayRef.current(id),
      restoreProviderForSession: (id) => restoreProviderRelayRef.current(id),
      resetPlanChrome: () => resetPlanRelayRef.current(),
      hasPlanSnap: (id) => hasPlanSnapRelayRef.current(id),
      onDeletePlanSnap: (id) => onDeletePlanSnapRelayRef.current(id)
    }
  });

  // plan / stream / history — bind to the React-active tab before paint
  useLayoutEffect(() => {
    setRuntimeKey(sessionId);
    plan.syncBoundSessionId(sessionId);
  }, [sessionId, plan.syncBoundSessionId]);

  // Comment: Composer Stop must track active-tab assistant status too — host
  // request map can clear one paint before message.status leaves 'streaming'.
  const activeAssistantStreaming = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i].status === 'streaming';
      }
    }
    return false;
  }, [messages]);
  const agentRunning =
    streaming ||
    plan.generatingPlan ||
    plan.showPlanExecutionBar ||
    activeAssistantStreaming;
  const composerBusy = streaming || plan.generatingPlan || activeAssistantStreaming;

  // plan relay ref 업데이트 — sessions / stream 초기화 이후 최신 구현체 반영
  streamingForPlanRef.current = streaming;
  setMessagesForPlanRef.current = setMessages;

  // relay — keep ChatApp messagesRef on the same array as sessions (hot ref, not state)
  updateSessionMessagesRef.current = updateSessionMessages;
  messagesRef.current = sessionsMessagesRef.current;
  parkPlanRelayRef.current = plan.parkPlanForSession;
  restorePlanRelayRef.current = plan.restorePlanForSession;
  resetPlanRelayRef.current = plan.resetPlanChrome;
  hasPlanSnapRelayRef.current = plan.hasPlanSnap;
  onDeletePlanSnapRelayRef.current = plan.onDeletePlanSnap;
  parkProviderRelayRef.current = provider.parkProviderForSession;
  restoreProviderRelayRef.current = provider.restoreProviderForSession;

  // ─── Debug 훅 ────────────────────────────────────────────────
  const debug = useChatDebugMode({
    mode,
    setError,
    handleSendRef
  });

  // debugControllerRef 업데이트
  debugControllerRef.current = debug.debugController;

  // ─── useChatSessions setShowHistory 연결 ────────────────────
  // setShowHistory는 panels에서 오므로 panels 먼저 초기화
  const panels = useChatPanels({
    restoreProviderForSession: provider.restoreProviderForSession,
    onSettingsClosed: () => provider.setComposerModels(provider.composerModels),
    currentSessionIdRef: sessionIdRef
  });
  setShowHistoryRelayRef.current = panels.setShowHistory;

  // ─── Worktree 훅 ─────────────────────────────────────────────
  const worktree = useChatWorktree({
    handleWorktreeResultRef,
    sessionIdRef,
    setMessages,
    updateSessionMessages,
    sendWorktreeReview,
    sendWorktreeApply,
    sendWorktreeReject
  });

  // ─── File Edits 훅 ───────────────────────────────────────────
  const fileEdits = useChatFileEdits({
    messages,
    setMessages,
    setError
  });

  // ─── Scroll 유틸 (Send Flow 전에 선언 — useChatSendFlow에 전달) ───
  const scrollMessagesToBottom = useCallback((force = false) => {
    if (!force && !stickToBottomRef.current) return;
    const list = messageListRef.current;
    const end = messageEndRef.current;
    const run = () => {
      if (!force && !stickToBottomRef.current) return;
      if (end) end.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' });
      if (list) list.scrollTop = list.scrollHeight;
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, []);

  const onMessageListScroll = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = gap < 96;
  }, []);

  // ─── Send Flow 훅 ────────────────────────────────────────────
  const sendFlow = useChatSendFlow({
    mode,
    modeAuto,
    setMode,
    setModeAuto,
    messages,
    messagesRef: sessionsMessagesRef,
    sessionId,
    sessionIdRef,
    setMessages,
    setSessionId,
    setSessionList,
    setOpenTabIds,
    sendMessage,
    stop,
    planStage: plan.planStage,
    planController: plan.planController,
    planAdapter: plan.planAdapter,
    planGenerateActiveRequestRef: plan.planGenerateActiveRequestRef,
    generatingPlan: plan.generatingPlan,
    endPlanGenerationUi: plan.endPlanGenerationUi,
    msgQueue,
    queueTick,
    setQueueTick,
    stopHandlerRef,
    sendEpochRef,
    turnNumberRef,
    loopSessionIdRef,
    stepStartRef,
    parkedAwaitingRef,
    streaming,
    uxState,
    setUxState,
    setStuckEvent,
    inlineEditSeed,
    setInlineEditSeed,
    composerSeed,
    setComposerSeed,
    setAwaitingUser,
    setShowClarifying: plan.setShowClarifying,
    setShowSettings: panels.setShowSettings,
    setSettingsTab: (tab: string) =>
      panels.rememberSettingsTab(tab as SettingsTabId),
    setError,
    scrollMessagesToBottom,
    stickToBottomRef,
    resetPlanChrome: plan.resetPlanChrome,
    parkPlanForSession: plan.parkPlanForSession,
    parkProviderForSession: provider.parkProviderForSession,
    persistProviderToSession: provider.persistProviderToSession,
    restoreProviderForSession: provider.restoreProviderForSession,
    providerModelRef: provider.providerModelRef,
    providerBaseUrlRef: provider.providerBaseUrlRef,
    providerApiKeyRef: provider.providerApiKeyRef,
    providerTypeRef: provider.providerTypeRef,
    thinkingEffortRef: provider.thinkingEffortRef,
    providerModel: provider.providerModel,
    handleSendRef,
    runSlashCommandRef,
    debugController: debug.debugController,
    planStageRef: plan.planStageRef,
    pendingQuestionsRef: plan.pendingQuestionsRef,
    promotePlanOnCompleteRef: plan.promotePlanOnCompleteRef,
    promotePlanToReview: plan.promotePlanToReview,
    ensurePlanAdapter: plan.ensurePlanAdapter,
    updateSessionMessages,
    getSessionMessages,
    setPendingQuestions: plan.setPendingQuestions,
    handleNewChat
  });

  // 메시지 변경 시 sticky scroll
  useEffect(() => {
    scrollMessagesToBottom(false);
  }, [messages, scrollMessagesToBottom]);

  // Tab switch closes any open pencil editor
  useEffect(() => {
    setEditingUser(null);
  }, [sessionId]);

  // Pencil edit: click anywhere outside the inline composer (or its menus) closes it.
  // Blur alone is unreliable — message bubbles aren't focusable.
  useEffect(() => {
    if (!editingUser) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (
        t.closest(
          '.user-turn-composer, .model-selector__menu, .mode-selector__menu'
        )
      ) {
        return;
      }
      setEditingUser(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [editingUser]);

  // Tab switch: briefly ignore MutationObserver nudges so Mermaid/DOM remount
  // does not flood rAF scrollIntoView and freeze the UI.
  const scrollSilenceUntilRef = useRef(0);
  useLayoutEffect(() => {
    scrollSilenceUntilRef.current = Date.now() + 320;
  }, [sessionId]);

  // DOM 성장 추적 (Thought / markdown)
  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    let scheduled = false;
    const nudge = () => {
      if (Date.now() < scrollSilenceUntilRef.current) return;
      if (!stickToBottomRef.current) return;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scrollMessagesToBottom(false);
      });
    };
    const mo = new MutationObserver(nudge);
    mo.observe(list, { childList: true, subtree: true, characterData: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(nudge);
      ro.observe(list);
    }
    return () => { mo.disconnect(); ro?.disconnect(); };
  }, [scrollMessagesToBottom]);

  // ─── Subagent 탭 관리 ─────────────────────────────────────────
  const [subagentTabs, setSubagentTabs] = useState<SubagentDetailTab[]>(() =>
    sessionStore.getSubagentTabs()
  );
  const [activeSubagentId, setActiveSubagentId] = useState<string | null>(null);
  /** Bump when active child session streams so detail re-reads store. */
  const [subagentDetailTick, setSubagentDetailTick] = useState(0);
  const activeSubagentIdRef = useRef<string | null>(null);
  activeSubagentIdRef.current = activeSubagentId;

  // Comment: tab switch (session or subagent) — always jump to bottom
  useLayoutEffect(() => {
    stickToBottomRef.current = true;
    scrollMessagesToBottom(true);
  }, [sessionId, activeSubagentId, scrollMessagesToBottom]);

  useEffect(() => {
    sessionStore.setSubagentTabs(subagentTabs);
  }, [subagentTabs]);

  const handleOpenSubagent = useCallback(
    (subagentId: string, title: string) => {
      const raw = String(subagentId || '').trim();
      if (!raw) return;
      // Comment: SubagentRunRow passes taskId; tab key is child ChatSession id
      const childId = raw.startsWith('sess-sub-') ? raw : `sess-sub-${raw}`;
      const taskId = raw.startsWith('sess-sub-') ? raw.slice('sess-sub-'.length) : raw;
      const tabTitle = String(title || '').trim() || 'Agent';
      ensureSubagentChildSession({
        childSessionId: childId,
        parentSessionId: sessionId,
        title: tabTitle,
        taskId
      });
      setSubagentTabs((prev) => {
        if (prev.some((t) => t.id === childId)) {
          return prev.map((t) =>
            t.id === childId
              ? { ...t, title: tabTitle, parentSessionId: sessionId, taskId }
              : t
          );
        }
        return [
          ...prev,
          { id: childId, title: tabTitle, parentSessionId: sessionId, taskId }
        ];
      });
      setActiveSubagentId(childId);
    },
    [sessionId]
  );

  const handleSelectSubagentTab = useCallback(
    (id: string) => {
      const tab = subagentTabs.find((t) => t.id === id);
      if (!tab) return;
      if (tab.parentSessionId !== sessionId) handleOpenSession(tab.parentSessionId);
      setActiveSubagentId(id);
      stickToBottomRef.current = true;
      scrollMessagesToBottom(true);
    },
    [subagentTabs, sessionId, handleOpenSession, scrollMessagesToBottom]
  );

  const handleCloseSubagentTab = useCallback((id: string) => {
    setSubagentTabs((prev) => prev.filter((t) => t.id !== id));
    setActiveSubagentId((cur) => (cur === id ? null : cur));
  }, []);

  const handleSelectSessionTab = useCallback(
    (id: string) => {
      setActiveSubagentId(null);
      handleOpenSession(id);
      // Comment: always focus composer on tab click (even when already active)
      setComposerFocusNonce((n) => n + 1);
      // Comment: same-tab click still pins scroll (sessionId may not change)
      stickToBottomRef.current = true;
      scrollMessagesToBottom(true);
    },
    [handleOpenSession, scrollMessagesToBottom]
  );

  // 부모 세션 삭제 시 subagent 탭 정리
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

  // Comment: SUB-010 — child ChatSession messages (same ConversationTurn path as main)
  const subagentDetailMessages = useMemo(() => {
    if (!activeSubagentTab) return null;
    return getSessionMessages(activeSubagentTab.id);
  }, [activeSubagentTab, getSessionMessages, messages, sessionList, subagentDetailTick]);

  /** Parent SubagentRunRow peeks child session for rolling status */
  const getSubagentRolling = useCallback(
    (subagentId: string) => {
      const raw = String(subagentId || '').trim();
      if (!raw) return undefined;
      const childId = raw.startsWith('sess-sub-') ? raw : `sess-sub-${raw}`;
      return rollingLineFromChildMessages(getSessionMessages(childId));
    },
    [getSessionMessages, subagentDetailTick]
  );

  // Comment: SUB-010 — wire child stream handlers once tabs + makeAssistantStream exist
  useEffect(() => {
    handleSubagentLifecycleRef.current = (stream) => {
      const taskId = String(stream.taskId || '').trim();
      const childId =
        String(stream.childSessionId || '').trim() ||
        (taskId ? `sess-sub-${taskId}` : '');
      if (!childId) return;
      const parentId =
        String(stream.parentSessionId || '').trim() || sessionIdRef.current;
      const title =
        String(stream.description || stream.prompt || '').trim() || 'Subagent';
      ensureSubagentChildSession({
        childSessionId: childId,
        parentSessionId: parentId,
        title,
        taskId: taskId || undefined,
        userPrompt: String(stream.prompt || title)
      });
      // Comment: new run identity — clear prior terminal fence for this child id
      const lifeType = String(stream.type || '');
      if (
        lifeType === 'subagent.created' ||
        lifeType === 'subagent.started'
      ) {
        childTerminalRef.current.delete(childId);
      }
      // Comment: SUB-010 — do not open a tab on spawn; only RunRow click adds one
      if (!childStreamSessionsRef.current.has(childId)) {
        childStreamSessionsRef.current.set(
          childId,
          sendFlow.makeAssistantStream(mode, undefined, childId)
        );
      }
      // Comment: parent RunRow peeks child for rolling — do NOT settle here.
      // Child terminal status (postChildStream status complete|error) is the
      // single settlement owner; lifecycle settle + status caused ghost turns.
      setSubagentDetailTick((n) => n + 1);
    };

    handleChildDeltaRef.current = (childId, delta) => {
      const isTerminalStatus =
        delta.status === 'complete' || delta.status === 'error';
      // Comment: SUB-010 — after authoritative settle, drop reopen/late non-terminal
      if (childTerminalRef.current.has(childId)) {
        if (!isTerminalStatus) return;
        // Duplicate terminal is idempotent no-op
        return;
      }
      // Comment: seed only if missing — never rewrite title to bare "Subagent"
      ensureSubagentChildSession({
        childSessionId: childId,
        parentSessionId: sessionIdRef.current,
        title: 'Subagent'
      });
      // Comment: late non-terminal before first settle may reopen a soft seal
      if (!isTerminalStatus) {
        ensureChildAssistantStreaming(childId, mode);
      }
      let h = childStreamSessionsRef.current.get(childId);
      if (!h) {
        h = sendFlow.makeAssistantStream(mode, undefined, childId);
        childStreamSessionsRef.current.set(childId, h);
      }
      // Comment: status-only deltas are settlement signals — skip onDelta paint
      if (!isTerminalStatus) {
        h.onDelta(scrubChildStreamDelta(delta));
      }
      // Comment: parent rolling + detail both re-read store
      setSubagentDetailTick((n) => n + 1);
      if (delta.status === 'complete') {
        childTerminalRef.current.add(childId);
        h.onComplete();
        childStreamSessionsRef.current.delete(childId);
        setSubagentDetailTick((n) => n + 1);
      } else if (delta.status === 'error') {
        childTerminalRef.current.add(childId);
        h.onError('Subagent error');
        childStreamSessionsRef.current.delete(childId);
        setSubagentDetailTick((n) => n + 1);
      }
    };
  }, [sendFlow, mode, sessionIdRef]);

  // ─── Context usage (푸터는 사용량만 — providerType/host-fallback 노출 금지) ──
  // ConfigManager 기본값이 'litellm'·modelContextSource='fallback'이라 예산 폴백 문구에
  // 넣으면 미연결 상태에서도 "litellm · host-fallback"처럼 보입니다.
  const contextBudget = provider.getContextBudget(mode);
  // Live estimate from transcript — uxState.contextTokens only updates on send.
  const estimatedTokens = useMemo(
    () => estimateMessagesTokens(messages),
    [messages]
  );
  const usedTokens = Math.max(uxState.contextTokens || 0, estimatedTokens);
  const contextUsagePercent =
    contextBudget > 0
      ? Math.min(100, Math.round((usedTokens / contextBudget) * 100))
      : 0;
  // 메인 라벨: 추정/측정 used. 빈 세션도 0%로 표시 (예산은 title).
  const contextUsageLabel = `Context: ${contextUsagePercent}% · ~${usedTokens.toLocaleString()} used`;
  const contextUsageTitle = `~${usedTokens.toLocaleString()} / ${contextBudget.toLocaleString()} tokens`;

  // ─── Host 메시지 처리 ─────────────────────────────────────────
  useChatHostBridge({
    sessionIdRef,
    setMode,
    setError,
    setInlineEditSeed,
    setComposerSeed,
    setComposerFocusNonce,
    handleNewChat,
    applyHostHydration,
    updateSessionMessages,
    panels,
    plan,
    debug,
    provider,
    fileEdits
  });

  // ─── Render ────────────────────────────────────────────────────
  const hasConversation = messages.length > 0;

  return (
    <div className="chat-container" data-ak-ui="v0.0.2">
      <div className="chat-shell">
        {/* 사이드 History rail */}
        <aside
          className={`chat-rail${panels.showHistory ? ' is-open' : ''}`}
          aria-hidden={!panels.showHistory}
          aria-label={panels.showHistory ? 'Chat history' : undefined}
        >
          {panels.showHistory ? (
            <HistoryPanel
              sessions={sessionList}
              currentId={sessionId}
              onSelect={handleOpenSession}
              onDelete={handleDeleteSession}
              onNew={handleNewChat}
              onClose={panels.handleCloseHistory}
            />
          ) : null}
        </aside>

        <div
          className={`chat-main${hasConversation ? ' chat-main--active' : ' chat-main--empty'}`}
        >
          {/* 탭 스트립 */}
      <ChatSessionTabs
        sessions={sessionList}
        currentId={sessionId}
        openTabIds={openTabIds}
        onSelect={handleSelectSessionTab}
        onCloseTab={handleCloseTab}
        onNew={handleNewChat}
            onHistory={panels.handleToggleHistory}
            onSettings={panels.handleToggleSettings}
            historyOpen={panels.showHistory}
        subagentTabs={subagentTabs}
        activeSubagentId={activeSubagentId}
        onSelectSubagent={handleSelectSubagentTab}
        onCloseSubagent={handleCloseSubagentTab}
      />

          {/* 중급 모델 UX 상태바 */}
      <UXForMediumPanel
        uxState={uxState}
        stuckEvent={stuckEvent}
        onAction={(action) => {
              if (action.toLowerCase().includes('stop')) setStuckEvent(null);
        }}
      />

          {/* Design Mode 패널 */}
          {panels.showDesignMode && (
            <DesignModePanel onClose={() => panels.setShowDesignMode(false)} />
      )}

          {/* 코드 Review 패널 */}
          {panels.showReview && (
        <div style={{ padding: 8, borderBottom: '1px solid var(--vscode-panel-border, #444)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>Code Review</strong>
                <button type="button" onClick={() => panels.setShowReview(false)}>Close</button>
          </div>
          <FindingList
                findings={panels.reviewFindings}
                onAccept={panels.handleAcceptFinding}
                onDismiss={(id) => panels.setReviewFindings((prev) => prev.filter((f) => f.id !== id))}
            onAcceptAll={() => {
                  panels.reviewFindings.forEach((f) => void panels.handleAcceptFinding(f.id));
            }}
          />
        </div>
      )}

          {/* Artifacts 갤러리 */}
          {panels.showArtifacts && (
        <ArtifactGallery
              artifacts={panels.artifacts}
              onClose={() => panels.setShowArtifacts(false)}
            />
          )}

          {/* 모드 크롬 (Plan/Debug/Reproduce/PlanReview) */}
          <ChatModeChrome
            mode={mode}
            planStage={plan.planStage}
            planController={plan.planController}
            planAdapter={plan.planAdapter}
            showPlanReview={plan.showPlanReview}
            showPlanExecutionBar={plan.showPlanExecutionBar}
            activeExecutionPlan={plan.activeExecutionPlan}
            tasksAwaitingVerification={plan.tasksAwaitingVerification}
            messages={messages}
            onOpenReview={plan.handleOpenReview}
            onDiscardPlan={plan.handleDiscardPlan}
            onPlanApprove={plan.handlePlanApprove}
            onPlanReject={plan.handlePlanReject}
            onPlanEdit={plan.handlePlanEdit}
            onOpenPlanInEditor={plan.handleOpenPlanInEditor}
            onPlanReviewClose={plan.handlePlanReviewClose}
            onVerifyTask={plan.handleVerifyTaskManually}
            cardStatusText={plan.cardStatusText}
            planCardTick={plan.planCardTick}
            debugController={debug.debugController}
            onSelectHypothesis={debug.handleSelectHypothesis}
            onConfirmFix={debug.handleConfirmFix}
            showReproduce={debug.showReproduce}
            reproduceHypothesisId={debug.reproduceHypothesisId}
            reproduceSteps={debug.reproduceSteps}
            onReproduced={debug.handleReproduced}
            onReproduceCancel={debug.handleReproduceCancel}
          />

          {/* Settings 오버레이 */}
          {panels.showSettings && (
        <div className="settings-overlay" role="dialog" aria-label="Settings">
          <SettingsPanel
                key={panels.settingsTab}
                initialTab={panels.settingsTab}
                onTabChange={(tab) => panels.rememberSettingsTab(tab as SettingsTabId)}
                onClose={panels.handleCloseSettings}
          />
        </div>
      )}

          {/* 오류 배너 */}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/*
            모든 모드 / 서브에이전트 공유: 하나의 메시지 리스트.
            서브 상세 = child messages + Back 헤더; composer는 footer에서 숨김.
      */}
      <div
        ref={messageListRef}
        className="message-list"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={onMessageListScroll}
        data-ak-view={activeSubagentTab ? 'subagent' : 'main'}
      >
        {activeSubagentTab ? (
          <div className="ak-subagent-detail__header">
            <button
              type="button"
              className="ak-subagent-detail__back"
              onClick={() => setActiveSubagentId(null)}
            >
              ← Back
            </button>
            <div className="ak-subagent-detail__titles">
              <div className="ak-subagent-detail__title">
                {activeSubagentTab.title}
              </div>
              <div className="ak-subagent-detail__status">
                {(() => {
                  const last =
                    subagentDetailMessages?.[
                      (subagentDetailMessages?.length || 0) - 1
                    ];
                  if (
                    last?.role === 'assistant' &&
                    last.status === 'streaming'
                  ) {
                    return 'Running…';
                  }
                  if (
                    (subagentDetailMessages || []).some((m) =>
                      (m.workItems || []).some((i) => i.status === 'error')
                    )
                  ) {
                    return 'Failed';
                  }
                  return (subagentDetailMessages || []).length > 0
                    ? 'Completed'
                    : 'Waiting…';
                })()}
              </div>
            </div>
          </div>
        ) : null}
        {(() => {
          const viewMessages = activeSubagentTab
            ? subagentDetailMessages || []
            : messages;
          if (activeSubagentTab && viewMessages.length === 0) {
            return (
              <p className="ak-subagent-detail__empty">
                Waiting for subagent…
              </p>
            );
          }
          const lastUserId = [...viewMessages]
            .reverse()
            .find((m) => m.role === 'user')?.id;
          const lastAssistantId = [...viewMessages]
            .reverse()
            .find((m) => m.role === 'assistant')?.id;
          const viewStreaming = activeSubagentTab
            ? viewMessages[viewMessages.length - 1]?.role === 'assistant' &&
              viewMessages[viewMessages.length - 1]?.status === 'streaming'
            : agentRunning;
          return viewMessages.map((item) => (
            <ConversationTurn
              key={item.id}
              message={item}
              isStreaming={
                viewStreaming &&
                viewMessages[viewMessages.length - 1]?.id === item.id
              }
              isAgentRunning={viewStreaming}
              isLastUser={item.role === 'user' && item.id === lastUserId}
              isLastAssistant={
                item.role === 'assistant' && item.id === lastAssistantId
              }
              // Comment: SUB-010 — child prompt read-only; no compose edit/copy
              userPromptMode={
                activeSubagentTab ? 'expand-only' : 'default'
              }
              isEditing={
                !activeSubagentTab &&
                item.role === 'user' &&
                item.id === editingUser?.id
              }
              editSeedNonce={
                !activeSubagentTab && item.id === editingUser?.id
                  ? editingUser.nonce
                  : 0
              }
              composerChrome={
                activeSubagentTab
                  ? undefined
                  : {
                      mode: modeAuto ? 'auto' : mode,
                      onModeChange: sendFlow.handleModeChange,
                      modeLabels: MODE_LABELS,
                      modeTooltips: MODE_TOOLTIPS,
                      modelLabel: provider.modelLabel,
                      modelId:
                        provider.modelCanonical || provider.providerModel,
                      modelOptions: provider.composerModelOptions,
                      onModelChange: provider.handleModelChange,
                      thinkingEffort: provider.thinkingEffort,
                      onThinkingEffortChange:
                        provider.composerThinkingOptions.length > 0
                          ? provider.handleThinkingEffortChange
                          : undefined,
                      thinkingOptions: provider.composerThinkingOptions,
                      onSlashCommand: sendFlow.runSlashCommand
                    }
              }
              onBeginEdit={
                activeSubagentTab
                  ? undefined
                  : (id) => setEditingUser({ id, nonce: Date.now() })
              }
              onCancelEdit={
                activeSubagentTab ? undefined : () => setEditingUser(null)
              }
              onEdit={
                activeSubagentTab
                  ? undefined
                  : (id, content, files) => {
                      setEditingUser(null);
                      sendFlow.handleEditMessage(id, content, files);
                    }
              }
              onFork={activeSubagentTab ? undefined : sendFlow.handleFork}
              onStopAndPrefill={
                activeSubagentTab
                  ? undefined
                  : sendFlow.handleStopAndPrefill
              }
              onCopy={
                activeSubagentTab
                  ? undefined
                  : (content) => navigator.clipboard.writeText(content)
              }
              onOpenSubagent={
                activeSubagentTab ? undefined : handleOpenSubagent
              }
              getSubagentRolling={
                activeSubagentTab ? undefined : getSubagentRolling
              }
              onOpenFile={fileEdits.handleOpenFile}
              onAcceptFile={fileEdits.handleAcceptFileEdit}
              onRejectFile={fileEdits.handleRejectFileEdit}
              onWorktreeReview={worktree.handleWorktreeReview}
              onWorktreeApply={worktree.handleWorktreeApply}
              onWorktreeReject={worktree.handleWorktreeReject}
              onContinueMission={
                activeSubagentTab
                  ? undefined
                  : () => {
                      void handleSendRef.current?.(
                        mode === 'plan'
                          ? 'Please continue. If research is done, ask only when a decision is needed; otherwise write the plan document and show a summary + TODOs. Do not loop questions and planning by yourself.'
                          : 'Continue. Do not stop — finish the task using the tool results above.',
                        []
                      );
                    }
              }
            />
          ));
        })()}
        {/* 최신 성장을 항상 scrollHeight에 포함하는 앵커 */}
        <div ref={messageEndRef} aria-hidden className="message-list-end" />
      </div>

          {/* footer — Queue + Clarifying + ChangedFilesBar + Composer */}
          <ChatComposerFooter
            msgQueue={msgQueue}
            queueTick={queueTick}
            onQueueApplyNow={sendFlow.handleQueueApplyNow}
            onQueueCancel={sendFlow.handleQueueCancel}
            showClarifying={plan.showClarifying}
            pendingQuestions={plan.pendingQuestions}
            mode={mode}
            activeSubagentTab={activeSubagentTab}
            onPlanAnswer={plan.handlePlanAnswer}
            onQuestionsComplete={plan.handleQuestionsComplete}
            onQuestionsCancel={plan.handleQuestionsCancel}
            sessionFileEdits={fileEdits.sessionFileEdits}
            onOpenFile={fileEdits.handleOpenFile}
            onUndoAll={fileEdits.handleUndoAllEdits}
            onReview={fileEdits.handleReviewEdits}
            isStreaming={composerBusy}
            onStop={sendFlow.handleStop}
            checkpoints={fileEdits.checkpoints}
            onListCheckpoints={fileEdits.handleListCheckpoints}
            onRestoreCheckpoint={fileEdits.handleRestoreCheckpoint}
            onAcceptFile={fileEdits.handleAcceptFileEdit}
            onRejectFile={fileEdits.handleRejectFileEdit}
            sessionId={sessionId}
            onSend={sendFlow.handleSend}
            disabled={composerBusy}
          seedText={composerSeed?.text ?? null}
          seedNonce={composerSeed?.nonce ?? 0}
          focusNonce={composerFocusNonce}
          inlineEdit={inlineEditSeed}
          onClearInlineEdit={() => setInlineEditSeed(null)}
            onSlashCommand={sendFlow.runSlashCommand}
            onRegenerate={sendFlow.handleRegenerate}
            onQueueMessage={sendFlow.handleQueueMessage}
            onResynthesize={sendFlow.handleResynthesize}
          isAwaitingUser={awaitingUser}
            isGeneratingPlan={plan.generatingPlan}
            modeValue={modeAuto ? 'auto' : mode}
            onModeChange={sendFlow.handleModeChange}
          modeLabels={MODE_LABELS}
          modeTooltips={MODE_TOOLTIPS}
            modelLabel={provider.modelLabel}
            modelId={provider.modelCanonical || provider.providerModel}
            modelOptions={provider.composerModelOptions}
            onModelChange={provider.handleModelChange}
            thinkingEffort={provider.thinkingEffort}
          onThinkingEffortChange={
              provider.composerThinkingOptions.length > 0
                ? provider.handleThinkingEffortChange
              : undefined
          }
            thinkingOptions={provider.composerThinkingOptions}
          contextUsagePercent={contextUsagePercent}
          contextUsageLabel={contextUsageLabel}
            contextUsageTitle={contextUsageTitle}
        />
        </div>
      </div>
    </div>
  );
}

// VS Code 커맨드 브리지 (webview 전용)
const vscode = {
  commands: {
    executeCommand: (cmd: string, ...args: any[]) => {
      window.parent.postMessage({ type: 'vscode.command', command: cmd, args }, '*');
    }
  }
};
(window as any).vscode = vscode;
