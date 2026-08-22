/**
 * useChatSendFlow — 메시지 전송·중단·큐·재합성·재생성·편집·포크 + Mode/Slash 핸들러
 *
 * 담당:
 *   - handleSend (주 전송 흐름 — HARNESS prefetch + API 메시지 구성 + stream 시작)
 *   - handleRegenerate / handleStop / handleStopAndPrefill
 *   - handleResynthesize / handleQueueMessage + 큐 flush effect
 *   - handleQueueApplyNow / handleQueueCancel
 *   - handleEditMessage / handleFork
 *   - handleModeChange / pushSystemNotice / runSlashCommand
 *   - makeAssistantStream (send-owned factory)
 *   - planController.onBuildReady 이펙트 (Approve→Agent 핸드오프)
 *   - stopHandlerRef 업데이트 이펙트
 */
import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type Dispatch,
  type SetStateAction
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { selectActiveConversationMessages } from '../conversation/conversationVariants';
import { formatAttachmentsForPayload } from '../attachmentFormat';
import { formatInlineEditForPayload, toInlineEditAgentRequest, type InlineEditContext } from '../inlineEdit';
import { buildResynthesizeMessages } from '../../loop/synthesizeInstructions';
import type { AgentMessage } from '../../loop/AgentLoopController';
import { MessageQueue } from '../../loop/MessageQueue';
import { StopHandler } from '../../loop/StopHandler';
import { createAssistantStreamSession } from '../assistantStreamSession';
import { lastUserIndex, moveUserTurnToEnd } from '../regenerateTurn';
import { sanitizeLoadedMessages, finalizeStreamingMessages, shortModelName } from '../chatAppHelpers';
import { lastConversationTurn, resolveSendMode } from '../../mode';
import { PLAN_STICKY_PHASES } from '../chatAppHelpers';
import { designModeContext } from '../../browser/DesignModePanel';
import { buildHarnessTurnContext, prependHarnessToUserPayload } from '../harnessBridge';
import { resolveSlashCommand, SLASH_COMMANDS, type SlashCommand } from '../composerPalette';
import { getVsCodeApi } from '../host/vscodeApi';
import { configManager } from '../../core/ConfigManager';
import { sessionStore } from '../hooks/useChatSessions';
import { resolveSendCredentials } from '../resolveSendCredentials';
import { debugLog, debugWarn } from '../debugLog';
import {
  startPlanExecution
} from '../../plan/execution/planExecutionPersistence';
import type { ChatMessage, Mode, Attachment, ModePicker } from '../types';
import type { SendEpochMap } from '../sendEpoch';
import type { PlanModeController } from '../../plan/PlanModeController';
import type { PlanModeControllerAdapter } from '../../plan/session';
import type { HarnessUXState, UXEventType } from '../../harness/UXForMedium';

// useChatStream 에서 가져오는 함수들
type SendMessageFn = (
  text: string,
  files: Attachment[],
  messages: ChatMessage[],
  mode: Mode,
  onDelta: (...args: any[]) => void,
  onComplete: () => void,
  onError: (err: string) => void,
  opts?: {
    planStageOverride?: string;
    runtimeKey?: string;
    inlineEdit?: any;
    /** Tab-scoped credentials resolved at send time */
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }
) => Promise<void>;

