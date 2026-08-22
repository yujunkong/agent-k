/**
 * Chat session tabs + local persist. Plan chrome stays in ChatApp via callbacks.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react';
import { ChatSessionStore } from '../ChatSessionStore';
import type { ChatSessionMeta } from '../ChatSessionStore';
import { sanitizeLoadedMessages, finalizeStreamingMessages } from '../chatAppHelpers';
import {
  hydrateActiveVariants,
  setActiveVariantChangeHandler
} from '../conversation/conversationVariants';
import { getVsCodeApi } from '../host/vscodeApi';
import { debugWarn } from '../debugLog';
import type { ChatMessage, Mode } from '../types';
import type { PendingQuestion } from '../../tools/session/AskQuestionTool';
import type { SendEpochMap } from '../sendEpoch';

export const sessionStore = new ChatSessionStore();

export interface ChatSessionLifecycle {
  parkPlanForSession: (id: string) => void;
  restorePlanForSession: (id: string) => void;
  /** Persist leaving-tab provider into session store (tab-scoped runtime). */
  parkProviderForSession?: (id: string) => void;
  /** Restore provider React state from session (fallback to config defaults). */
  restoreProviderForSession?: (id: string) => void;
  resetPlanChrome: () => void;
  hasPlanSnap: (id: string) => boolean;
  onDeletePlanSnap: (id: string) => void;
}

export interface UseChatSessionsParams {
  mode: Mode;
  modeAuto: boolean;
  setMode: Dispatch<SetStateAction<Mode>>;
  setModeAuto: Dispatch<SetStateAction<boolean>>;
  streaming: boolean;
  awaitingUser: boolean;
  pendingQuestions: PendingQuestion[];
  sendEpochRef: MutableRefObject<SendEpochMap>;
  loopSessionIdRef: MutableRefObject<string | null>;
  stopHandlerRef: { readonly current: { stop: (reason: 'user_stop') => unknown } | null };
  stepStartRef: MutableRefObject<Record<string, number>>;
  parkedAwaitingRef: MutableRefObject<{
    sessionId: string;
    questions: PendingQuestion[];
  } | null>;
  setError: Dispatch<SetStateAction<string | null>>;
  setShowHistory: Dispatch<SetStateAction<boolean>>;
  setShowClarifying: Dispatch<SetStateAction<boolean>>;
  setAwaitingUser: Dispatch<SetStateAction<boolean>>;
  setPendingQuestions: Dispatch<SetStateAction<PendingQuestion[]>>;
  lifecycle: ChatSessionLifecycle;
  /**
   * CHAT-007 — single shared ref from ChatApp. Updated synchronously in tab
   * switch handlers *before* switchTo, so stream deltas never race a stale id.
   */
  sessionIdRef: MutableRefObject<string>;
  /** Park/restore Alt+Enter queue per tab. */
  parkQueueForSession?: (id: string) => void;
  restoreQueueForSession?: (id: string) => void;
  /** Park/restore inline-edit chip per tab. */
  parkInlineEditForSession?: (id: string) => void;
  restoreInlineEditForSession?: (id: string) => void;
}

