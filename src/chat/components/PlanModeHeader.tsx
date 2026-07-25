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

const STAGE_LABELS: Record<PlanStage, string> = {
  research: '🔍 Research',
  questions: '❓ Questions',
  planning: '📋 Plan',
  review: '👀 Review',
  build: '🚀 Build'
};

const STAGE_ORDER: PlanStage[] = ['research', 'questions', 'planning', 'review', 'build'];

export function PlanModeHeader({ currentStage, stages, onStageClick }: PlanModeHeaderProps) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <div className="plan-mode-header" style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 12px',
      background: 'linear-gradient(135deg, rgba(250,204,21,0.08), rgba(250,204,21,0.02))',
      borderBottom: '1px solid rgba(250,204,21,0.2)',
      fontSize: '0.85em'
    }}>
      <span style={{
        padding: '2px 8px', borderRadius: 4,
        background: 'rgba(250,204,21,0.2)', color: '#facc15',
        fontWeight: 600, fontSize: '0.8em'
      }}>
        PLAN
      </span>

      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        {STAGE_ORDER.map((stage, i) => {
          const isActive = stage === currentStage;
          const isCompleted = STAGE_ORDER.indexOf(stage) < currentIdx;
          const isAvailable = stages.includes(stage);

          if (!isAvailable && !isCompleted && !isActive) return null;

          return (
            <button
              key={stage}
              onClick={() => onStageClick?.(stage)}
              disabled={!isAvailable && !isCompleted}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 4,
                border: 'none',
                background: isActive ? 'rgba(250,204,21,0.2)' : isCompleted ? 'rgba(74,222,128,0.1)' : 'transparent',
                color: isActive ? '#facc15' : isCompleted ? '#4ade80' : 'var(--vscode-foreground, #ccc)',
                fontWeight: isActive ? 600 : 400,
                cursor: isAvailable || isCompleted ? 'pointer' : 'default',
                fontSize: '0.8em',
                opacity: (!isAvailable && !isCompleted) ? 0.3 : 1
              }}
            >
              {isCompleted ? '✓' : (i + 1)}. {STAGE_LABELS[stage]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
