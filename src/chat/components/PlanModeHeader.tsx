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
                    ? 'Review 창을 다시 열어 승인하거나 수정합니다'
                    : '채팅에 작성된 PLAN을 Review로 엽니다'
                }
              >
                {inReview ? 'Review 다시 열기' : 'Review 열기'}
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
                    ? '다시 누르면 Research로 돌아갑니다 (plan_*.md 파일은 유지)'
                    : '현재 계획을 폐기하고 Research로 돌아갑니다'
                }
              >
                {armDiscard ? '정말 폐기?' : '계획 폐기'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showHint ? (
        <div className="plan-mode-header__hint" role="status">
          Review 창을 닫은 상태입니다. <strong>Review 다시 열기</strong>로 승인·반려하거나,{' '}
          <strong>계획 폐기</strong>로 처음부터 다시 시작할 수 있습니다. Build는 Review에서
          <strong> 승인</strong>할 때만 진행됩니다.
        </div>
      ) : null}
    </div>
  );
}