export interface UseChatSendFlowParams {
  mode: Mode;
  modeAuto: boolean;
  setMode: Dispatch<SetStateAction<Mode>>;
  setModeAuto: Dispatch<SetStateAction<boolean>>;
  messages: ChatMessage[];
  messagesRef: MutableRefObject<ChatMessage[]>;
  sessionId: string;
  sessionIdRef: MutableRefObject<string>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessionId: Dispatch<SetStateAction<string>>;
  setSessionList: Dispatch<SetStateAction<any[]>>;
  setOpenTabIds: Dispatch<SetStateAction<string[]>>;
  sendMessage: SendMessageFn;
  stop: () => void;
  planStage: string;
  planController: PlanModeController;
  planAdapter: PlanModeControllerAdapter;
  planGenerateActiveRequestRef: MutableRefObject<string | null>;
  generatingPlan: boolean;
  endPlanGenerationUi: (ok: boolean, ownerSessionId?: string) => void;
  msgQueue: MessageQueue;
  queueTick: number;
  setQueueTick: Dispatch<SetStateAction<number>>;
  stopHandlerRef: MutableRefObject<StopHandler | null>;
  sendEpochRef: MutableRefObject<SendEpochMap>;
  turnNumberRef: MutableRefObject<number>;
  loopSessionIdRef: MutableRefObject<string | null>;
  stepStartRef: MutableRefObject<Record<string, number>>;
  parkedAwaitingRef: MutableRefObject<{ sessionId: string; questions: any[] } | null>;
  streaming: boolean;
  uxState: HarnessUXState;
  setUxState: Dispatch<SetStateAction<HarnessUXState>>;
  setStuckEvent: Dispatch<SetStateAction<UXEventType | null>>;
  inlineEditSeed: InlineEditContext | null;
  setInlineEditSeed: Dispatch<SetStateAction<InlineEditContext | null>>;
  composerSeed: { text: string; nonce: number } | null;
  setComposerSeed: Dispatch<SetStateAction<{ text: string; nonce: number } | null>>;
  setAwaitingUser: Dispatch<SetStateAction<boolean>>;
  setShowClarifying: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  setSettingsTab: (tab: string) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  /** 스크롤 유틸 */
  scrollMessagesToBottom: (force?: boolean) => void;
  stickToBottomRef: MutableRefObject<boolean>;
  /** Plan 관련 lifecycle */
  resetPlanChrome: () => void;
  parkPlanForSession: (id: string) => void;
  parkProviderForSession: (id: string) => void;
  persistProviderToSession: (id: string, patch?: any) => void;
  restoreProviderForSession: (id: string) => void;
  /** Plan FSM build-ready 핸들러에서 필요한 provider refs */
  providerModelRef: MutableRefObject<string>;
  providerBaseUrlRef: MutableRefObject<string>;
  providerApiKeyRef: MutableRefObject<string>;
  providerTypeRef: MutableRefObject<string>;
  thinkingEffortRef: MutableRefObject<string>;
  providerModel: string;
  /** handleSendRef — send flow 내부에서 self-reference (plan build callback 등) */
  handleSendRef: MutableRefObject<
    | ((
        text: string,
        files: Attachment[],
        opts?: {
          apiUserContent?: string;
          modeOverride?: Mode;
          planStageOverride?: string;
          skipPaint?: boolean;
        }
      ) => Promise<void>)
    | null
  >;
  runSlashCommandRef: MutableRefObject<((cmd: SlashCommand) => void) | null>;
  // assistantStreamSession 의존성
  debugController: any;
  planStageRef: MutableRefObject<string>;
  pendingQuestionsRef: MutableRefObject<any[]>;
  promotePlanOnCompleteRef: MutableRefObject<boolean>;
  promotePlanToReview: (md: string, opts?: { sessionId?: string }) => boolean;
  ensurePlanAdapter: (id: string) => PlanModeControllerAdapter;
  updateSessionMessages: (id: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  getSessionMessages: (id: string) => ChatMessage[];
  setPendingQuestions: Dispatch<SetStateAction<any[]>>;
  handleNewChat: () => void;
}

export interface UseChatSendFlowReturn {
  handleSend: (
    text: string,
    files: Attachment[],
    opts?: {
      apiUserContent?: string;
      modeOverride?: Mode;
      planStageOverride?: string;
      skipPaint?: boolean;
    }
  ) => Promise<void>;
  handleRegenerate: () => void;
  handleStop: () => void;
  handleStopAndPrefill: (content: string) => void;
  handleResynthesize: (text: string, opts?: { drainQueue?: boolean }) => void;
  handleQueueMessage: (text: string) => void;
  handleQueueApplyNow: (messageId: string) => void;
  handleQueueCancel: (messageId: string) => void;
  handleEditMessage: (messageId: string, newContent: string, files?: Attachment[]) => void;
  handleFork: (messageId: string) => void;
  handleModeChange: (newMode: ModePicker) => void;
  pushSystemNotice: (content: string) => void;
  runSlashCommand: (cmd: SlashCommand) => void;
  planBuildHandoffRef: MutableRefObject<boolean>;
}

export function useChatSendFlow(params: UseChatSendFlowParams): UseChatSendFlowReturn {
  const {
    mode, modeAuto, setMode, setModeAuto,
    messages, messagesRef,
    sessionId, sessionIdRef,
    setMessages, setSessionId, setSessionList, setOpenTabIds,
    sendMessage, stop,
    planStage, planController, planAdapter,
    planGenerateActiveRequestRef, generatingPlan, endPlanGenerationUi,
    msgQueue, setQueueTick,
    stopHandlerRef, sendEpochRef, turnNumberRef, loopSessionIdRef, stepStartRef, parkedAwaitingRef,
    streaming,
    uxState, setUxState, setStuckEvent,
    inlineEditSeed, setInlineEditSeed,
    setComposerSeed,
    setAwaitingUser, setShowClarifying,
    setShowSettings, setSettingsTab,
    setError,
    scrollMessagesToBottom, stickToBottomRef,
    resetPlanChrome, parkPlanForSession, parkProviderForSession,
    persistProviderToSession, restoreProviderForSession,
    providerModelRef, providerBaseUrlRef, providerApiKeyRef, providerTypeRef, thinkingEffortRef,
    providerModel,
    handleSendRef, runSlashCommandRef,
    debugController, planStageRef, pendingQuestionsRef, promotePlanOnCompleteRef,
    promotePlanToReview, ensurePlanAdapter, updateSessionMessages, getSessionMessages,
    setPendingQuestions, handleNewChat
  } = params;

  /** Plan Approve → Build 핸드오프 플래그 (mode flip이 FSM을 초기화하지 않도록) */
  const planBuildHandoffRef = useRef(false);

  // inlineEditSeed ref — stale closure 없이 handleSend 내에서 참조
  const inlineEditSeedRef = useRef<InlineEditContext | null>(null);
  inlineEditSeedRef.current = inlineEditSeed;

  /** StopHandler 인스턴스 — stop() 변경 시마다 재생성 */
  useEffect(() => {
    stopHandlerRef.current = new StopHandler({ abort: stop, queue: msgQueue });
  }, [stop, msgQueue, stopHandlerRef]);

  // msgQueue 구독 → queueTick 갱신
  useEffect(() => {
    return msgQueue.subscribe(() => setQueueTick((t) => t + 1));
  }, [msgQueue, setQueueTick]);

  // ─── 스트리밍 orphan 정리 유틸 ────────────────────────────

  const cleanupStreamingAssistants = useCallback(
    (prev: ChatMessage[]): ChatMessage[] => finalizeStreamingMessages(prev),
    []
  );

  // ─── makeAssistantStream (send-owned factory) ─────────────

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
        planController: ownerAdapter.legacy,
        debugController,
        planSessionHasPlan: () => Boolean(ownerAdapter.session.getPlan()),
        setMessages,
        updateSessionMessages,
        getSessionMessages,
        setPendingQuestions,
        setShowClarifying,
        setAwaitingUser,
        setDebugTick: () => {},
        setError,
        promotePlanToReview: (md: string) => promotePlanToReview(md, { sessionId: ownerId })
      });
    },
    [
      sessionIdRef, ensurePlanAdapter, stepStartRef, turnNumberRef, loopSessionIdRef,
      parkedAwaitingRef, messagesRef, planStageRef, pendingQuestionsRef, promotePlanOnCompleteRef,
      debugController, setMessages, updateSessionMessages, getSessionMessages,
      setPendingQuestions, setShowClarifying, setAwaitingUser, setError, promotePlanToReview
    ]
  );

  // ─── handleSend ───────────────────────────────────────────

  const handleSend = useCallback(
    async (
      text: string,
      files: Attachment[],
      opts?: {
        apiUserContent?: string;
        modeOverride?: Mode;
        planStageOverride?: string;
        /** Edit/rework: transcript already has user + streaming assistant at end */
        skipPaint?: boolean;
      }
    ) => {
      if (!text.trim() && files.length === 0) return;
      setError(null);

      // ADDON-T10: raw "/command" + Enter
      if (files.length === 0 && text.trim().startsWith('/')) {
        const resolved = resolveSlashCommand(text);
        if (resolved.ok) { runSlashCommandRef.current?.(resolved.cmd); return; }
        setError(resolved.error);
        return;
      }

      const ownerId = sessionIdRef.current;
      const epoch = sendEpochRef.current.bump(ownerId);
      const planPhase = planAdapter.session.getPhase();
      const { mode: effectiveMode, decision: modeDecision } = resolveSendMode({
        userMessage: text,
        picker: modeAuto ? 'auto' : mode,
        lastTurn: lastConversationTurn(messagesRef.current),
        planSessionActive: PLAN_STICKY_PHASES.has(planPhase),
        modeOverride: opts?.modeOverride
      });
      if (effectiveMode !== mode) setMode(effectiveMode);
      loopSessionIdRef.current = ownerId;

      if (effectiveMode === 'plan') {
        const phase = planAdapter.session.getPhase();
        if (phase === 'idle' || phase === 'completed' || phase === 'failed') {
          await planAdapter.start(text);
        }
      }

      const displayText = text;
      const mentionBlock = formatAttachmentsForPayload(files);
      const inlineCtx = inlineEditSeedRef.current;
      const inlineBlock = inlineCtx ? formatInlineEditForPayload(inlineCtx) : '';
      let payload = opts?.apiUserContent ?? text;
      if (inlineBlock) {
        payload = payload.trim() ? `${inlineBlock}\n\n${payload}` : inlineBlock;
      }
      if (mentionBlock) {
        payload = payload.trim()
          ? `${mentionBlock}\n\n${payload}`
          : `${mentionBlock}\n\nPlease analyze the attached context.`;
      }

      // RW-C7-05: Design Mode 어노테이션 주입
      const designCtx = designModeContext.getLastContext();
      if (designCtx?.hasAnnotations && designCtx.contextBlock) {
        payload = `${designCtx.contextBlock}\n\n---\n\n${payload}`;
      }

      // HARB: Prefetch + ContextAssembler → user payload 주입
      try {
        const t0 = Date.now();
        const prefetchSource = [inlineBlock, mentionBlock, displayText].filter(Boolean).join('\n');
        const harnessCtx = await buildHarnessTurnContext(
          prefetchSource || displayText,
          effectiveMode,
          'A'
        );
        if (sendEpochRef.current.isStale(ownerId, epoch)) return;
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

      // Re-resolve endpoint at send time (model change may have left empty baseUrl).
      const creds = resolveSendCredentials({
        model: providerModelRef.current,
        baseUrl: providerBaseUrlRef.current,
        apiKey: providerApiKeyRef.current,
        type: providerTypeRef.current
      });
      if (creds.baseUrl && creds.baseUrl !== providerBaseUrlRef.current) {
        providerBaseUrlRef.current = creds.baseUrl;
      }
      if (creds.apiKey !== providerApiKeyRef.current) {
        providerApiKeyRef.current = creds.apiKey;
      }
      if (creds.model && creds.model !== providerModelRef.current) {
        providerModelRef.current = creds.model;
      }
      if (creds.type && creds.type !== providerTypeRef.current) {
        providerTypeRef.current = creds.type;
      }

      // UI: 사용자 입력만 표시 — harness/resynth wrapper는 API 전용
      // skipPaint: ✎/↻ already ran moveUserTurnToEnd (no duplicate user bubble).
      let userMsg: ChatMessage;
      let assistantMsg: ChatMessage;
      let nextMessages: ChatMessage[];

      if (opts?.skipPaint) {
        // Do NOT finalizeStreaming here — that seals the prepared streaming
        // assistant during await(prefetch) and this path then returns silently.
        const prepared = messagesRef.current;
        const maybeAssistant = prepared[prepared.length - 1];
        const maybeUser = prepared[prepared.length - 2];
        if (
          !maybeAssistant ||
          maybeAssistant.role !== 'assistant' ||
          maybeAssistant.status !== 'streaming' ||
          !maybeUser ||
          maybeUser.role !== 'user'
        ) {
          debugWarn('chat.send skipPaint aborted', {
            ownerId,
            lastRole: maybeAssistant?.role || '(none)',
            lastStatus: maybeAssistant?.status || '(none)',
            prevRole: maybeUser?.role || '(none)',
            len: prepared.length
          });
          return;
        }
        userMsg = {
          ...maybeUser,
          content: displayText,
          attachments: files.length ? files : maybeUser.attachments,
          status: 'complete',
          metadata: {
            ...(maybeUser.metadata || {}),
            mode: effectiveMode,
            modeDecision
          }
        };
        assistantMsg = maybeAssistant;
        nextMessages = prepared.map((m) => (m.id === userMsg.id ? userMsg : m));
      } else {
        userMsg = {
          id: uuidv4(),
          role: 'user',
          content: displayText,
          timestamp: Date.now(),
          attachments: files,
          status: 'complete',
          metadata: { mode: effectiveMode, modeDecision }
        };
        assistantMsg = {
          id: uuidv4(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          status: 'streaming'
        };
        const cleaned = cleanupStreamingAssistants(messagesRef.current);
        nextMessages = [...cleaned, userMsg, assistantMsg];
      }

      const contextMessages = selectActiveConversationMessages(
        nextMessages.filter((m) => m.id !== assistantMsg.id)
      );
      const apiMessages = contextMessages.map((m) =>
        m.id === userMsg.id ? { ...m, content: payload } : m
      );

      // After await prefetch the user may have switched tabs — never paint A onto B.
      // Sync messagesRef BEFORE sendMessage so early onError can find the streaming bubble.
      if (sessionIdRef.current === ownerId) {
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
        stickToBottomRef.current = true;
        scrollMessagesToBottom(true);
      } else {
        sessionStore.saveMessages(ownerId, nextMessages, effectiveMode, {
          setCurrent: false
        });
      }
      stepStartRef.current = {};
      turnNumberRef.current += 1;

      const stream = makeAssistantStream(
        effectiveMode,
        () => sendEpochRef.current.isStale(ownerId, epoch),
        ownerId
      );

      // Fail closed with a visible error bubble (never leave empty streaming forever).
      if (!creds.baseUrl || !creds.model) {
        debugWarn('chat.send missing credentials', {
          ownerId,
          model: creds.model || '(empty)',
          baseUrl: creds.baseUrl || '(empty)',
          hintModel: providerModelRef.current || '(empty)'
        });
        stream.onError(
          'No provider endpoint for this tab. Pick a model that belongs to a saved AI Provider connection.'
        );
        return;
      }

      debugLog('chat.send empty reply', 'send start', {
        ownerId,
        mode: effectiveMode,
        model: creds.model,
        baseUrl: String(creds.baseUrl).slice(0, 48),
        msgs: apiMessages.length
      });
      sendMessage(
        payload,
        files,
        apiMessages,
        effectiveMode,
        stream.onDelta,
        stream.onComplete,
        stream.onError,
        {
          ...(opts?.planStageOverride ? { planStageOverride: opts.planStageOverride } : {}),
          runtimeKey: ownerId,
          // Tab-scoped endpoint — always from resolved refs at send time.
          baseUrl: creds.baseUrl,
          apiKey: creds.apiKey || undefined,
          model: creds.model,
          ...(inlineCtx ? { inlineEdit: toInlineEditAgentRequest(displayText, inlineCtx) } : {})
        }
      );
      if (inlineCtx) setInlineEditSeed(null);
    },
    [
      mode, modeAuto, setMode, sendMessage, planStage, planController, planAdapter,
      cleanupStreamingAssistants, promotePlanToReview, scrollMessagesToBottom,
      makeAssistantStream, sessionIdRef, sendEpochRef, loopSessionIdRef, stepStartRef,
      turnNumberRef, messagesRef, setMessages, stickToBottomRef, setError,
      setUxState, setStuckEvent, setInlineEditSeed, runSlashCommandRef,
      providerBaseUrlRef, providerApiKeyRef, providerModelRef, providerTypeRef
    ]
  );

  // handleSendRef에 최신 구현 반영 (plan build callback 등이 이를 참조)
  handleSendRef.current = handleSend;

  // ─── handleRegenerate ─────────────────────────────────────

  /**
   * ↻ regenerate: same rework path as pencil edit —
   * moveUserTurnToEnd(last user) + handleSend(..., { skipPaint: true }).
   * Selected conversation becomes the latest turn, then a new answer streams.
   */
  const handleRegenerate = useCallback(() => {
    if (streaming) {
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current.bump(sessionIdRef.current);
    }

    const snap = cleanupStreamingAssistants(messagesRef.current);
    const idx = lastUserIndex(snap);
    if (idx < 0) return;

    const content = snap[idx].content;
    const prepared = moveUserTurnToEnd(snap, idx, content, uuidv4());
    if (!prepared) return;

    messagesRef.current = prepared.messages;
    setMessages(prepared.messages);
    stickToBottomRef.current = true;
    scrollMessagesToBottom(true);

    void handleSend(content, prepared.attachments, { skipPaint: true });
  }, [
    streaming, cleanupStreamingAssistants, messagesRef, setMessages,
    stickToBottomRef, scrollMessagesToBottom, handleSend,
    stopHandlerRef, sendEpochRef, sessionIdRef
  ]);

  // ─── handleStop ───────────────────────────────────────────

  const handleStop = useCallback(() => {
    stopHandlerRef.current?.stop('user_stop');
    sendEpochRef.current.bump(sessionIdRef.current);
    setAwaitingUser(false);
    setShowClarifying(false);
    if (generatingPlan) {
      const id = planGenerateActiveRequestRef.current;
      if (id) {
        try { getVsCodeApi()?.postMessage?.({ type: 'plan.cancel', requestId: id }); } catch { /* ignore */ }
      }
      endPlanGenerationUi(false);
    }
    setMessages(cleanupStreamingAssistants);
    setError(null);
  }, [cleanupStreamingAssistants, generatingPlan, endPlanGenerationUi, stopHandlerRef,
    sendEpochRef, sessionIdRef, planGenerateActiveRequestRef, setAwaitingUser, setShowClarifying,
    setMessages, setError]);

  const handleStopAndPrefill = useCallback(
    (content: string) => {
      handleStop();
      setComposerSeed({ text: content, nonce: Date.now() });
    },
    [handleStop, setComposerSeed]
  );

  // ─── handleResynthesize ───────────────────────────────────

  /**
   * Interrupt & Resynthesize.
   * - drainQueue true (default, Enter): 남은 큐 merge
   * - drainQueue false (Apply now): 주어진 텍스트만
   */
  const handleResynthesize = useCallback(
    (text: string, opts?: { drainQueue?: boolean }) => {
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

      const cleaned = cleanupStreamingAssistants(raw);
      setMessages(cleaned);
      messagesRef.current = cleaned;

      if (!instruction.trim()) return;

      const prior = raw.filter((m) => !(m.role === 'assistant' && m.status === 'streaming'));
      const agentMsgs: AgentMessage[] = [
        ...prior.map((m) => ({
          role: m.role as AgentMessage['role'],
          content: m.content,
          name: undefined
        })),
        ...(last?.role === 'assistant'
          ? [{ role: 'assistant' as const, content: interruptedExtra || '(interrupted before any text)', name: undefined }]
          : [])
      ];

      const rebuilt = buildResynthesizeMessages(agentMsgs, instruction, turnNumberRef.current, mode);
      const synthesisText = rebuilt[rebuilt.length - 1]?.content || instruction;

      const ownerId = sessionIdRef.current;
      const epochAtSchedule = sendEpochRef.current.get(ownerId);
      setTimeout(() => {
        if (sendEpochRef.current.isStale(ownerId, epochAtSchedule)) return;
        handleSend(instruction, [], { apiUserContent: synthesisText });
      }, 50);
    },
    [msgQueue, mode, handleSend, cleanupStreamingAssistants, messagesRef, setMessages,
      stopHandlerRef, sendEpochRef, sessionIdRef, turnNumberRef]
  );

  // ─── handleQueueMessage ───────────────────────────────────

  /** Alt+Enter: 큐에 추가 (스트리밍 중이면 대기, 유휴면 즉시 flush) */
  const handleQueueMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    msgQueue.enqueue(trimmed, 'queue_only');
    if (!streaming) {
      const drained = msgQueue.drain();
      msgQueue.pruneSettled();
      if (drained[0]) handleSend(drained.join('\n\n'), []);
    }
  }, [msgQueue, streaming, handleSend]);

  // 스트리밍 종료 후 Alt+Enter 큐 flush — only when *this* tab finished, not on tab switch
  const streamOwnerRef = useRef(sessionId);
  useEffect(() => {
    if (streaming) streamOwnerRef.current = sessionId;
  }, [streaming, sessionId]);

  useEffect(() => {
    if (streaming) return;
    // Active runtime went idle because user switched away from a streaming tab.
    if (streamOwnerRef.current !== sessionId) return;
    if (msgQueue.getQueued().length === 0) return;
    const t = window.setTimeout(() => {
      if (streamOwnerRef.current !== sessionIdRef.current) return;
      const drained = msgQueue.drain();
      msgQueue.pruneSettled();
      if (drained.length > 0) handleSend(drained.join('\n\n'), []);
    }, 80);
    return () => window.clearTimeout(t);
  }, [streaming, sessionId, msgQueue, handleSend, sessionIdRef]);

  const handleQueueApplyNow = useCallback((messageId: string) => {
    const msg = msgQueue.take(messageId);
    msgQueue.pruneSettled();
    if (msg) handleResynthesize(msg.text, { drainQueue: false });
  }, [msgQueue, handleResynthesize]);

  const handleQueueCancel = useCallback((messageId: string) => {
    msgQueue.cancelQueued(messageId);
    msgQueue.pruneSettled();
  }, [msgQueue]);

  // ─── handleEditMessage / handleFork ──────────────────────

  /**
   * ✎ pencil edit: same rework path as ↻ regenerate —
   * moveUserTurnToEnd(selected user) + handleSend(..., { skipPaint: true }).
   */
  const handleEditMessage = useCallback((
    messageId: string,
    newContent: string,
    files?: Attachment[]
  ) => {
    if (streaming) {
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current.bump(sessionIdRef.current);
    }

    const snap = cleanupStreamingAssistants(messagesRef.current);
    const idx = snap.findIndex((m) => m.id === messageId);
    if (idx < 0 || snap[idx].role !== 'user') return;

    const prepared = moveUserTurnToEnd(snap, idx, newContent, uuidv4());
    if (!prepared) return;

    // Composer may change attachments while editing
    const sendFiles = files ?? prepared.attachments;
    if (files) {
      const userIdx = prepared.messages.length - 2;
      if (userIdx >= 0 && prepared.messages[userIdx]?.role === 'user') {
        prepared.messages[userIdx] = {
          ...prepared.messages[userIdx],
          attachments: files
        };
      }
    }

    messagesRef.current = prepared.messages;
    setMessages(prepared.messages);
    stickToBottomRef.current = true;
    scrollMessagesToBottom(true);

    void handleSend(newContent, sendFiles, { skipPaint: true });
  }, [
    streaming, cleanupStreamingAssistants, messagesRef, setMessages,
    stickToBottomRef, scrollMessagesToBottom, handleSend,
    stopHandlerRef, sendEpochRef, sessionIdRef
  ]);

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
        sessionStore.saveMessages(sessionId, snap, mode, { setCurrent: false });
      }
      parkPlanForSession(sessionId);
      parkProviderForSession(sessionId);
      sessionStore.setMode(sessionId, mode, { modeAuto: false });
      const sliced = snap.slice(0, idx + 1);
      const forked = sessionStore.forkFromMessages(sliced, mode);
      persistProviderToSession(forked.id);
      sessionStore.setMode(forked.id, mode, { modeAuto: false });
      const nextMessages = sanitizeLoadedMessages(forked.messages || []);
      // Seed refs before paint (same contract as handleOpenSession).
      messagesRef.current = nextMessages;
      sessionIdRef.current = forked.id;
      setSessionId(forked.id);
      setMessages(nextMessages);
      setMode(mode);
      setModeAuto(false);
      stepStartRef.current = {};
      setSessionList(sessionStore.list());
      setOpenTabIds((prev) => [forked.id, ...prev.filter((id) => id !== forked.id)]);
      resetPlanChrome();
      setAwaitingUser(false);
      setError(null);
      parkedAwaitingRef.current = null;
      loopSessionIdRef.current = null;
    },
    [
      messages, streaming, sessionId, mode,
      parkPlanForSession, parkProviderForSession, persistProviderToSession,
      resetPlanChrome, sessionIdRef, sendEpochRef, stopHandlerRef,
      messagesRef, setSessionId, setMessages, setSessionList, setOpenTabIds,
      setMode, setModeAuto, setAwaitingUser, setError, parkedAwaitingRef, loopSessionIdRef, stepStartRef
    ]
  );

  // ─── handleModeChange ────────────────────────────────────

  const handleModeChange = useCallback((newMode: ModePicker) => {
    if (newMode === 'auto') {
      setModeAuto(true);
      sessionStore.setMode(sessionIdRef.current, mode, { modeAuto: true });
      return;
    }
    if (newMode === mode && !modeAuto) return;
    // 사용자가 의도적으로 mode 변경 → Build handoff 플래그 해제
    if (newMode !== 'agent') planBuildHandoffRef.current = false;
    setModeAuto(false);
    if (streaming) {
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current.bump(sessionIdRef.current);
      setMessages(cleanupStreamingAssistants);
    }
    setMode(newMode);
    sessionStore.setMode(sessionIdRef.current, newMode, { modeAuto: false });
    setShowSettings(false);
    setAwaitingUser(false);
    setError(null);
  }, [mode, modeAuto, streaming, cleanupStreamingAssistants, setMode, setModeAuto,
    setShowSettings, setAwaitingUser, setError, stopHandlerRef, sendEpochRef, sessionIdRef,
    setMessages]);

  // ─── pushSystemNotice / runSlashCommand ──────────────────

  /** ADDON-T10: system notice — 모델에 전송되지 않는 경량 안내 (host가 role=system 필터링) */
  const pushSystemNotice = useCallback((content: string) => {
    const notice: ChatMessage = {
      id: uuidv4(), role: 'system', content, timestamp: Date.now(), status: 'complete'
    };
    setMessages((prev) => [...prev, notice]);
  }, [setMessages]);

  const runSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      if (cmd.action === 'newChat') { handleNewChat(); return; }
      if (cmd.action === 'settings') { setShowSettings(true); setSettingsTab('models'); return; }
      if (cmd.action === 'mode' && cmd.mode) { handleModeChange(cmd.mode); return; }
      if (cmd.action === 'compact') {
        try { getVsCodeApi()?.postMessage?.({ type: 'session.compact', sessionId, messageCount: messages.length }); } catch { /* no host bridge */ }
        pushSystemNotice('Compaction requested — older turns will be summarized to free up context. (This is a best-effort request; full compaction may not be wired for every provider yet.)');
        return;
      }
      if (cmd.action === 'cost') {
        const tokens = uxState.contextTokens || 0;
        const content = tokens > 0
          ? `Cost: ~${tokens.toLocaleString()} tokens used this session (model: ${providerModel}). Actual billing depends on your provider's pricing.`
          : 'Cost: no usage recorded yet this session — see the Status Bar for live token/cost details.';
        pushSystemNotice(content);
        return;
      }
      if (cmd.action === 'model') { setShowSettings(true); setSettingsTab('models'); return; }
      if (cmd.action === 'permissions') { setShowSettings(true); setSettingsTab('permission'); return; }
      if (cmd.action === 'help') {
        const lines = SLASH_COMMANDS.map((c) => `${c.label} — ${c.description}`);
        pushSystemNotice(['Available commands:', ...lines].join('\n'));
        return;
      }
      if (cmd.action === 'bestOfN') {
        try { getVsCodeApi()?.postMessage?.({ type: 'host.bestOfN' }); } catch { /* ignore */ }
      }
    },
    [handleNewChat, handleModeChange, pushSystemNotice, sessionId, messages.length,
      uxState.contextTokens, providerModel, setShowSettings, setSettingsTab]
  );

  runSlashCommandRef.current = runSlashCommand;

  // ─── Plan Build-Ready callback ────────────────────────────

  useEffect(() => {
    planController.onBuildReadyCallback((_context: string) => {
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
      // planStage는 plan 훅에서 관리 — 여기서 직접 setPlanStage 불가;
      // onBuildReady 이후 planController가 stage='build'로 이동하므로
      // applyPlanStageUi → setPlanStage 경유

      // mode flip 후 탭 provider 복원
      queueMicrotask(() => { if (sid) restoreProviderForSession(sid); });

      const structuredPlan = planAdapter.session.getPlan();
      if (structuredPlan) {
        queueMicrotask(() => {
          void (async () => {
            try {
              const executionPlan = planAdapter.toExecutionPlan({ approvedAt: Date.now() });
              if (!planAdapter.session.getExecutionPlan()) {
                startPlanExecution(planAdapter.session, executionPlan);
              }
              const api = getVsCodeApi();
              if (!api?.postMessage) {
                setError('Plan execution requires the VS Code extension host.');
                return;
              }
              const requestId = `plan-exec-${Date.now().toString(36)}`;
              const executionSnapshot = planAdapter.session.getExecutionPlan() ?? executionPlan;
              const creds = resolveSendCredentials({
                model: providerModelRef.current,
                baseUrl: providerBaseUrlRef.current,
                apiKey: providerApiKeyRef.current,
                type: providerTypeRef.current
              });
              api.postMessage({
                type: 'plan.execute',
                requestId,
                sessionId: sid,
                parentTurnId: `turn-${turnNumberRef.current}`,
                executionPlan: executionSnapshot,
                repoRoot: structuredPlan.repoRoot ?? executionSnapshot.repoRoot,
                model: creds.model,
                baseUrl: creds.baseUrl,
                apiKey: creds.apiKey || undefined,
                providerType: creds.type,
                thinkingEffort: thinkingEffortRef.current
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Failed to start plan execution.');
            }
          })();
        });
        return;
      }

      // 구조적 플랜 없음 → legacy 마크다운 → Agent handoff
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
    planController, planAdapter, cleanupStreamingAssistants,
    persistProviderToSession, restoreProviderForSession,
    setMode, setModeAuto, setAwaitingUser, setShowClarifying, setMessages, setError,
    sessionIdRef, sendEpochRef, stopHandlerRef, turnNumberRef,
    providerModelRef, providerBaseUrlRef, providerApiKeyRef, providerTypeRef, thinkingEffortRef,
    handleSendRef
  ]);

  return {
    handleSend,
    handleRegenerate,
    handleStop,
    handleStopAndPrefill,
    handleResynthesize,
    handleQueueMessage,
    handleQueueApplyNow,
    handleQueueCancel,
    handleEditMessage,
    handleFork,
    handleModeChange,
    pushSystemNotice,
    runSlashCommand,
    planBuildHandoffRef
  };
}
