/**
 * FindingList — 리뷰 Finding 리스트 UI (C7-T12)
 */
import React, { useState } from 'react';
import type { ReviewFinding } from './AgentReviewLoop';

interface FindingListProps {
  findings: ReviewFinding[];
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onAcceptAll: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6'
};

export function FindingList({ findings, onAccept, onDismiss, onAcceptAll }: FindingListProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (findings.length === 0) {
    return (
      <div style={{
        padding: 16, textAlign: 'center', borderRadius: 6,
        background: 'rgba(34,197,94,0.05)',
        border: '1px solid rgba(34,197,94,0.2)',
        color: '#22c55e', fontSize: '0.9em'
      }}>
        ✅ No review findings. All good!
      </div>
    );
  }

  const visibleFindings = findings.filter(f => !dismissed.has(f.id));

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
    onDismiss(id);
  };

  return (
    <div className="finding-list" style={{ padding: 8 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8, fontWeight: 600, fontSize: '0.9em'
      }}>
        <span>🔍 Review Findings ({findings.length})</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setDismissed(new Set())}
            style={{
              padding: '4px 8px', borderRadius: 4, fontSize: '0.8em',
              background: 'transparent',
              border: '1px solid var(--vscode-panel-border, #555)',
              cursor: 'pointer'
            }}>
            Reset Dismissed
          </button>
          <button onClick={onAcceptAll}
            style={{
              padding: '4px 12px', borderRadius: 4, fontSize: '0.8em',
              background: 'var(--vscode-button-background, #0078d4)',
              color: 'var(--vscode-button-foreground, #fff)',
              border: 'none', cursor: 'pointer'
            }}>
            Accept All
          </button>
        </div>
      </div>

      {/* Finding items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visibleFindings.map(finding => (
          <div key={finding.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '8px 10px', borderRadius: 4,
            background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.03))',
            border: `1px solid ${SEVERITY_COLORS[finding.severity]}30`,
            borderLeft: `3px solid ${SEVERITY_COLORS[finding.severity]}`
          }}>
            {/* Severity */}
            <span style={{
              padding: '1px 6px', borderRadius: 3, fontSize: '0.7em',
              background: `${SEVERITY_COLORS[finding.severity]}20`,
              color: SEVERITY_COLORS[finding.severity],
              fontWeight: 600, textTransform: 'uppercase', marginTop: 2
            }}>
              {finding.severity}
            </span>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.85em', fontWeight: 500,
                display: 'flex', gap: 8, marginBottom: 2
              }}>
                <span>{finding.file}</span>
                {finding.line > 0 && <span style={{ opacity: 0.6 }}>:{finding.line}</span>}
              </div>
              <div style={{ fontSize: '0.8em', opacity: 0.8 }}>{finding.message}</div>
              {finding.suggestion && (
                <div style={{
                  fontSize: '0.75em', marginTop: 4, padding: '4px 6px',
                  borderRadius: 3, background: 'rgba(59,130,246,0.1)',
                  color: '#60a5fa'
                }}>
                  💡 {finding.suggestion}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button onClick={() => onAccept(finding.id)}
                title="Accept fix"
                style={{
                  padding: '4px 8px', borderRadius: 3, fontSize: '0.8em',
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  color: '#22c55e', cursor: 'pointer'
                }}>
                ✓
              </button>
              <button onClick={() => handleDismiss(finding.id)}
                title="Dismiss"
                style={{
                  padding: '4px 8px', borderRadius: 3, fontSize: '0.8em',
                  background: 'transparent',
                  border: '1px solid var(--vscode-panel-border, #555)',
                  opacity: 0.6, cursor: 'pointer'
                }}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {visibleFindings.length === 0 && (
        <div style={{ padding: 12, textAlign: 'center', opacity: 0.5 }}>
          All findings dismissed or accepted.
        </div>
      )}
    </div>
  );
}
