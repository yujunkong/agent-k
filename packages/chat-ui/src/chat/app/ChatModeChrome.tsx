/**
 * ChatModeChrome — 모드별 크롬 패널 (메시지 리스트 위 영역)
 *
 * 렌더링:
 *   - PlanModeHeader (plan 모드만)
 *   - PlanExecutionStatus (실행 바)
 *   - DebugModeUI (debug 모드만)
 *   - ReproduceUI (debug 재현 오버레이)
 *   - PlanReview 오버레이 (plan + showPlanReview)
 */
import React from 'react';
import { PlanModeHeader } from '../components/PlanModeHeader';
import { PlanExecutionStatus } from '../components/PlanExecutionStatus';
import { DebugModeUI } from '../components/DebugModeUI';
import { PlanReview } from '../../plan/PlanReview';
import { ReproduceUI } from '../../debug/ReproduceUI';
import { looksLikePlanDocument, findLatestPlanMarkdown } from '../planPromote';
import type { PlanStage } from '../../plan/PlanModeController';
import type { PlanModeController } from '../../plan/PlanModeController';
import type { PlanModeControllerAdapter } from '../../plan/session';
import type { ExecutionPlan } from '../../plan/execution';
import type { DebugModeController } from '../../debug/DebugModeController';
import type { ChatMessage, Mode } from '../types';

export interface ChatModeChromeProps {
  mode: Mode;
  // Plan chrome
  planStage: PlanStage;
  planController: PlanModeController;
  planAdapter: PlanModeControllerAdapter;
  showPlanReview: boolean;
  showPlanExecutionBar: boolean;
  activeExecutionPlan: ExecutionPlan | null;
  tasksAwaitingVerification: { id: string; title: string }[];
  messages: ChatMessage[];
  onOpenReview: () => void;
  onDiscardPlan: () => void;
  onPlanApprove: (_content: string) => void;
  onPlanReject: (reason?: string) => void;
  onPlanEdit: (content: string) => void;
  onOpenPlanInEditor: ((content: string) => void) | undefined;
  onPlanReviewClose: () => void;
  onVerifyTask: (taskId: string) => void;
  // Debug chrome
  debugController: DebugModeController;
  onSelectHypothesis: (id: string) => void;
  onConfirmFix: () => void;
  // Reproduce overlay
  showReproduce: boolean;
  reproduceHypothesisId: string;
  reproduceSteps: { order: number; description: string }[];
  onReproduced: () => void;
  onReproduceCancel: () => void;
}

export function ChatModeChrome(props: ChatModeChromeProps) {
  const {
    mode,
    planStage, planController, planAdapter,
    showPlanReview, showPlanExecutionBar, activeExecutionPlan,
    tasksAwaitingVerification, messages,
    onOpenReview, onDiscardPlan,
    onPlanApprove, onPlanReject, onPlanEdit, onOpenPlanInEditor,
    onPlanReviewClose, onVerifyTask,
    debugController,
    onSelectHypothesis, onConfirmFix,
    showReproduce, reproduceHypothesisId, reproduceSteps,
    onReproduced, onReproduceCancel
  } = props;

  return (
    <>
      {/* Plan 모드 헤더 — 스테이지 네비게이션 */}
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
          onOpenReview={onOpenReview}
          onDiscardPlan={onDiscardPlan}
        />
      )}

      {/* Plan 실행 상태 바 */}
      {showPlanExecutionBar && activeExecutionPlan ? (
        <PlanExecutionStatus plan={activeExecutionPlan} />
      ) : null}

      {/* Debug 모드 패널 */}
      {mode === 'debug' && (
        <DebugModeUI
          currentStage={debugController.getStage()}
          hypotheses={debugController.getHypotheses()}
          activeHypothesisId={debugController.getState().activeHypothesisId}
          onSelectHypothesis={onSelectHypothesis}
          onConfirmFix={onConfirmFix}
        />
      )}

      {/* ReproduceUI 오버레이 (RW-C6-05-R2) */}
      {showReproduce && (
        <div className="mode-chrome">
          <ReproduceUI
            hypothesisId={reproduceHypothesisId}
            hypothesisTitle={reproduceHypothesisId}
            steps={reproduceSteps}
            onReproduced={onReproduced}
            onCancel={onReproduceCancel}
          />
        </div>
      )}

      {/* Plan Review 오버레이 — 탭 격리: 이 탭이 plan 모드일 때만 렌더 */}
      {mode === 'plan' &&
      showPlanReview &&
      planController.getState().planDocument?.content?.trim() ? (
        <div className="plan-editor-overlay" role="dialog" aria-label="Plan review">
          <PlanReview
            document={planController.getState().planDocument!}
            questionsAnswered={planController.areAllQuestionsAnswered()}
            onApprove={onPlanApprove}
            onReject={onPlanReject}
            onEdit={onPlanEdit}
            onOpenInEditor={planAdapter.session.getPlan() ? undefined : onOpenPlanInEditor}
            structuredSourceOfTruth={Boolean(planAdapter.session.getPlan())}
            tasksAwaitingVerification={tasksAwaitingVerification}
            onVerifyTask={onVerifyTask}
            onClose={onPlanReviewClose}
            onDiscard={onDiscardPlan}
          />
        </div>
      ) : null}
    </>
  );
}
