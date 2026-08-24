/**
 * ChatModeChrome — 모드별 크롬 패널 (메시지 리스트 위 영역)
 *
 * Plan: sticky PlanCard only (PLAN-CARD-*) — no Reopen/Discard header chrome.
 */
import React from 'react';
import { renderPlanMarkdown } from '@agent-k/plan';
import { PlanExecutionStatus } from '../components/PlanExecutionStatus';
import { DebugModeUI } from '../components/DebugModeUI';
import { PlanCard } from '../../plan/PlanCard';
import { ReproduceUI } from '../../debug/ReproduceUI';
import type { PlanStage } from '../../plan/PlanModeController';
import type { PlanModeController } from '../../plan/PlanModeController';
import type { PlanModeControllerAdapter } from '../../plan/session';
import type { ExecutionPlan } from '../../plan/execution';
import type { DebugModeController } from '../../debug/DebugModeController';
import type { ChatMessage, Mode } from '../types';

export interface ChatModeChromeProps {
  mode: Mode;
  planStage: PlanStage;
  planController: PlanModeController;
  planAdapter: PlanModeControllerAdapter;
  /** @deprecated overlay retired — kept for call-site compat */
  showPlanReview: boolean;
  showPlanExecutionBar: boolean;
  activeExecutionPlan: ExecutionPlan | null;
  tasksAwaitingVerification: { id: string; title: string }[];
  messages: ChatMessage[];
  /** @deprecated Reopen chrome removed — card stays visible */
  onOpenReview: () => void;
  onDiscardPlan: () => void;
  /** Build from card — optional partial taskIds. */
  onPlanApprove: (taskIds?: string[]) => void;
  onPlanReject: (reason?: string) => void;
  onPlanEdit: (content: string) => void;
  onOpenPlanInEditor: ((content: string) => void) | undefined;
  onPlanReviewClose: () => void;
  onVerifyTask: (taskId: string) => void;
  cardStatusText?: string;
  /** Remount/refresh PlanCard when session patches arrive. */
  planCardTick?: number;
  debugController: DebugModeController;
  onSelectHypothesis: (id: string) => void;
  onConfirmFix: () => void;
  showReproduce: boolean;
  reproduceHypothesisId: string;
  reproduceSteps: { order: number; description: string }[];
  onReproduced: () => void;
  onReproduceCancel: () => void;
}

export function ChatModeChrome(props: ChatModeChromeProps) {
  const {
    mode,
    planController, planAdapter,
    showPlanExecutionBar, activeExecutionPlan,
    tasksAwaitingVerification,
    onDiscardPlan,
    onPlanApprove, onPlanReject, onOpenPlanInEditor,
    onVerifyTask,
    cardStatusText,
    planCardTick = 0,
    debugController,
    onSelectHypothesis, onConfirmFix,
    showReproduce, reproduceHypothesisId, reproduceSteps,
    onReproduced, onReproduceCancel
  } = props;

  const structured = planAdapter.session.getPlan();
  const phase = planAdapter.session.getPhase();
  const taskStatus = planAdapter.session.getState().taskStatus;
  const researchFindings = planAdapter.session.getState().researchFindings || '';
  void planCardTick;

  // Comment: always show card when structured plan exists — no Reopen gate
  const showCard =
    mode === 'plan' &&
    Boolean(structured) &&
    (phase === 'review' ||
      phase === 'planning' ||
      phase === 'executing' ||
      phase === 'completed' ||
      phase === 'failed');

  return (
    <>
      {/* PLAN-CARD — Build / Reject / PlanView / Discard live here */}
      {showCard && structured ? (
        <PlanCard
          document={structured}
          phase={phase}
          taskStatus={taskStatus}
          researchContext={researchFindings}
          statusText={cardStatusText}
          questionsAnswered={planController.areAllQuestionsAnswered()}
          tasksAwaitingVerification={tasksAwaitingVerification}
          onBuild={(taskIds) => onPlanApprove(taskIds)}
          onReject={onPlanReject}
          onDiscard={onDiscardPlan}
          onVerifyTask={onVerifyTask}
          onOpenInEditor={
            onOpenPlanInEditor
              ? () => {
                  const md =
                    planAdapter.getFullPlanContext() ||
                    renderPlanMarkdown(structured, researchFindings, taskStatus);
                  if (md.trim()) onOpenPlanInEditor(md);
                }
              : undefined
          }
          buildDisabled={phase === 'executing' || phase === 'completed'}
        />
      ) : null}

      {showPlanExecutionBar && activeExecutionPlan && !showCard ? (
        <PlanExecutionStatus plan={activeExecutionPlan} />
      ) : null}

      {mode === 'debug' && (
        <DebugModeUI
          currentStage={debugController.getStage()}
          hypotheses={debugController.getHypotheses()}
          activeHypothesisId={debugController.getState().activeHypothesisId}
          onSelectHypothesis={onSelectHypothesis}
          onConfirmFix={onConfirmFix}
        />
      )}

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
    </>
  );
}
