/**
 * ChatApp — 메인 채팅 애플리케이션 orchestrator (C5-C7 UI 통합)
 *
 * mode=plan  → PlanModeHeader + ClarifyingQuestions/PlanReview
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
import {
  SubagentDetailView,
  collectSubagentTimeline,
  type SubagentDetailTab
} from './components/SubagentDetailView';
import { useChatStream } from './hooks/useChatStream';
import { useChatSessions, sessionStore } from './hooks/useChatSessions';
import { SendEpochMap } from './sendEpoch';
import { getVsCodeApi } from './host/vscodeApi';
import type { InlineEditContext } from './inlineEdit';
import {
  MODE_LABELS,
  MODE_TOOLTIPS,
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
  const turnNumberRef = useRef(0);
  const loopSessionIdRef = useRef<string | null>(null);
  const parkedAwaitingRef = useRef<{ sessionId: string; questions: any[] } | null>(null);
  const stopHandlerRef = useRef<StopHandler | null>(null);
  const stepStartRef = useRef<Record<string, number>>({});
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
    regenerate,
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
    onWorktreeResult: (payload) => handleWorktreeResultRef.current(payload)
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
    regenerate,
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
        return [...prev, { id, title: tabTitle, parentSessionId: sessionId }];
      });
      setActiveSubagentId(id);
    },
    [sessionId]
  );

  const handleSelectSubagentTab = useCallback(
    (id: string) => {
      const tab = subagentTabs.find((t) => t.id === id);
      if (!tab) return;
      if (tab.parentSessionId !== sessionId) handleOpenSession(tab.parentSessionId);
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
      setActiveSubagentId(null);
      handleOpenSession(id);
    },
    [handleOpenSession]
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

  const subagentParentMessages = useMemo(() => {
    if (!activeSubagentTab) return messages;
    if (activeSubagentTab.parentSessionId === sessionId) return messages;
    return getSessionMessages(activeSubagentTab.parentSessionId);
  }, [activeSubagentTab, sessionId, messages, getSessionMessages]);

  const subagentDetailData = useMemo(() => {
    if (!activeSubagentTab) return null;
    return collectSubagentTimeline(subagentParentMessages, activeSubagentTab.id);
  }, [activeSubagentTab, subagentParentMessages]);

  // ─── Context usage (푸터는 사용량만 — providerType/host-fallback 노출 금지) ──
  // ConfigManager 기본값이 'litellm'·modelContextSource='fallback'이라 예산 폴백 문구에
  // 넣으면 미연결 상태에서도 "litellm · host-fallback"처럼 보입니다.
  const contextBudget = provider.getContextBudget(mode);
  const usedTokens = uxState.contextTokens || 0;
  const contextUsagePercent = Math.min(
    100,
    Math.round((usedTokens / contextBudget) * 100)
  );
  // 메인 라벨: 알려진 사용량만 (퍼센트 + used). 미측정 시 최소 표기.
  const contextUsageLabel =
    usedTokens > 0
      ? `Context: ${contextUsagePercent}% · ~${usedTokens.toLocaleString()} used`
      : 'Context: —';
  // title 툴팁에만 예산 힌트 (디버그용 provider/source는 넣지 않음)
  const contextUsageTitle =
    usedTokens > 0
      ? `~${usedTokens.toLocaleString()} / ${contextBudget.toLocaleString()} tokens`
      : `Budget: ${contextBudget.toLocaleString()} tokens`;

  // ─── Host 메시지 처리 ─────────────────────────────────────────
  useChatHostBridge({
    sessionIdRef,
    setMode,
    setError,
    setInlineEditSeed,
    setComposerSeed,
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
            onOpenPlanInEditor={
              plan.planAdapter.session.getPlan() ? undefined : plan.handleOpenPlanInEditor
            }
            onPlanReviewClose={plan.handlePlanReviewClose}
            onVerifyTask={plan.handleVerifyTaskManually}
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
            모든 모드 공유: 하나의 메시지 리스트 + 하나의 Composer.
            모드는 tools/prompts만 바꿈 — 별도 채팅 창 없음.
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
                onOpenFile={fileEdits.handleOpenFile}
                onAcceptFile={fileEdits.handleAcceptFileEdit}
                onRejectFile={fileEdits.handleRejectFileEdit}
                onWorktreeReview={worktree.handleWorktreeReview}
                onWorktreeApply={worktree.handleWorktreeApply}
                onWorktreeReject={worktree.handleWorktreeReject}
              />
            ) : (
              (() => {
                const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id;
                const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
                return messages.map((item) => (
                  <ConversationTurn
                    key={item.id}
                    message={item}
                    isStreaming={
                      (streaming || plan.generatingPlan || plan.showPlanExecutionBar) &&
                      messages[messages.length - 1]?.id === item.id
                    }
                    isAgentRunning={streaming || plan.generatingPlan || plan.showPlanExecutionBar}
                    isLastUser={item.role === 'user' && item.id === lastUserId}
                    isLastAssistant={item.role === 'assistant' && item.id === lastAssistantId}
                    onEdit={sendFlow.handleEditMessage}
                    onFork={sendFlow.handleFork}
                    onStopAndPrefill={sendFlow.handleStopAndPrefill}
                    onCopy={(content) => navigator.clipboard.writeText(content)}
                    onOpenSubagent={handleOpenSubagent}
                    onOpenFile={fileEdits.handleOpenFile}
                    onAcceptFile={fileEdits.handleAcceptFileEdit}
                    onRejectFile={fileEdits.handleRejectFileEdit}
                    onWorktreeReview={worktree.handleWorktreeReview}
                    onWorktreeApply={worktree.handleWorktreeApply}
                    onWorktreeReject={worktree.handleWorktreeReject}
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
            isStreaming={streaming || plan.generatingPlan}
            onStop={sendFlow.handleStop}
            checkpoints={fileEdits.checkpoints}
            onListCheckpoints={fileEdits.handleListCheckpoints}
            onRestoreCheckpoint={fileEdits.handleRestoreCheckpoint}
            onAcceptFile={fileEdits.handleAcceptFileEdit}
            onRejectFile={fileEdits.handleRejectFileEdit}
            sessionId={sessionId}
            onSend={sendFlow.handleSend}
            disabled={streaming || plan.generatingPlan}
            seedText={composerSeed?.text ?? null}
            seedNonce={composerSeed?.nonce ?? 0}
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
