/**
 * DebugModeUI - Debug 모드 배지 + 가설 선택 모달 + 재현 가이드 패널 (C6-T22)
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

const STAGE_LABELS: Record<string, string> = {
  hypothesis: '🔍 Hypothesis Generation',
  instrument: '🔧 Instrumentation',
  reproduce: '🔄 Reproduce',
  analyze: '📊 Analysis',
  fix: '🔨 Fix',
  cleanup: '🧹 Cleanup'
};

export function DebugModeUI({
  currentStage,
  hypotheses,
  activeHypothesisId,
  onSelectHypothesis,
  onConfirmFix,
}: DebugModeUIProps) {
  return (
    <div className="debug-mode-ui" style={{
      padding: 12, borderRadius: 6,
      background: 'var(--vscode-editor-background, #1e1e1e)',
      border: '1px solid var(--vscode-panel-border, #333)'
    }}>
      {/* Debug badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        padding: '4px 12px', borderRadius: 4,
        background: 'rgba(139,92,246,0.2)',
        fontSize: '0.85em'
      }}>
        <span style={{ fontWeight: 600 }}>🐛 DEBUG</span>
        <span style={{ opacity: 0.6 }}>|</span>
        <span>{STAGE_LABELS[currentStage] || currentStage}</span>
      </div>

      {/* Hypothesis selection */}
      {currentStage === 'hypothesis' && hypotheses.length > 0 && (
        <div>
          <label style={{ fontSize: '0.8em', fontWeight: 600, marginBottom: 8, display: 'block' }}>
            Select Hypothesis to Investigate
          </label>
          {hypotheses.map(h => (
            <button
              key={h.id}
              type="button"
              onClick={() => onSelectHypothesis(h.id)}
              disabled={!!activeHypothesisId}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px', marginBottom: 4, borderRadius: 4,
                background: h.id === activeHypothesisId ? 'rgba(59,130,246,0.2)' : 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.03))',
                border: `1px solid ${h.id === activeHypothesisId ? 'rgba(59,130,246,0.4)' : 'transparent'}`,
                cursor: activeHypothesisId ? 'default' : 'pointer',
                fontSize: '0.85em'
              }}
            >
              <div style={{ fontWeight: 500 }}>{h.title}</div>
              <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: 2 }}>{h.description}</div>
            </button>
          ))}
        </div>
      )}

      {/* Active hypothesis status */}
      {activeHypothesisId && (
        <div style={{
          padding: '6px 10px', borderRadius: 4, marginTop: 8,
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
          fontSize: '0.85em'
        }}>
          Investigating: <strong>{hypotheses.find(h => h.id === activeHypothesisId)?.title}</strong>
        </div>
      )}

      {/* Analyze → Fix gate (Plan Approve equivalent) */}
      {currentStage === 'analyze' && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: '0.85em', opacity: 0.75, marginBottom: 8 }}>
            Root cause confirmed? Fix starts only when you approve.
          </p>
          <button
            type="button"
            className="settings-btn primary"
            onClick={() => onConfirmFix?.()}
            style={{
              padding: '8px 16px',
              fontWeight: 600,
              background: 'var(--vscode-button-background, #0078d4)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Confirm &amp; Fix
          </button>
        </div>
      )}
    </div>
  );
}