export function useChatSessions(params: UseChatSessionsParams) {
  const {
    mode,
    modeAuto,
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
    lifecycle,
    sessionIdRef,
    parkQueueForSession,
    restoreQueueForSession,
    parkInlineEditForSession,
    restoreInlineEditForSession
  } = params;
  const {
    parkPlanForSession,
    restorePlanForSession,
    parkProviderForSession,
    restoreProviderForSession,
    resetPlanChrome,
    hasPlanSnap,
    onDeletePlanSnap
  } = lifecycle;

  const [sessionId, setSessionId] = useState(() => sessionStore.loadActive().id);
  const [sessionList, setSessionList] = useState<ChatSessionMeta[]>(() =>
    sessionStore.list()
  );
  const [openTabIds, setOpenTabIds] = useState<string[]>(() =>
    sessionStore.getOpenTabIds()
  );
  const [messages, setMessagesState] = useState<ChatMessage[]>(() => {
    const active = sessionStore.loadActive();
    // Cold load only: settle orphan streaming left from a previous crash/reload.
    return finalizeStreamingMessages(
      sanitizeLoadedMessages(active.messages || [])
    );
  });
  const messagesRef = useRef(messages);
  // Do NOT assign messagesRef.current = messages on every render: stream deltas
  // update the ref synchronously before React commits, and a render mid-flight
  // would wipe those tokens → "no response" on the active tab.
  const setMessages = useCallback<Dispatch<SetStateAction<ChatMessage[]>>>(
    (action) => {
      // Sync ref immediately for non-function updates so early onError (same
      // tick as handleSend paint) can find the streaming assistant bubble.
      if (typeof action !== 'function') {
        messagesRef.current = action;
      }
      setMessagesState((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        messagesRef.current = next;
        return next;
      });
    },
    []
  );

  // CHAT-007: sync during render (not useEffect). Stream deltas for a previous
  // tab can arrive before paint effects run; a stale ref would apply them to the
  // newly active React messages and then persist → duplicate titles / shared transcript.
  sessionIdRef.current = sessionId;

  // Hydrate active variant selection whenever we switch sessions/tabs.
  useEffect(() => {
    const loaded = sessionStore.get(sessionId);
    hydrateActiveVariants(loaded?.activeVariants ?? {});
  }, [sessionId]);

  // Persist active variant selection back into the current session.
  useEffect(() => {
    setActiveVariantChangeHandler((groupId, index) => {
      const id = sessionIdRef.current;
      const loaded = sessionStore.get(id);
      const prev = loaded?.activeVariants ?? {};
      sessionStore.setActiveVariants(id, {
        ...prev,
        [groupId]: index
      });
    });
    return () => setActiveVariantChangeHandler(null);
  }, []);

  useEffect(() => {
    sessionStore.setOpenTabIds(openTabIds);
  }, [openTabIds]);

  useEffect(() => {
    try {
      getVsCodeApi()?.postMessage({ type: 'host.sessions.ready' });
    } catch {
      /* no host bridge (browser preview) */
    }
  }, []);

  useEffect(() => {
    const delay = streaming ? 400 : 0;
    const ownerId = sessionId;
    const ownerMode = mode;
    const t = window.setTimeout(() => {
      // If the user already switched tabs, skip — leave handler already snapshotted.
      if (ownerId !== sessionIdRef.current) return;
      // Never steal currentId — tab switch already called switchTo.
      sessionStore.saveMessages(ownerId, messagesRef.current, ownerMode, {
        setCurrent: false
      });
      setSessionList(sessionStore.list());
      try {
        const sessions = sessionStore.exportMetasForHost();
        const currentId = sessionStore.getCurrentId();
        getVsCodeApi()?.postMessage({
          type: 'host.sessions.persist',
          // SHARED-001 — nested payload (host used to crash on flat msg.payload === undefined)
          payload: {
            sessions,
            currentId
          }
        });
      } catch (err) {
        debugWarn('sessions.persist crash guard', 'post failed', err);
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [messages, sessionId, mode, streaming, sessionIdRef]);

  const applyHostHydration = useCallback((metas: ChatSessionMeta[]) => {
    sessionStore.applyHostHydration(metas);
    setSessionList(sessionStore.list());
  }, []);

  const getSessionMessages = useCallback((id: string): ChatMessage[] => {
    if (id === sessionIdRef.current) return messagesRef.current;
    const loaded = sessionStore.get(id);
    return sanitizeLoadedMessages(loaded?.messages || []);
  }, []);

  const updateSessionMessages = useCallback(
    (id: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      if (!id) return;
      // Capture target at schedule time — React may flush after a tab switch.
      const targetId = id;
      if (targetId === sessionIdRef.current) {
        // Apply updater against the live ref synchronously so early onError /
        // same-tick stream events never miss the streaming assistant.
        const next = updater(messagesRef.current);
        messagesRef.current = next;
        setMessagesState(next);
        return;
      }
      const loaded = sessionStore.get(targetId);
      if (!loaded) return;
      const base = sanitizeLoadedMessages(loaded.messages || []);
      const next = updater(base);
      sessionStore.saveMessages(targetId, next, loaded.mode, { setCurrent: false });
      setSessionList(sessionStore.list());
    },
    [sessionIdRef]
  );

  /** Park Composer chrome (mode/auto/queue/inline) for the leaving tab. */
  const parkLeavingComposer = useCallback(
    (leavingId: string) => {
      if (!leavingId) return;
      sessionStore.setMode(leavingId, mode, { modeAuto });
      parkQueueForSession?.(leavingId);
      parkInlineEditForSession?.(leavingId);
    },
    [mode, modeAuto, parkQueueForSession, parkInlineEditForSession]
  );

  /** Restore Composer chrome for the tab being opened. */
  const restoreComposerChrome = useCallback(
    (loaded: { id: string; mode?: Mode; modeAuto?: boolean; messages?: ChatMessage[] }) => {
      setMode(loaded.mode || 'agent');
      setModeAuto(
        loaded.modeAuto !== undefined
          ? Boolean(loaded.modeAuto)
          : (loaded.messages?.length ?? 0) === 0
      );
      restoreQueueForSession?.(loaded.id);
      restoreInlineEditForSession?.(loaded.id);
    },
    [setMode, setModeAuto, restoreQueueForSession, restoreInlineEditForSession]
  );

  const handleNewChat = useCallback(() => {
    // Keep the leaving tab's host loop alive. A global Stop + epoch bump
    // froze the previous (sometimes both) tabs when starting a second task.
    if (streaming && awaitingUser) {
      parkedAwaitingRef.current = { sessionId, questions: pendingQuestions };
      setShowClarifying(false);
      setAwaitingUser(false);
    } else if (streaming) {
      const snap = messagesRef.current.length ? messagesRef.current : messages;
      sessionStore.saveMessages(sessionId, snap, mode, { setCurrent: false });
    }
    const snap = messagesRef.current.length ? messagesRef.current : messages;
    // CHAT-007 / CHAT-009: always open a new tab — even from an empty "New chat"
    // (previous early-return made + feel broken on empty sessions).
    parkLeavingComposer(sessionId);
    parkPlanForSession(sessionId);
    parkProviderForSession?.(sessionId);
    if (snap.length > 0) {
      sessionStore.saveMessages(sessionId, snap, mode, { setCurrent: false });
    } else {
      // Persist empty leaving tab so it stays a real session in the strip.
      sessionStore.saveMessages(sessionId, [], mode, { setCurrent: false });
    }
    const next = sessionStore.createEmpty(mode);
    // Seed active transcript + id before paint so stream/plan never race the old tab.
    messagesRef.current = [];
    sessionIdRef.current = next.id;
    setSessionId(next.id);
    setMessages([]);
    setSessionList(sessionStore.list());
    setOpenTabIds((prev) => {
      const withLeaving = prev.includes(sessionId) ? prev : [sessionId, ...prev];
      return [next.id, ...withLeaving.filter((id) => id !== next.id)];
    });
    resetPlanChrome();
    restoreProviderForSession?.(next.id);
    restoreComposerChrome(next);
    setError(null);
    setShowHistory(false);
  }, [
    streaming,
    awaitingUser,
    pendingQuestions,
    messages,
    sessionId,
    mode,
    sessionIdRef,
    parkLeavingComposer,
    parkPlanForSession,
    parkProviderForSession,
    restoreProviderForSession,
    restoreComposerChrome,
    resetPlanChrome,
    parkedAwaitingRef,
    messagesRef,
    setShowClarifying,
    setAwaitingUser,
    setShowHistory,
    setError
  ]);

  const handleOpenSession = useCallback(
    (id: string) => {
      if (id === sessionId) {
        setShowHistory(false);
        return;
      }
      if (streaming && awaitingUser) {
        parkedAwaitingRef.current = { sessionId, questions: pendingQuestions };
        setShowClarifying(false);
        setAwaitingUser(false);
      } else if (streaming) {
        // Keep runtime alive across tab switch.
        // Only persist a snapshot; stream deltas continue in owner session.
        const snap = messagesRef.current.length ? messagesRef.current : messages;
        sessionStore.saveMessages(sessionId, snap, mode, { setCurrent: false });
      } else if (messages.length > 0) {
        sessionStore.saveMessages(sessionId, messages, mode, { setCurrent: false });
      }
      parkLeavingComposer(sessionId);
      parkPlanForSession(sessionId);
      parkProviderForSession?.(sessionId);
      const loaded = sessionStore.switchTo(id);
      if (!loaded) return;
      // Re-read after switchTo so any store-only deltas during park are included.
      const fresh = sessionStore.get(id) || loaded;
      const nextMessages = sanitizeLoadedMessages(fresh.messages || []);
      // Seed ref + messagesRef *before* setState so concurrent updaters chain correctly.
      messagesRef.current = nextMessages;
      sessionIdRef.current = loaded.id;
      setSessionId(loaded.id);
      setMessages(nextMessages);
      restoreComposerChrome(fresh);
      stepStartRef.current = {};
      setSessionList(sessionStore.list());
      setOpenTabIds((prev) =>
        prev.includes(id) ? prev : [id, ...prev.filter((x) => x !== id)]
      );
      setError(null);
      setShowHistory(false);
      restorePlanForSession(id);
      restoreProviderForSession?.(id);
      const parked = parkedAwaitingRef.current;
      if (parked && parked.sessionId === id) {
        setPendingQuestions(parked.questions);
        setShowClarifying(true);
        setAwaitingUser(true);
        parkedAwaitingRef.current = null;
      } else if (!hasPlanSnap(id)) {
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
      sessionIdRef,
      parkLeavingComposer,
      parkPlanForSession,
      parkProviderForSession,
      restorePlanForSession,
      restoreProviderForSession,
      restoreComposerChrome,
      hasPlanSnap,
      parkedAwaitingRef,
      messagesRef,
      stopHandlerRef,
      sendEpochRef,
      loopSessionIdRef,
      stepStartRef,
      setShowHistory,
      setShowClarifying,
      setAwaitingUser,
      setPendingQuestions,
      setError
    ]
  );

  const handleCloseTab = useCallback(
    (id: string) => {
      const remaining = openTabIds.filter((x) => x !== id);

      if (id !== sessionId) {
        setOpenTabIds(remaining);
        return;
      }

      if (streaming && awaitingUser) {
        parkedAwaitingRef.current = { sessionId, questions: pendingQuestions };
        setShowClarifying(false);
        setAwaitingUser(false);
      } else if (streaming) {
        // Closing the active tab must not kill the runtime.
        // Session stays in history and continues receiving deltas.
        const snap = messagesRef.current.length ? messagesRef.current : messages;
        sessionStore.saveMessages(sessionId, snap, mode, { setCurrent: false });
      }

      const snap = messagesRef.current.length ? messagesRef.current : messages;
      if (snap.length > 0) {
        sessionStore.saveMessages(sessionId, snap, mode, { setCurrent: false });
      }
      parkLeavingComposer(sessionId);
      parkPlanForSession(sessionId);
      parkProviderForSession?.(sessionId);

      const idx = openTabIds.indexOf(id);
      const neighborId =
        (idx >= 0 && openTabIds[idx + 1]) ||
        (idx > 0 && openTabIds[idx - 1]) ||
        remaining[0] ||
        undefined;

      if (neighborId && neighborId !== id) {
        const loaded = sessionStore.switchTo(neighborId);
        if (loaded) {
          const fresh = sessionStore.get(neighborId) || loaded;
          const nextMessages = sanitizeLoadedMessages(fresh.messages || []);
          messagesRef.current = nextMessages;
          sessionIdRef.current = loaded.id;
          setSessionId(loaded.id);
          setMessages(nextMessages);
          restoreComposerChrome(fresh);
          stepStartRef.current = {};
          setSessionList(sessionStore.list());
          setOpenTabIds(
            remaining.includes(neighborId) ? remaining : [neighborId, ...remaining]
          );
          restorePlanForSession(neighborId);
          restoreProviderForSession?.(neighborId);
          const parked = parkedAwaitingRef.current;
          if (parked && parked.sessionId === neighborId) {
            setPendingQuestions(parked.questions);
            setShowClarifying(true);
            setAwaitingUser(true);
            parkedAwaitingRef.current = null;
          } else if (!hasPlanSnap(neighborId)) {
            setPendingQuestions([]);
            setShowClarifying(false);
          }
          setError(null);
          setShowHistory(false);
          return;
        }
      }

      const fresh = sessionStore.createEmpty(mode);
      messagesRef.current = [];
      sessionIdRef.current = fresh.id;
      setSessionId(fresh.id);
      setMessages([]);
      stepStartRef.current = {};
      setSessionList(sessionStore.list());
      setOpenTabIds([fresh.id]);
      resetPlanChrome();
      restoreProviderForSession?.(fresh.id);
      restoreComposerChrome(fresh);
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
      sessionIdRef,
      parkLeavingComposer,
      parkPlanForSession,
      parkProviderForSession,
      restorePlanForSession,
      restoreProviderForSession,
      restoreComposerChrome,
      resetPlanChrome,
      hasPlanSnap,
      parkedAwaitingRef,
      messagesRef,
      stopHandlerRef,
      sendEpochRef,
      loopSessionIdRef,
      stepStartRef,
      setShowClarifying,
      setAwaitingUser,
      setPendingQuestions,
      setError,
      setShowHistory
    ]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      if (streaming && id === sessionId) {
        stopHandlerRef.current?.stop('user_stop');
        sendEpochRef.current.bump(id);
      }
      sendEpochRef.current.clear(id);
      onDeletePlanSnap(id);
      const next = sessionStore.delete(id);
      setSessionList(sessionStore.list());
      setOpenTabIds((prev) => prev.filter((x) => x !== id));
      if (!next) return;
      if (id === sessionId) {
        const nextMessages = sanitizeLoadedMessages(next.messages || []);
        messagesRef.current = nextMessages;
        sessionIdRef.current = next.id;
        setSessionId(next.id);
        setMessages(nextMessages);
        restoreComposerChrome(next);
        stepStartRef.current = {};
        setOpenTabIds((prev) =>
          prev.includes(next.id) ? prev : [next.id, ...prev]
        );
        restorePlanForSession(next.id);
        restoreProviderForSession?.(next.id);
        setError(null);
      }
    },
    [
      streaming,
      sessionId,
      sessionIdRef,
      restorePlanForSession,
      restoreProviderForSession,
      restoreComposerChrome,
      onDeletePlanSnap,
      stopHandlerRef,
      sendEpochRef,
      stepStartRef,
      setError
    ]
  );

  return {
    sessionId,
    setSessionId,
    sessionList,
    setSessionList,
    openTabIds,
    setOpenTabIds,
    messages,
    setMessages,
    messagesRef,
    handleNewChat,
    handleOpenSession,
    handleCloseTab,
    handleDeleteSession,
    applyHostHydration,
    updateSessionMessages,
    getSessionMessages
  };
}
