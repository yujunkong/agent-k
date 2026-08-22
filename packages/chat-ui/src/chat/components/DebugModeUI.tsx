/**
 * DebugModeUI - 가설 선택 / Fix 승인만 (스테이지 배지는 백그라운드)
 */
import React from 'react';
import type { DebugStage, Hypothesis } from '../../debug/DebugModeController';

interface DebugModeUIProps {
  currentStage: DebugStage;
  hypotheses: Hypothesis[];
  activeHypothesisId: string | null;
  onSelectHypothesis: (id: string) => void;
  /** Analyze stage → user Approve equivalent before Fix */
  onConfirmFix?: () => void;
}

export function DebugModeUI({
  currentStage,
  hypotheses,
  activeHypothesisId,
  onSelectHypothesis,
  onConfirmFix,
}: DebugModeUIProps) {
  const showHypothesisPick =
    currentStage === 'hypothesis' && hypotheses.length > 0;
  const showActive = Boolean(activeHypothesisId);
  const showConfirmFix = currentStage === 'analyze';

  if (!showHypothesisPick && !showActive && !showConfirmFix) {
    return null;
  }

  return (
    <div className="debug-mode-ui">
      {showHypothesisPick ? (
        <div>
          <label className="debug-mode-ui__label">
            Select Hypothesis to Investigate
          </label>
          {hypotheses.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`debug-mode-ui__hypo${
                h.id === activeHypothesisId ? ' is-active' : ''
              }`}
              onClick={() => onSelectHypothesis(h.id)}
              disabled={!!activeHypothesisId}
            >
              <div className="debug-mode-ui__hypo-title">{h.title}</div>
              <div className="debug-mode-ui__hypo-desc">{h.description}</div>
            </button>
          ))}
        </div>
      ) : null}

      {showActive ? (
        <div className="debug-mode-ui__active">
          Investigating:{' '}
          <strong>
            {hypotheses.find((h) => h.id === activeHypothesisId)?.title}
          </strong>
        </div>
      ) : null}

      {showConfirmFix ? (
        <div className="debug-mode-ui__fix-gate">
          <p>Root cause confirmed? Fix starts only when you approve.</p>
          <button
            type="button"
            className="settings-btn primary"
            onClick={() => onConfirmFix?.()}
          >
            Confirm &amp; Fix
          </button>
        </div>
      ) : null}
    </div>
  );
}
