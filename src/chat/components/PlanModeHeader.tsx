/**
 * PlanModeHeader - Plan 모드 헤더 배지 + 진행 단계 UI (C5-T19)
 */
import React from 'react';
import type { PlanStage } from '../../plan/PlanModeController';

interface PlanModeHeaderProps {
  currentStage: PlanStage;
  stages: PlanStage[];
  onStageClick?: (stage: PlanStage) => void;
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
    tooltip: '계획을 검토·수정하고 승인합니다.'
  },
  build: {
    icon: '🚀',
    label: 'Build',
    tooltip: '승인 후 Agent 모드로 전환해 구현을 시작합니다.'
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
  stages,
  onStageClick
}: PlanModeHeaderProps) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <div
      className="plan-mode-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background:
          'linear-gradient(135deg, rgba(250,204,21,0.08), rgba(250,204,21,0.02))',
        borderBottom: '1px solid rgba(250,204,21,0.2)',
        fontSize: 13
      }}
    >
      <span
        style={{
          padding: '3px 8px',
          borderRadius: 4,
          background: 'rgba(250,204,21,0.2)',
          color: '#facc15',
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: 0.4,
          flexShrink: 0
        }}
      >
        PLAN
      </span>

      <div
        className="plan-stage-row"
        style={{ display: 'flex', gap: 4, flex: 1, minWidth: 0, flexWrap: 'wrap' }}
      >
        {STAGE_ORDER.map((stage, i) => {
          const meta = STAGE_META[stage];
          const isActive = stage === currentStage;
          const isCompleted = STAGE_ORDER.indexOf(stage) < currentIdx;
          const isListed = stages.includes(stage);
          const clickable = Boolean(onStageClick) && (isListed || isCompleted || isActive);

          return (
            <button
              key={stage}
              type="button"
              className="plan-stage-btn"
              title={meta.tooltip}
              aria-label={`${meta.label}: ${meta.tooltip}`}
              aria-current={isActive ? 'step' : undefined}
              onClick={() => {
                if (clickable) onStageClick?.(stage);
              }}
              disabled={!clickable}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 6,
                border: isActive
                  ? '1px solid rgba(250,204,21,0.55)'
                  : '1px solid transparent',
                background: isActive
                  ? 'rgba(250,204,21,0.22)'
                  : isCompleted
                    ? 'rgba(74,222,128,0.12)'
                    : 'transparent',
                color: isActive
                  ? '#facc15'
                  : isCompleted
                    ? '#4ade80'
                    : 'var(--vscode-foreground, #ccc)',
                fontWeight: isActive ? 600 : 400,
                cursor: clickable ? 'pointer' : 'default',
                fontSize: 12,
                lineHeight: 1.2,
                opacity: !isListed && !isCompleted && !isActive ? 0.35 : 1
              }}
            >
              <span
                aria-hidden
                style={{
                  fontSize: 16,
                  lineHeight: 1,
                  width: 18,
                  textAlign: 'center',
                  flexShrink: 0
                }}
              >
                {isCompleted && !isActive ? '✓' : meta.icon}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>
                {i + 1}. {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
