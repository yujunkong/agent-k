/**
 * useChatPlanMode — Plan 모드 FSM 전체 + V2 어댑터 + Clarifying 질문 UI
 *
 * 담당:
 *   - PlanModeController (V1 legacy) + PlanModeControllerAdapter (V2) 탭별 격리
 *   - planStage, showClarifying, showPlanReview, pendingQuestions, awaitingUser, generatingPlan 상태
 *   - 탭 전환 시 plan 스냅 park/restore
 *   - promotePlanToReview / commitPlanResult / requestPlanGenerate
 *   - beginPlanGenerationUi / endPlanGenerationUi (타임라인 step 주입)
 *   - sealAskingSteps / handlePlanAnswer / handleQuestionsComplete / handleQuestionsCancel
 *   - handlePlanEdit / handleOpenPlanInEditor / handlePlanApprove / handlePlanReject
 *   - handleOpenReview / handleDiscardPlan
 *   - Plan 실행 이벤트 핸들러 (host 메시지 디스패처에서 호출)
 *
 * 의존성 주입:
 *   - updateSessionMessages: ref 간접 참조 (useChatSessions 이후 populated)
 *   - messagesRef: ChatApp에서 선언 후 useChatSessions가 채움
 *   - debugControllerRef: useChatDebugMode 이후 populated
 */
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type MutableRefObject,
  type Dispatch,
  type SetStateAction
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PlanModeController } from '../../plan/PlanModeController';
import type { PlanStage } from '../../plan/PlanModeController';
import { PlanModeControllerAdapter, toObservedToolCall } from '../../plan/session';
import type { ExecutionPlan, PlanGenerationResult } from '../../plan/session';
import {
  finalizePlanExecution,
  recordTaskExecutionFailed,
  recordTaskExecutionStarted,
  startPlanExecution,
  updatePlanExecutionSnapshot,
  shouldShowPlanExecutionBar,
} from '../../plan/session';
import {
  PLAN_GENERATE_TIMEOUT_MESSAGE,
  createPlanGenerateWatchdog
} from '../planGenerateWatchdog';
import { planGenerator } from '../../plan/PlanGenerator';
import { askQuestionTool } from '../../tools/session/AskQuestionTool';
import type { PendingQuestion } from '../../tools/session/AskQuestionTool';
import {
  setAskQuestionCardHandlers,
  type AskCardConfirmPayload,
  type AskCardSelectPayload,
  type AskCardSkipPayload,
} from '../askQuestionCardBridge';
import {
  extractPlanMarkdownFromMessage,
  findLatestPlanMarkdown,
  looksLikePlanDocument,
  dedupeRepeatedPlanDocument,
  buildPlanChatSummary
} from '../planPromote';
import {
  textFromPlanController,
  buildPlanResearchContext,
  finalizeStreamingMessages
} from '../chatAppHelpers';
import {
  applyWorkEvent,
  upsertWorkEvents,
  settleWorkEvents
} from '../conversation/conversationWorkEvent';
import type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';
import { PLAN_GENERATE_STEP_ID, planGenerateWorkEvent } from '../planGenerateStep';
import { getVsCodeApi } from '../host/vscodeApi';
import type { ChatMessage, Mode } from '../types';
import type { DebugModeController } from '../../debug/DebugModeController';
import type { SendEpochMap } from '../sendEpoch';
import type { StopHandler } from '../../loop/StopHandler';
import { sessionStore } from '../hooks/useChatSessions';

