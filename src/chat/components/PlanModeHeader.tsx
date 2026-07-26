/**
 * PlanModeHeader - Plan 모드 진행 표시 + Review 재오픈/폐기
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
  /** Discard plan and leave Review */
  onDiscardPlan?: () => void;
}

const STAGE_META: Record<
  PlanStage,
  { icon: string; label: string; tooltip: string }
> = {
  research: {
    icon: '🔍',
    label: 'Research',
    tooltip: '코드베이스를 읽기 전용으로 탐색하고 현황을 파악합니다.'
  },
  questions: {
    icon: '❓',
    label: 'Questions',
    tooltip: '모호한 요구사항을 확인하는 질문 단계입니다.'
  },
  planning: {
    icon: '📋',
    label: 'Plan',
    tooltip: 'PLAN.md · Mermaid · TODO를 작성합니다. 구현은 하지 않습니다.'
  },
  review: {
    icon: '👀',
    label: 'Review',
    tooltip: '계획을 검토·수정하고 승인합니다. Build는 여기서만 시작합니다.'
  },
  build: {
    icon: '🚀',
    label: 'Build',
    tooltip: 'Review에서 Approve & Execute 후에만 진행됩니다.'
  }
};

const STAGE_ORDER: PlanStage[] = [
  'research',
  'questions',
  'planning',
  'review',
  'build'
];

export function PlanModeHeader({
  currentStage,
  stages: _stages,
  onOpenReview,
  canOpenReview,
  reviewOpen,
  onDiscardPlan
}: PlanModeHeaderProps) {
  void _stages;
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const inReview = currentStage === 'review';
  const showReviewActions =
    Boolean(onOpenReview) &&
    ((canOpenReview && currentStage === 'planning') ||
      (inReview && !reviewOpen));

  return (
    <div className="plan-mode-header" role="status">
      <div className="plan-mode-header__row">
        <span className="plan-mode-header__badge">PLAN</span>

        <div className="plan-stage-row" aria-label="Plan stages">
          {STAGE_ORDER.map((stage, i) => {
            const meta = STAGE_META[stage];
            const isActive = stage === currentStage;
            const isCompleted = STAGE_ORDER.indexOf(stage) < currentIdx;
            const isBuildLocked = stage === 'build' && currentStage === 'review';

            return (
              <div
                key={stage}
                className={[
                  'plan-stage-badge',
                  isActive ? 'plan-stage-badge--active' : '',
                  isCompleted ? 'plan-stage-badge--done' : '',
                  isBuildLocked ? 'plan-stage-badge--locked' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={
                  isBuildLocked
                    ? 'Review에서 Approve & Execute를 눌러야 Build로 갑니다'
                    : meta.tooltip
                }
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="plan-stage-badge__icon" aria-hidden>
                  {isCompleted && !isActive ? '✓' : meta.icon}
                </span>
                <span className="plan-stage-badge__label">
                  {i + 1}. {meta.label}
                  {isBuildLocked ? ' (대기)' : ''}
                </span>
              </div>
            );
          })}
        </div>

        {showReviewActions ? (
          <div className="plan-mode-header__actions">
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
            {inReview && onDiscardPlan ? (
              <button
                type="button"
                className="settings-btn plan-mode-header__discard"
                onClick={onDiscardPlan}
                title="현재 계획을 폐기하고 Research로 돌아갑니다"
              >
                계획 폐기
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {inReview && !reviewOpen ? (
        <div className="plan-mode-header__hint" role="status">
          Review 창을 닫은 상태입니다. <strong>Review 다시 열기</strong>로 승인·수정하거나,{' '}
          <strong>계획 폐기</strong>로 처음부터 다시 시작할 수 있습니다. Build는 Review에서
          Approve &amp; Execute 할 때만 진행됩니다.
        </div>
      ) : null}
    </div>
  );
}
