/**
 * PlanModeHeader — plan ready: View Plans / Reject / Confirm only
 */
import React from 'react';
import type { PlanStage } from '../../plan/PlanModeController';

interface PlanModeHeaderProps {
  currentStage: PlanStage;
  stages: PlanStage[];
  /** Open / re-open the Review overlay */
  onOpenReview?: () => void;
  canOpenReview?: boolean;
  /** Review overlay currently visible */
  reviewOpen?: boolean;
  /** Reject / discard plan and return to Research */
  onDiscardPlan?: () => void;
  /** Confirm & execute */
  onApprove?: () => void;
  /** @deprecated unused — Reject maps to onDiscardPlan */
  onReject?: () => void;
  canApprove?: boolean;
}

export function PlanModeHeader({
  currentStage,
  stages: _stages,
  onOpenReview,
  canOpenReview,
  reviewOpen,
  onDiscardPlan,
  onApprove,
  canApprove
}: PlanModeHeaderProps) {
  void _stages;
  // Any pre-build stage: if a plan exists, always offer the three actions
  const planReady = Boolean(canOpenReview) && currentStage !== 'build';

  // Plan document ready + overlay closed → View Plans / Reject / Confirm
  const showChrome = planReady && !reviewOpen && Boolean(onOpenReview);
  if (!showChrome) {
    return null;
  }

  return (
    <div className="plan-mode-header" role="status">
      <div className="plan-mode-header__row">
        <div className="plan-mode-header__actions">
          <button
            type="button"
            className="settings-btn"
            onClick={onOpenReview}
            title="저장된 PLAN을 Review로 엽니다"
          >
            View Plans
          </button>
          {onDiscardPlan ? (
            <button
              type="button"
              className="settings-btn"
              onClick={() => onDiscardPlan()}
              title="계획을 폐기하고 Research로 돌아갑니다"
            >
              Reject
            </button>
          ) : null}
          {onApprove ? (
            <button
              type="button"
              className="settings-btn primary"
              onClick={onApprove}
              disabled={canApprove === false}
              title={
                canApprove === false
                  ? '질문에 모두 답한 뒤 승인할 수 있습니다'
                  : '계획을 승인하고 실행을 시작합니다'
              }
            >
              Confirm
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