export interface UseChatPlanModeParams {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  sessionIdRef: MutableRefObject<string>;
  /**
   * useChatSessions.updateSessionMessages 에 대한 ref 간접 참조.
   * useChatPlanMode는 sessions보다 먼저 초기화되므로 ref로 받아 defer.
   */
  updateSessionMessagesRef: MutableRefObject<
    (id: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => void
  >;
  messagesRef: MutableRefObject<ChatMessage[]>;
  /** setMessages relay — useChatSessions 이후 populated */
  setMessagesRef: MutableRefObject<Dispatch<SetStateAction<ChatMessage[]>>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setAwaitingUser: Dispatch<SetStateAction<boolean>>;
  /** streaming relay ref — useChatStream 이후 populated */
  streamingRef: MutableRefObject<boolean>;
  stopHandlerRef: MutableRefObject<StopHandler | null>;
  sendEpochRef: MutableRefObject<SendEpochMap>;
  /** provider 값 — requestPlanGenerate host 메시지에 필요 */
  providerType: string;
  providerBaseUrl: string;
  providerApiKey: string;
  providerModel: string;
  /**
   * DebugModeController ref — handlePlanAnswer의 debug 분기에서 사용.
   * useChatDebugMode 이후 populated.
   */
  debugControllerRef: MutableRefObject<DebugModeController | null>;
  setDebugTick: Dispatch<SetStateAction<number>>;
}

/** 탭별 Plan 크롬 스냅 — 백그라운드 Review가 활성 Analysis 탭을 덮어쓰지 않게 */
type PlanSessionSnap = {
  flow: ReturnType<PlanModeController['getState']>;
  showPlanReview: boolean;
  showClarifying: boolean;
  pendingQuestions: PendingQuestion[];
  lastPromotedPlan: string;
  promoteOnComplete: boolean;
  generatingPlan: boolean;
};

export interface UseChatPlanModeReturn {
  // 상태
  planStage: PlanStage;
  setPlanStage: Dispatch<SetStateAction<PlanStage>>;
  /** stale closure 없이 외부에서 planStage 읽기용 ref (sendFlow 등에서 참조) */
  planStageRef: MutableRefObject<PlanStage>;
  /** stale closure 없이 외부에서 pendingQuestions 읽기용 ref */
  pendingQuestionsRef: MutableRefObject<import('../../tools/session/AskQuestionTool').PendingQuestion[]>;
  showClarifying: boolean;
  setShowClarifying: Dispatch<SetStateAction<boolean>>;
  showPlanReview: boolean;
  setShowPlanReview: Dispatch<SetStateAction<boolean>>;
  /** Live status line on PlanCard (from plan.card.patch). */
  cardStatusText: string | undefined;
  setCardStatusText: Dispatch<SetStateAction<string | undefined>>;
  planCardTick: number;
  applyCardPatch: (data: {
    planId?: string;
    phase?: string;
    taskStatuses?: Array<{ taskId: string; status: string }>;
    statusText?: string;
    document?: import('@agent-k/plan').PlanDocument;
  }) => void;
  pendingQuestions: PendingQuestion[];
  setPendingQuestions: Dispatch<SetStateAction<PendingQuestion[]>>;
  generatingPlan: boolean;
  setGeneratingPlan: Dispatch<SetStateAction<boolean>>;
  generatingPlanRef: MutableRefObject<boolean>;
  // Plan 어댑터
  planAdapter: PlanModeControllerAdapter;
  planController: PlanModeController;
  /**
   * ChatApp must call this with React sessionId after useChatSessions —
   * planAdapter otherwise stays on the previous tab (hook order lag).
   */
  syncBoundSessionId: (id: string) => void;
  planGenerateActiveRequestRef: MutableRefObject<string | null>;
  planFileExistsResolversRef: MutableRefObject<Map<string, { resolve: (exists: boolean) => void; reject: (error: Error) => void }>>;
  planGenerateResolversRef: MutableRefObject<Map<string, {
    sessionId: string;
    resolve: (result: PlanGenerationResult) => void;
    reject: (error: Error) => void;
    beginGenerateTimeout: () => void;
  }>>;
  planGenerateTimedOutRef: MutableRefObject<Set<string>>;
  planSnapBySessionRef: MutableRefObject<Map<string, PlanSessionSnap>>;
  planAdaptersRef: MutableRefObject<Map<string, PlanModeControllerAdapter>>;
  // 파생 Plan 실행 상태
  planTick: number;
  tasksAwaitingVerification: { id: string; title: string }[];
  activeExecutionPlan: ExecutionPlan | null;
  showPlanExecutionBar: boolean;
  handleVerifyTaskManually: (taskId: string) => void;
  // lifecycle
  parkPlanForSession: (id: string) => void;
  restorePlanForSession: (id: string) => void;
  resetPlanChrome: () => void;
  hasPlanSnap: (id: string) => boolean;
  onDeletePlanSnap: (id: string) => void;
  ensurePlanAdapter: (id: string) => PlanModeControllerAdapter;
  getPlanAdapterForSession: (id: string) => PlanModeControllerAdapter;
  applyPlanStageUi: (ownerSessionId: string, stage: PlanStage, ctrl: PlanModeController) => void;
  /** sendFlow가 onComplete 시 plan promote를 실행할지 결정하는 ref */
  promotePlanOnCompleteRef: MutableRefObject<boolean>;
  // UI 핸들러
  promotePlanToReview: (planMdRaw: string, opts?: { slug?: string; title?: string; sessionId?: string }) => boolean;
  commitPlanResult: (result: PlanGenerationResult, ownerSessionId: string, opts?: { late?: boolean }) => Promise<boolean>;
  requestPlanGenerate: (params: { goal: string; researchContext: string; rejectionFeedback?: string }) => Promise<PlanGenerationResult>;
  requestWorkspaceFileExists: (relativePath: string) => Promise<boolean>;
  beginPlanGenerationUi: (ownerSessionId?: string) => void;
  endPlanGenerationUi: (ok: boolean, ownerSessionId?: string) => void;
  sealAskingSteps: () => void;
  handlePlanAnswer: (id: string, answer: string) => void;
  handleQuestionsComplete: () => void;
  handleQuestionsCancel: () => void;
  handlePlanEdit: (content: string) => void;
  handleOpenPlanInEditor: (content: string) => void;
  handlePlanApprove: (taskIds?: string[]) => void;
  handlePlanReject: (reason?: string) => void;
  handlePlanReviewClose: () => void;
  handleOpenReview: () => void;
  handleDiscardPlan: () => void;
}

export function useChatPlanMode(params: UseChatPlanModeParams): UseChatPlanModeReturn {
  const {
    mode,
    setMode,
    sessionIdRef,
    updateSessionMessagesRef,
    messagesRef,
    setMessagesRef,
    setError,
    setAwaitingUser,
    streamingRef,
    stopHandlerRef,
    sendEpochRef,
    providerType,
    providerBaseUrl,
    providerApiKey,
    providerModel,
    debugControllerRef,
    setDebugTick
  } = params;

  // ─── Plan 어댑터 레지스트리 (탭별 격리) ────────────────
  const planAdaptersRef = useRef<Map<string, PlanModeControllerAdapter>>(new Map());
  const planSnapBySessionRef = useRef<Map<string, PlanSessionSnap>>(new Map());

  // ─── Plan Chrome 상태 ──────────────────────────────────────
  const [planStage, setPlanStage] = useState<PlanStage>('research');
  const [showClarifying, setShowClarifying] = useState(false);
  const [showPlanReview, setShowPlanReview] = useState(false);
  const [cardStatusText, setCardStatusText] = useState<string | undefined>();
  /** Bump when session mutates so PlanCard re-reads adapter SoT. */
  const [planCardTick, setPlanCardTick] = useState(0);
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // stale closure 방지 refs
  const generatingPlanRef = useRef(generatingPlan);
  generatingPlanRef.current = generatingPlan;
  const planStageRef = useRef(planStage);
  planStageRef.current = planStage;
  const showPlanReviewRef = useRef(showPlanReview);
  showPlanReviewRef.current = showPlanReview;
  const showClarifyingRef = useRef(showClarifying);
  showClarifyingRef.current = showClarifying;
  const pendingQuestionsRef = useRef(pendingQuestions);
  pendingQuestionsRef.current = pendingQuestions;

  /** Plan Approve → Build 핸드오프 중 플래그 (mode flip 이 FSM을 초기화하지 않도록) */
  const planBuildHandoffRef = useRef(false);
  const promotePlanOnCompleteRef = useRef(false);
  const lastPromotedPlanRef = useRef<string>('');

  // Plan request 추적 refs
  const planFileExistsResolversRef = useRef(new Map<string, { resolve: (exists: boolean) => void; reject: (error: Error) => void }>());
  const planGenerateResolversRef = useRef(new Map<string, {
    sessionId: string;
    resolve: (result: PlanGenerationResult) => void;
    reject: (error: Error) => void;
    beginGenerateTimeout: () => void;
  }>());
  const planGenerateTimedOutRef = useRef(new Set<string>());
  const planGenerateActiveRequestRef = useRef<string | null>(null);
  const questionsCompleteInFlightRef = useRef(false);

  // ─── updateSessionMessages 헬퍼 (ref 간접) ───────────────
  const updateSessionMessages = useCallback(
    (id: string, updater: (prev: ChatMessage[]) => ChatMessage[]) =>
      updateSessionMessagesRef.current(id, updater),
    [updateSessionMessagesRef]
  );

  // ─── Adapter 관리 ──────────────────────────────────────────

  /** Plan 단계 chrome — 소유 탭만 업데이트; 백그라운드 탭은 스냅에 park */
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
        showPlanReview: openReview ? true : closeReview ? false : Boolean(prev?.showPlanReview),
        showClarifying: stage === 'questions',
        pendingQuestions: prev?.pendingQuestions?.map((q) => ({ ...q })) || [],
        lastPromotedPlan: prev?.lastPromotedPlan || '',
        promoteOnComplete: Boolean(prev?.promoteOnComplete),
        generatingPlan: Boolean(prev?.generatingPlan)
      });
    },
    [sessionIdRef]
  );

  /** 탭별 Plan 어댑터 생성 (없으면 신규) — owner-gated stage 변경 등록 */
  const ensurePlanAdapter = useCallback(
    (id: string): PlanModeControllerAdapter => {
      const key = String(id || '').trim() || 'global';
      const existing = planAdaptersRef.current.get(key);
      if (existing) return existing;
      const created = new PlanModeControllerAdapter(key);
      created.legacy.onStageChangeCallback((stage: PlanStage) => {
        applyPlanStageUi(key, stage, created.legacy);
      });
      planAdaptersRef.current.set(key, created);
      return created;
    },
    [applyPlanStageUi]
  );

  const getPlanAdapterForSession = useCallback(
    (id: string) => ensurePlanAdapter(id),
    [ensurePlanAdapter]
  );

  /** 현재 활성 탭의 Plan 어댑터 — boundSessionId (ChatApp sync)로 고정 */
  const [boundSessionId, setBoundSessionId] = useState(
    () => String(sessionIdRef.current || sessionStore.loadActive().id || 'global')
  );
  const syncBoundSessionId = useCallback((id: string) => {
    const next = String(id || '').trim();
    if (!next) return;
    setBoundSessionId((prev) => (prev === next ? prev : next));
  }, []);

  const planAdapter = useMemo(
    () => ensurePlanAdapter(boundSessionId),
    [boundSessionId, ensurePlanAdapter]
  );
  const planController = planAdapter.legacy;

  // Plan 세션 이벤트 → 파생 상태 갱신
  const [planTick, setPlanTick] = useState(0);
  useEffect(() => {
    return planAdapter.session.onEvent(() => setPlanTick((t) => t + 1));
  }, [planAdapter]);

  const tasksAwaitingVerification = useMemo(() => {
    void planTick;
    const plan = planAdapter.session.getPlan();
    if (!plan) return [];
    return plan.tasks
      .filter((t) => planAdapter.session.getTaskStatus(t.id) === 'awaiting_verification')
      .map((t) => ({ id: t.id, title: t.title }));
  }, [planAdapter, planTick]);

  const activeExecutionPlan = useMemo(() => {
    void planTick;
    return planAdapter.session.getExecutionPlan();
  }, [planAdapter, planTick]);

  const showPlanExecutionBar = useMemo(
    () => shouldShowPlanExecutionBar(activeExecutionPlan),
    [activeExecutionPlan]
  );

  const handleVerifyTaskManually = useCallback(
    (taskId: string) => {
      try {
        planAdapter.verifyTaskManually(taskId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not mark the task as verified.');
      }
    },
    [planAdapter, setError]
  );

  // ─── Park / Restore ────────────────────────────────────────

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
  }, [ensurePlanAdapter, sessionIdRef]);

  const hasPlanSnap = useCallback(
    (id: string) => planSnapBySessionRef.current.has(id),
    []
  );
  const onDeletePlanSnap = useCallback((id: string) => {
    planSnapBySessionRef.current.delete(id);
    planAdaptersRef.current.delete(id);
  }, []);

  // plan 모드 이탈 시 chrome 초기화 (Approve→Build 핸드오프 제외)
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
  }, [mode, ensurePlanAdapter, sessionIdRef]);

  // ─── requestPlanGenerate ────────────────────────────────────────

  /** Plan 생성 — CORS 이슈로 Extension Host를 통해 실행 */
  const requestPlanGenerate = useCallback(
    async (params: { goal: string; researchContext: string; rejectionFeedback?: string }) => {
      return new Promise<PlanGenerationResult>((resolve, reject) => {
        const api = getVsCodeApi();
        if (!api?.postMessage) {
          reject(new Error('VS Code API unavailable for Plan generation.'));
          return;
        }
        const requestId = `plan_v2_${uuidv4()}`;
        const ownerSessionId = sessionIdRef.current;
        planGenerateActiveRequestRef.current = requestId;
        const fireWatchdog = (message: string) => {
          planGenerateResolversRef.current.delete(requestId);
          planGenerateTimedOutRef.current.add(requestId);
          try {
            api.postMessage({ type: 'plan.cancel', requestId });
          } catch {
            /* ignore */
          }
          if (planGenerateActiveRequestRef.current === requestId) {
            planGenerateActiveRequestRef.current = null;
          }
          reject(new Error(message));
        };
        const watchdog = createPlanGenerateWatchdog({
          setTimeout: (fn, ms) => window.setTimeout(fn, ms),
          clearTimeout: (id) => window.clearTimeout(id as number),
          onGenerateTimeout: () => fireWatchdog(PLAN_GENERATE_TIMEOUT_MESSAGE)
        });
        planGenerateResolversRef.current.set(requestId, {
          sessionId: ownerSessionId,
          resolve: (result) => {
            watchdog.clear();
            planGenerateTimedOutRef.current.delete(requestId);
            if (planGenerateActiveRequestRef.current === requestId) planGenerateActiveRequestRef.current = null;
            resolve(result);
          },
          reject: (error) => {
            watchdog.clear();
            if (planGenerateActiveRequestRef.current === requestId) planGenerateActiveRequestRef.current = null;
            reject(error);
          },
          beginGenerateTimeout: watchdog.beginGenerateTimeout
        });
        api.postMessage({
          type: 'plan.generate',
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
    },
    [sessionIdRef, providerType, providerBaseUrl, providerApiKey, providerModel]
  );

  // 언마운트 시 진행 중인 plan.generate 취소
  useEffect(() => {
    return () => {
      const id = planGenerateActiveRequestRef.current;
      if (!id) return;
      try {
        getVsCodeApi()?.postMessage?.({ type: 'plan.cancel', requestId: id });
      } catch {
        /* ignore */
      }
    };
  }, []);

  // ─── requestWorkspaceFileExists ───────────────────────────

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

  // ─── promotePlanToReview ─────────────────────────────────

  /** Plan 마크다운 저장 + Review overlay 열기 (동일 내용 반복 방지) */
  const promotePlanToReview = useCallback(
    (planMdRaw: string, opts?: { slug?: string; title?: string; sessionId?: string }): boolean => {
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
        (existingSlug && /^plan_[a-f0-9]+$/i.test(existingSlug) ? existingSlug : undefined);

      try {
        const api = getVsCodeApi();
        if (!api?.postMessage) {
          if (isActiveOwner) {
            setError('Plan save: VS Code API is unavailable. Press F5 to reopen the Extension Host.');
          }
        } else {
          api.postMessage({ type: 'plan.save', title, content: planMd, slug: slugForSave, sessionId: ownerSessionId });
        }
      } catch (e) {
        if (isActiveOwner) setError(e instanceof Error ? e.message : 'Plan save request failed');
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
      try { sections = planGenerator.parseDocument(planMd); } catch { sections = []; }

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
          lastPromotedPlanRef.current = isActiveOwner ? planMd : lastPromotedPlanRef.current;
          promotePlanOnCompleteRef.current = isActiveOwner ? false : promotePlanOnCompleteRef.current;
          const summary = buildPlanChatSummary(planMd);
          updateSessionMessages(ownerSessionId, (prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role !== 'assistant') continue;
              next[i] = { ...next[i], content: summary, openingLead: undefined, turnProse: undefined };
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
          if (isActiveOwner) setError(e instanceof Error ? e.message : 'Could not move to Plan review.');
        });
      return true;
    },
    [ensurePlanAdapter, sessionIdRef, updateSessionMessages, setError]
  );

  // ─── commitPlanResult ───────────────────────────────────

  const commitPlanResult = useCallback(
    async (result: PlanGenerationResult, ownerSessionId: string, opts?: { late?: boolean }) => {
      if (!result.ok || !result.plan) return false;
      const ownerAdapter = getPlanAdapterForSession(ownerSessionId);
      const phase = ownerAdapter.session.getPhase();
      if (opts?.late && (phase === 'executing' || phase === 'completed')) return false;

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
        { id: uuidv4(), role: 'assistant' as const, content, timestamp: Date.now(), status: 'complete' as const }
      ]);

      if (ownerSessionId === sessionIdRef.current) {
        setPlanStage('review');
        setShowPlanReview(true);
        setGeneratingPlan(false);
        setError(null);
      } else {
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
    [getPlanAdapterForSession, updateSessionMessages, sessionIdRef, setError]
  );

  // ─── beginPlanGenerationUi / endPlanGenerationUi ──────────

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
        if (next[i].role === 'assistant') { idx = i; break; }
      }
      const nextTurn = (steps: ChatMessage['steps']): number => {
        let max = 0;
        for (const s of steps || []) {
          if (s.id === PLAN_GENERATE_STEP_ID) continue;
          if (typeof s.turn === 'number' && s.turn > 0) { max = Math.max(max, s.turn); continue; }
          const m = String(s.id || '').match(/(?:thinking|planning|tool|step)[^\d]*(\d+)/i);
          max = Math.max(max, m ? Number(m[1]) : 1);
        }
        return max + 1;
      };
      const makeStep = (turn: number) => ({
        id: PLAN_GENERATE_STEP_ID,
        kind: 'thinking' as const,
        label: 'Creating plan',
        itemStatus: 'running' as const,
        thoughtRole: 'opening' as const,
        turn
      });
      const planEvent = planGenerateWorkEvent('running');
      if (idx < 0) {
        next.push({
          id: uuidv4(), role: 'assistant', content: '', timestamp: Date.now(),
          status: 'streaming', steps: [makeStep(1)], workItems: [planEvent]
        });
      } else {
        const msg = next[idx];
        const existing = (msg.steps || []).find((s) => s.id === PLAN_GENERATE_STEP_ID);
        const step = makeStep(
          existing && typeof existing.turn === 'number' && existing.turn > 0
            ? existing.turn
            : nextTurn(msg.steps)
        );
        const steps = [
          ...(msg.steps || []).map((s) =>
            s.kind === 'asking' && s.itemStatus === 'running'
              ? { ...s, itemStatus: 'done' as const }
              : s.id === PLAN_GENERATE_STEP_ID ? step : s
          )
        ];
        if (!steps.some((s) => s.id === PLAN_GENERATE_STEP_ID)) steps.push(step);
        next[idx] = { ...msg, status: 'streaming', steps, workItems: upsertWorkEvents(msg.workItems, planEvent) };
      }
      return next;
    });
  }, [ensurePlanAdapter, updateSessionMessages, sessionIdRef, setAwaitingUser]);

  const endPlanGenerationUi = useCallback(
    (ok: boolean, ownerSessionId?: string) => {
      const ownerId = String(ownerSessionId || sessionIdRef.current || '').trim();
      const isActive = ownerId === sessionIdRef.current;
      if (isActive) {
        setGeneratingPlan(false);
      } else {
        const prev = planSnapBySessionRef.current.get(ownerId);
        if (prev) planSnapBySessionRef.current.set(ownerId, { ...prev, generatingPlan: false });
      }
      updateSessionMessages(ownerId, (prev) =>
        prev.map((m) => {
          if (
            m.role !== 'assistant' ||
            (!m.steps?.some((s) => s.id === PLAN_GENERATE_STEP_ID) &&
              !m.workItems?.some((e) => e.id === PLAN_GENERATE_STEP_ID))
          ) return m;
          const steps = (m.steps || []).map((s) =>
            s.id === PLAN_GENERATE_STEP_ID
              ? { ...s, itemStatus: (ok ? 'done' : 'error') as 'done' | 'error', label: ok ? 'Created plan' : 'Failed to create plan' }
              : s
          );
          return {
            ...m,
            status: m.status === 'streaming' ? 'complete' : m.status,
            steps,
            workItems: upsertWorkEvents(m.workItems, planGenerateWorkEvent(ok ? 'complete' : 'error'))
          };
        })
      );
    },
    [updateSessionMessages, sessionIdRef]
  );

  // ─── sealAskingSteps ───────────────────────────────────────

  /** ask_question 인-버블 행 즉시 완료 (blink 중지) */
  const sealAskingSteps = useCallback(() => {
    setMessagesRef.current((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (m.role !== 'assistant' || !m.steps?.length) return m;
        let local = false;
        const steps = m.steps.map((s) => {
          if (s.kind === 'asking' && s.itemStatus === 'running') {
            local = true; changed = true;
            return { ...s, itemStatus: 'done' as const };
          }
          return s;
        });
        return local ? { ...m, steps } : m;
      });
      return changed ? next : prev;
    });
  }, [setMessagesRef]);

  // ─── AskQuestionTool 콜백 (in-process path) ───────────────

  useEffect(() => {
    askQuestionTool.onNewQuestionCallback((q: PendingQuestion) => {
      setPendingQuestions((prev) => {
        if (prev.find((p) => p.id === q.id)) return prev;
        const normQ = String(q.question || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (prev.some((p) => String(p.question || '').replace(/\s+/g, ' ').trim().toLowerCase() === normQ)) return prev;
        planController.addQuestion({ id: q.id, question: q.question });
        return [...prev, q];
      });
      setShowClarifying(true);
      setAwaitingUser(true);
    });
    return () => { askQuestionTool.onNewQuestionCallback(() => {}); };
  }, [planController, setAwaitingUser]);

  // ─── handlePlanAnswer ────────────────────────────────────

  /** Stamp selection on timeline only — Confirm delivers to the agent. */
  const stampAskStep = useCallback(
    (
      id: string,
      answer: string,
      opts?: { done?: boolean; options?: string[] }
    ) => {
      const qMeta = pendingQuestionsRef.current.find((q) => q.id === id);
      const qText = String(qMeta?.question || '').trim();
      setMessagesRef.current((prev) => {
        let changed = false;
        const out = prev.map((m) => {
          if (m.role !== 'assistant' || !m.steps?.length) return m;
          let local = false;
          let stamped = false;
          const steps = m.steps.map((s) => {
            const isAsk =
              s.kind === 'asking' ||
              (s.toolName || '').toLowerCase() === 'ask_question';
            if (!isAsk) return s;
            if (s.askQid && s.askQid !== id && s.answer && opts?.done) return s;
            const byQid = s.askQid === id;
            const byPrompt =
              !s.askQid &&
              qText &&
              String(s.detail || '').trim() === qText;
            const fallback =
              !stamped && !s.askQid && s.itemStatus === 'running';
            if (!byQid && !byPrompt && !fallback) return s;
            stamped = true;
            local = true;
            changed = true;
            return {
              ...s,
              askQid: s.askQid || id,
              answer,
              itemStatus: opts?.done ? ('done' as const) : s.itemStatus,
              options:
                s.options?.length
                  ? s.options
                  : opts?.options?.length
                    ? opts.options
                    : qMeta?.options?.map(String),
            };
          });
          return local ? { ...m, steps } : m;
        });
        return changed ? out : prev;
      });
    },
    [setMessagesRef]
  );

  const deliverAskToAgent = useCallback(
    (qid: string, answer: string, question: string) => {
      try {
        getVsCodeApi()?.postMessage?.({
          type: 'chat.answer',
          qid,
          answer,
          question,
        });
      } catch {
        /* ignore */
      }
      askQuestionTool.answerQuestion(qid, answer);
    },
    []
  );

  const handlePlanAnswer = useCallback(
    (id: string, answer: string) => {
      const next = pendingQuestionsRef.current.map((q) =>
        q.id === id ? { ...q, answer, answered: false } : q
      );
      pendingQuestionsRef.current = next;
      setPendingQuestions(next);
      planController.answerQuestion(id, answer);
      // Comment: selection only — keep card live until Confirm / Skip
      stampAskStep(id, answer, { done: false });
    },
    [planController, stampAskStep]
  );

  const handleAskCardConfirm = useCallback(
    (p: AskCardConfirmPayload) => {
      let next = pendingQuestionsRef.current;
      for (const a of p.answers) {
        next = next.map((q) =>
          q.id === a.qid ? { ...q, answer: a.answer, answered: true } : q
        );
        planController.answerQuestion(a.qid, a.answer);
        stampAskStep(a.qid, a.answer, { done: true });
        deliverAskToAgent(a.qid, a.answer, a.question);

        if (mode === 'debug' && debugControllerRef.current?.getStage() === 'hypothesis') {
          const match =
            debugControllerRef.current.getHypotheses().find((h) => h.title === a.answer) ||
            debugControllerRef.current
              .getHypotheses()
              .find((h) => a.answer.includes(h.title));
          if (match) {
            try {
              debugControllerRef.current.selectHypothesis(match.id);
              setDebugTick((t) => t + 1);
            } catch {
              /* ignore */
            }
          }
        }
      }
      pendingQuestionsRef.current = next;
      setPendingQuestions(next);

      const remaining = next.filter(
        (q) => q.required !== false && !q.answered
      ).length;
      if (remaining > 0) return;

      sealAskingSteps();
      setShowClarifying(false);
      setAwaitingUser(false);
      setPendingQuestions([]);
    },
    [
      planController,
      stampAskStep,
      deliverAskToAgent,
      mode,
      debugControllerRef,
      setDebugTick,
      sealAskingSteps,
      setAwaitingUser,
    ]
  );

  const handleAskCardSkip = useCallback(
    (p: AskCardSkipPayload) => {
      const skipLabel =
        p.reason === 'timeout' ? '(skipped — no response)' : '(skipped)';
      let next = pendingQuestionsRef.current;
      for (const item of p.items) {
        next = next.map((q) =>
          q.id === item.qid
            ? { ...q, answer: skipLabel, answered: true }
            : q
        );
        stampAskStep(item.qid, skipLabel, { done: true });
        // Comment: resolve as skipped so AgentLoop continues (do not reject tool)
        deliverAskToAgent(item.qid, skipLabel, item.question);
      }
      pendingQuestionsRef.current = next;
      setPendingQuestions(next);

      const remaining = next.filter(
        (q) => q.required !== false && !q.answered
      ).length;
      if (remaining > 0) return;
      sealAskingSteps();
      setShowClarifying(false);
      setAwaitingUser(false);
      setPendingQuestions([]);
    },
    [
      stampAskStep,
      deliverAskToAgent,
      sealAskingSteps,
      setAwaitingUser,
    ]
  );

  // Comment: AskQuestionCard bridge — select / Confirm / Skip
  useEffect(() => {
    setAskQuestionCardHandlers({
      onSelect: (p: AskCardSelectPayload) => {
        handlePlanAnswer(p.qid, p.answer);
      },
      onConfirm: handleAskCardConfirm,
      onSkip: handleAskCardSkip,
    });
    return () => setAskQuestionCardHandlers({});
  }, [handlePlanAnswer, handleAskCardConfirm, handleAskCardSkip]);

  // ─── handleQuestionsComplete ──────────────────────────────

  const handleQuestionsComplete = useCallback(() => {
    if (mode !== 'plan') {
      // Comment: deliver any remaining answers then close (dock Complete path)
      for (const q of pendingQuestionsRef.current) {
        const answer = (q.answer || '').trim();
        if (!answer || !q.answered) continue;
        deliverAskToAgent(q.id, answer, q.question);
      }
      sealAskingSteps();
      setShowClarifying(false);
      setAwaitingUser(false);
      return;
    }
    const sessionPhase = planAdapter.session.getPhase();
    if (sessionPhase === 'executing' && planStageRef.current === 'build') {
      try {
        const api = getVsCodeApi();
        for (const q of pendingQuestionsRef.current) {
          const answer = (q.answer || '').trim();
          if (!answer) continue;
          api?.postMessage?.({
            type: 'chat.answer',
            qid: q.id,
            answer,
            question: q.question,
          });
        }
      } catch { /* ignore */ }
      sealAskingSteps();
      setShowClarifying(false);
      setAwaitingUser(false);
      setPendingQuestions([]);
      return;
    }
    if (questionsCompleteInFlightRef.current) return;
    questionsCompleteInFlightRef.current = true;

    if (streamingRef.current) {
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current.bump(sessionIdRef.current);
      const kept = finalizeStreamingMessages(messagesRef.current);
      messagesRef.current = kept;
      setMessagesRef.current(kept);
    }
    // Comment: Prefer answers over cancel so host waiters resume with Q/A
    try {
      const api = getVsCodeApi();
      for (const q of pendingQuestionsRef.current) {
        const answer = (q.answer || '').trim() || '(skipped)';
        api?.postMessage?.({
          type: 'chat.answer',
          qid: q.id,
          answer,
          question: q.question,
        });
        askQuestionTool.answerQuestion(q.id, answer);
      }
    } catch { /* ignore */ }

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
        await planAdapter.completeResearch([
          buildPlanResearchContext(planController),
          research ? `Research notes:\n${research.slice(0, 6000)}` : '',
          'Clarifying answers:',
          qa || '(none)'
        ].filter(Boolean).join('\n\n'));

        const state = planAdapter.session.getState();
        const result = await requestPlanGenerate({
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
        await commitPlanResult(result, sessionIdRef.current);
      })
      .catch((e) => {
        endPlanGenerationUi(false);
        setError(e instanceof Error ? e.message : 'Failed to generate a structured Plan.');
      })
      .finally(() => { questionsCompleteInFlightRef.current = false; });
  }, [
    planController, mode, streamingRef, messagesRef, setMessagesRef, sealAskingSteps,
    planAdapter, requestPlanGenerate, commitPlanResult, beginPlanGenerationUi,
    endPlanGenerationUi, sessionIdRef, stopHandlerRef, sendEpochRef, setAwaitingUser, setError,
    deliverAskToAgent,
  ]);

  const handleQuestionsCancel = useCallback(() => {
    try {
      const api = getVsCodeApi();
      for (const q of pendingQuestionsRef.current) {
        api?.postMessage?.({ type: 'chat.question.cancel', qid: q.id });
      }
    } catch { /* ignore */ }
    askQuestionTool.clear(pendingQuestionsRef.current.map((q) => q.id));
    setShowClarifying(false);
    setPendingQuestions([]);
    setAwaitingUser(false);
  }, [setAwaitingUser]);

  // ─── Plan 문서 편집 / 열기 ────────────────────────────────

  const handlePlanEdit = useCallback((content: string) => {
    const existing = planController.getState().planDocument;
    if (!existing) return;
    void planController.setPlanDocument({ ...existing, content });
    try {
      getVsCodeApi()?.postMessage?.({
        type: 'plan.save',
        title: existing.title,
        content,
        quiet: true,
        slug: existing.slug && /^plan_[a-f0-9]+$/i.test(existing.slug) ? existing.slug : undefined
      });
    } catch { /* ignore */ }
  }, [planController]);

  const handleOpenPlanInEditor = useCallback((content: string) => {
    const existing = planController.getState().planDocument;
    if (!existing) return;
    try {
      getVsCodeApi()?.postMessage?.({
        type: 'plan.save',
        title: existing.title,
        content,
        slug: existing.slug && /^plan_[a-f0-9]+$/i.test(existing.slug) ? existing.slug : undefined,
        openInEditor: true,
        quiet: true
      });
    } catch {
      setError('Could not open the Plan from the editor.');
    }
  }, [planController, setError]);

  // Review 열린 상태에서 가시성 변경 → plan 파일 재로드
  useEffect(() => {
    if (!showPlanReview || mode !== 'plan') return;
    const slug = planController.getState().planDocument?.slug;
    if (!slug || !/^plan_[a-f0-9]+$/i.test(slug)) return;
    const reload = () => {
      try { getVsCodeApi()?.postMessage?.({ type: 'plan.load', slug }); } catch { /* ignore */ }
    };
    reload();
    const onVis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', reload);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', reload);
    };
  }, [showPlanReview, mode, planController]);

  // ─── Plan Approve / Reject / Review ──────────────────────

  const handlePlanApprove = useCallback((taskIds?: string[]) => {
    void (async () => {
      try {
        const researchContext =
          planAdapter.session.getState().researchFindings ||
          buildPlanResearchContext(planController);
        const goalFallback =
          planAdapter.session.getState().goal ||
          textFromPlanController(planController) || 'Plan';

        await planAdapter.ensureStructuredPlan({
          goalFallback,
          researchContext,
          generate: () => requestPlanGenerate({
            goal: goalFallback,
            researchContext,
            rejectionFeedback: planAdapter.session.getState().rejectionFeedback.slice(-1)[0]
          })
        });
        await planAdapter.approve(taskIds);
        await planController.advanceToBuild();
        setShowPlanReview(false);
        setPlanStage('build');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to approve the Plan.');
      }
    })();
  }, [planController, planAdapter, requestPlanGenerate, setError]);

  const handlePlanReject = useCallback((reason?: string) => {
    setShowPlanReview(false);
    promotePlanOnCompleteRef.current = false;
    void (async () => {
      await planAdapter.reject(reason || 'Please refine the plan so it is clearer.');
      setPlanStage('planning');
      beginPlanGenerationUi();
      const state = planAdapter.session.getState();
      const result = await requestPlanGenerate({
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
      await planAdapter.acceptGeneratedPlan(result.plan, {
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
  }, [planController, planAdapter, requestPlanGenerate, beginPlanGenerationUi, endPlanGenerationUi, setError]);

  const handlePlanReviewClose = useCallback(() => {
    setShowPlanReview(false);
  }, []);

  /** PLAN-CARD-004 — merge host plan.card.patch into session + chrome. */
  const applyCardPatch = useCallback(
    (data: {
      planId?: string;
      phase?: string;
      taskStatuses?: Array<{ taskId: string; status: string }>;
      statusText?: string;
      document?: import('@agent-k/plan').PlanDocument;
    }) => {
      if (typeof data.statusText === 'string') setCardStatusText(data.statusText);
      const adapter = planAdapter;
      if (data.taskStatuses?.length) {
        for (const row of data.taskStatuses) {
          try {
            const from =
              adapter.session.getState().taskStatus[row.taskId] ?? 'pending';
            adapter.session.recordEvent({
              type: 'task.status.changed',
              taskId: row.taskId,
              from: from as never,
              to: row.status as never,
              timestamp: Date.now(),
            });
          } catch {
            /* phase guard may reject — ignore */
          }
        }
      }
      // Comment: nudge React — adapters are mutable SoT
      setPlanCardTick((n) => n + 1);
    },
    [planAdapter],
  );

  const handleOpenReview = useCallback(() => {
    if (planStage === 'review') {
      const doc = planController.getState().planDocument?.content?.trim();
      if (doc) { setShowPlanReview(true); return; }
    }
    const md = findLatestPlanMarkdown(messagesRef.current);
    if (md) promotePlanToReview(md);
  }, [planStage, planController, messagesRef, promotePlanToReview]);

  const handleDiscardPlan = useCallback(() => {
    const discarded =
      planController.getState().planDocument?.content?.trim() ||
      findLatestPlanMarkdown(messagesRef.current);
    planAdapter.discard();
    lastPromotedPlanRef.current = discarded || 'discarded';
    promotePlanOnCompleteRef.current = false;
    setShowPlanReview(false);
    setShowClarifying(false);
    setPendingQuestions([]);
    setAwaitingUser(false);
    setPlanStage('research');
    parkPlanForSession(sessionIdRef.current);
  }, [planController, planAdapter, messagesRef, parkPlanForSession, sessionIdRef, setAwaitingUser]);

  // PLAN-CARD-005 — markdown planPromote heuristics retired; structured PlanCard only.
  // Legacy looksLikePlanDocument auto-open kept behind explicit reopen (onOpenReview).
  useEffect(() => {
    /* no-op: do not auto-promote chat markdown into review */
  }, []);

  return {
    planStage, setPlanStage,
    planStageRef,
    showClarifying, setShowClarifying,
    showPlanReview, setShowPlanReview,
    cardStatusText, setCardStatusText, applyCardPatch, planCardTick,
    pendingQuestions, setPendingQuestions,
    pendingQuestionsRef,
    generatingPlan, setGeneratingPlan,
    generatingPlanRef,
    planAdapter, planController,
    syncBoundSessionId,
    planGenerateActiveRequestRef,
    planFileExistsResolversRef,
    planGenerateResolversRef,
    planGenerateTimedOutRef,
    planSnapBySessionRef,
    planAdaptersRef,
    planTick,
    tasksAwaitingVerification,
    activeExecutionPlan,
    showPlanExecutionBar,
    handleVerifyTaskManually,
    parkPlanForSession,
    restorePlanForSession,
    resetPlanChrome,
    hasPlanSnap,
    onDeletePlanSnap,
    ensurePlanAdapter,
    getPlanAdapterForSession,
    applyPlanStageUi,
    promotePlanOnCompleteRef,
    promotePlanToReview,
    commitPlanResult,
    requestPlanGenerate,
    requestWorkspaceFileExists,
    beginPlanGenerationUi,
    endPlanGenerationUi,
    sealAskingSteps,
    handlePlanAnswer,
    handleQuestionsComplete,
    handleQuestionsCancel,
    handlePlanEdit,
    handleOpenPlanInEditor,
    handlePlanApprove,
    handlePlanReject,
    handlePlanReviewClose,
    handleOpenReview,
    handleDiscardPlan
  };
}
