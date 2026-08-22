/**
 * ReproduceUI - 단계별 가이드, 스크린샷, "완료" 버튼 (C6-T08)
 */
import React, { useState } from 'react';

interface ReproduceStep {
  order: number;
  description: string;
  screenshot?: string;
}

interface ReproduceUIProps {
  hypothesisId: string;
  hypothesisTitle: string;
  steps: ReproduceStep[];
  onReproduced: () => void;
  onCancel: () => void;
}

export function ReproduceUI({ hypothesisId, hypothesisTitle, steps, onReproduced, onCancel }: ReproduceUIProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  const handleStepComplete = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setCompleted(true);
    }
  };

  return (
    <div className="reproduce-ui" style={{
      padding: 16, borderRadius: 8,
      background: 'var(--vscode-editor-background, #1e1e1e)',
      border: '1px solid var(--vscode-panel-border, #333)',
      maxWidth: 500
    }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '1.1em' }}>
        🐛 Reproduce: {hypothesisTitle}
      </h3>
      <div style={{ fontSize: '0.8em', opacity: 0.6, marginBottom: 12 }}>
        Hypothesis: {hypothesisId}
      </div>

      {!completed ? (
        <>
          <div style={{ marginBottom: 8, fontSize: '0.8em', opacity: 0.5 }}>
            Step {currentStep + 1} of {steps.length}
          </div>
          <div style={{
            padding: 12, borderRadius: 6, marginBottom: 12,
            background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.03))',
            border: '1px solid rgba(59,130,246,0.3)'
          }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>
              {steps[currentStep].description}
            </div>
          </div>

          {steps[currentStep].screenshot && (
            <div style={{ marginBottom: 12 }}>
              <img src={steps[currentStep].screenshot} alt={`Step ${currentStep + 1}`}
                style={{ maxWidth: '100%', borderRadius: 4 }} />
            </div>
          )}

          {currentStep < steps.length - 1 ? (
            <button onClick={handleStepComplete} className="settings-btn primary"
              style={{ padding: '6px 16px', fontWeight: 600 }}>
              Next Step →
            </button>
          ) : (
            <button onClick={() => { setCompleted(true); }} className="settings-btn primary"
              style={{ padding: '6px 16px', fontWeight: 600, background: '#22c55e' }}>
              ✅ Reproduced
            </button>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: '2em', marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Reproduction Complete</div>
          <p style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 16 }}>
            All steps completed. The debugger will analyze the results.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={onCancel} className="settings-btn">Cancel</button>
            <button onClick={onReproduced} className="settings-btn primary"
              style={{ fontWeight: 600, background: '#3b82f6' }}>
              Continue Analysis →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
