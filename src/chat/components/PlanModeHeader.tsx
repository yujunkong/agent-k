/**
 * PlanModeHeader — Review 재오픈/폐기 액션만 (스테이지 배지는 백그라운드 진행)
 */
import React, { useEffect, useState } from 'react';
import type { PlanStage } from '../../plan/PlanModeController';

interface PlanModeHeaderProps {
  currentStage: PlanStage;
  stages: PlanStage[];
  /** Open / re-open the Review overlay */
  onOpenReview?: () => void;
  canOpenReview?: boolean;
  /** Review overlay currently visible */
  reviewOpen?: boolean;
  /** Discard plan and leave Review */
  onDiscardPlan?: () => void;
}

export function PlanModeHeader({
  currentStage,
  stages: _stages,
  onOpenReview,
  canOpenReview,
  reviewOpen,
  onDiscardPlan
}: PlanModeHeaderProps) {
  void _stages;
  const inReview = currentStage === 'review';
  const [armDiscard, setArmDiscard] = useState(false);

  useEffect(() => {
    setArmDiscard(false);
  }, [currentStage, reviewOpen]);

  const showOpenReview =
    Boolean(onOpenReview) &&
    ((canOpenReview && currentStage === 'planning') ||
      (inReview && !reviewOpen));
  // Discard must stay available while Review overlay is open (webview has no window.confirm)
  const showDiscard = Boolean(inReview && onDiscardPlan);
  const showActions = showOpenReview || showDiscard;
  const showHint = inReview && !reviewOpen;

  if (!showActions && !showHint) {
    return null;
  }

  const handleDiscardClick = () => {
    if (!onDiscardPlan) return;
    if (!armDiscard) {
      setArmDiscard(true);
      return;
    }
    setArmDiscard(false);
    onDiscardPlan();
  };

  return (
    <div className="plan-mode-header" role="status">
      {showActions ? (
        <div className="plan-mode-header__row">
          <div className="plan-mode-header__actions">
            {showOpenReview ? (
              <button
                type="button"
                className="settings-btn primary"
                onClick={onOpenReview}
                title={
                  inReview
                    ? 'Reopen Review to approve or revise'
                    : 'Open the PLAN from chat in Review'
                }
              >
                {inReview ? 'Reopen Review' : 'Open Review'}
              </button>
            ) : null}
            {showDiscard ? (
              <button
                type="button"
                className={
                  armDiscard
                    ? 'settings-btn plan-mode-header__discard plan-mode-header__discard--armed'
                    : 'settings-btn plan-mode-header__discard'
                }
                onClick={handleDiscardClick}
                onBlur={() => setArmDiscard(false)}
                title={
                  armDiscard
                    ? 'Click again to return to Research (plan_*.md is kept)'
                    : 'Discard the current plan and return to Research'
                }
              >
                {armDiscard ? 'Discard for real?' : 'Discard plan'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showHint ? (
        <div className="plan-mode-header__hint" role="status">
          Review is closed. Use <strong>Reopen Review</strong> to approve or reject, or{' '}
          <strong>Discard plan</strong> to start over. Build runs only after you{' '}
          <strong>Approve</strong> in Review.
        </div>
      ) : null}
    </div>
  );
}
