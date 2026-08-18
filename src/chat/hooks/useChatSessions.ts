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
import {
  finalizeStreamingMessages,
  sanitizeLoadedMessages
} from '../chatAppHelpers';
import {
  hydrateActiveVariants,
  setActiveVariantChangeHandler
} from '../conversation/conversationVariants';
import { getVsCodeApi } from '../host/vscodeApi';
import type { ChatMessage, Mode } from '../types';
import type { PendingQuestion } from '../../tools/session/AskQuestionTool';

export const sessionStore = new ChatSessionStore();

export interface ChatSessionLifecycle {
  parkPlanForSession: (id: string) => void;
  restorePlanForSession: (id: string) => void;
  resetPlanChrome: () => void;
  hasPlanSnap: (id: string) => boolean;
  onDeletePlanSnap: (id: string) => void;
}

export interface UseChatSessionsParams {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  setModeAuto: Dispatch<SetStateAction<boolean>>;
  streaming: boolean;
  awaitingUser: boolean;
  pendingQuestions: PendingQuestion[];
  sendEpochRef: MutableRefObject<number>;
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
}

export function useChatSessions(params: UseChatSessionsParams) {
  const {
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
    lifecycle
  } = params;
  const {
    parkPlanForSession,
    restorePlanForSession,
    resetPlanChrome,
    hasPlanSnap,
    onDeletePlanSnap
  } = lifecycle;

  const [sessionId, setSessionId] = useState(() => sessionStore.loadActive().id);
  const sessionIdRef = useRef(sessionId);
  const [sessionList, setSessionList] = useState<ChatSessionMeta[]>(() =>
    sessionStore.list()
  );
  const [openTabIds, setOpenTabIds] = useState<string[]>(() =>
    sessionStore.getOpenTabIds()
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const active = sessionStore.loadActive();
    return sanitizeLoadedMessages(active.messages || []);
  });
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Keep an always-current ref for persistence callbacks.
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

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
    const t = window.setTimeout(() => {
      sessionStore.saveMessages(sessionId, messages, mode);
      setSessionList(sessionStore.list());
      try {
        getVsCodeApi()?.postMessage({
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
      if (id === sessionIdRef.current) {
        setMessages((prev) => {
          const next = updater(prev);
          messagesRef.current = next;
          return next;
        });
        return;
      }
      const loaded = sessionStore.get(id);
      if (!loaded) return;
      const base = sanitizeLoadedMessages(loaded.messages || []);
      const next = updater(base);
      sessionStore.saveMessages(id, next, loaded.mode, { setCurrent: false });
      setSessionList(sessionStore.list());
    },
    []
  );

  const handleNewChat = useCallback(() => {
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
    resetPlanChrome,
    parkedAwaitingRef,
    messagesRef,
    stopHandlerRef,
    sendEpochRef,
    loopSessionIdRef,
    stepStartRef,
    setShowClarifying,
    setAwaitingUser,
    setPendingQuestions,
    setShowHistory,
    setError,
    setModeAuto
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
      parkPlanForSession,
      restorePlanForSession,
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
      setMode,
      setModeAuto,
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
      setMode,
      setModeAuto,
      setError,
      setShowHistory
    ]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      if (streaming && id === sessionId) {
        stopHandlerRef.current?.stop('user_stop');
        sendEpochRef.current += 1;
      }
      onDeletePlanSnap(id);
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
    [
      streaming,
      sessionId,
      restorePlanForSession,
      onDeletePlanSnap,
      stopHandlerRef,
      sendEpochRef,
      stepStartRef,
      setMode,
      setModeAuto,
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
