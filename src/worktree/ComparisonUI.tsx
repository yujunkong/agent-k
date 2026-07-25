/**
 * ComparisonUI — Best-of-N 결과 비교 UI (C7-T09)
 */
import React from 'react';
import type { BoNTrial } from './BestOfN';

interface ComparisonUIProps {
  trials: BoNTrial[];
  winnerId: string | null;
  onSelectWinner: (id: string) => void;
  onAdopt: () => void;
  onRerun: () => void;
}

function TrialCard({ trial, isWinner, onSelect }: { trial: BoNTrial; isWinner: boolean; onSelect: () => void }) {
  const tokens = (trial.tokenUsage?.input ?? 0) + (trial.tokenUsage?.output ?? 0);
  const duration = trial.duration ? `${(trial.duration / 1000).toFixed(1)}s` : 'N/A';

  return (
    <div onClick={onSelect} style={{
      padding: 12, borderRadius: 6, cursor: 'pointer',
      background: isWinner
        ? 'rgba(34,197,94,0.1)'
        : trial.status === 'failure'
          ? 'rgba(239,68,68,0.05)'
          : 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.03))',
      border: `1px solid ${
        isWinner ? 'rgba(34,197,94,0.4)' :
        trial.status === 'failure' ? 'rgba(239,68,68,0.3)' :
        'var(--vscode-panel-border, #333)'
      }`,
      transition: 'all 0.15s'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ fontSize: '0.9em' }}>{trial.id}</strong>
        <span style={{
          padding: '2px 8px', borderRadius: 10, fontSize: '0.75em',
          background: trial.status === 'success' ? 'rgba(34,197,94,0.2)' :
                      trial.status === 'failure' ? 'rgba(239,68,68,0.2)' :
                      'rgba(255,168,0,0.2)',
          color: trial.status === 'success' ? '#22c55e' :
                 trial.status === 'failure' ? '#ef4444' : '#f59e0b'
        }}>
          {trial.status}
        </span>
      </div>

      <div style={{ fontSize: '0.8em', opacity: 0.7, display: 'flex', gap: 12 }}>
        <span>🤖 {trial.model}</span>
        <span>⚡ {duration}</span>
        <span>📊 {tokens} tokens</span>
      </div>

      {trial.output && (
        <div style={{
          fontSize: '0.8em', marginTop: 6, padding: 6, borderRadius: 4,
          background: 'rgba(0,0,0,0.2)', maxHeight: 60, overflow: 'hidden'
        }}>
          {trial.output.slice(0, 150)}
        </div>
      )}

      {trial.error && (
        <div style={{ color: '#ef4444', fontSize: '0.8em', marginTop: 4 }}>
          ⚠️ {trial.error.slice(0, 100)}
        </div>
      )}

      {isWinner && (
        <div style={{
          marginTop: 6, padding: '2px 8px', borderRadius: 4,
          background: 'rgba(34,197,94,0.2)', color: '#22c55e',
          fontSize: '0.8em', display: 'inline-block'
        }}>
          🏆 Winner
        </div>
      )}
    </div>
  );
}

export function ComparisonUI({ trials, winnerId, onSelectWinner, onAdopt, onRerun }: ComparisonUIProps) {
  if (trials.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', opacity: 0.5 }}>
        <p>No trials yet. Run Best-of-N to see results.</p>
      </div>
    );
  }

  // Summary stats
  const successCount = trials.filter(t => t.status === 'success').length;
  const failureCount = trials.filter(t => t.status === 'failure').length;
  const totalTokens = trials.reduce((sum, t) =>
    sum + (t.tokenUsage?.input ?? 0) + (t.tokenUsage?.output ?? 0), 0);

  return (
    <div className="bon-comparison" style={{ padding: 8 }}>
      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 12, padding: '8px 12px',
        borderRadius: 6, background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.03))',
        fontSize: '0.85em'
      }}>
        <span>✅ {successCount} success</span>
        <span>❌ {failureCount} failure</span>
        <span>📊 {totalTokens} tokens total</span>
      </div>

      {/* Trial cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {trials.map(trial => (
          <TrialCard
            key={trial.id}
            trial={trial}
            isWinner={trial.id === winnerId}
            onSelect={() => onSelectWinner(trial.id)}
          />
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onRerun}
          style={{
            padding: '6px 16px', borderRadius: 4,
            background: 'transparent',
            border: '1px solid var(--vscode-panel-border, #555)',
            cursor: 'pointer', fontSize: '0.85em'
          }}>
          🔄 Rerun All
        </button>
        <button onClick={onAdopt} disabled={!winnerId}
          style={{
            padding: '6px 16px', borderRadius: 4,
            background: winnerId ? 'var(--vscode-button-background, #0078d4)' : 'var(--vscode-button-secondaryBackground, #5a5a5a)',
            color: 'var(--vscode-button-foreground, #fff)',
            border: 'none', cursor: winnerId ? 'pointer' : 'default',
            fontSize: '0.85em'
          }}>
          🏆 Adopt Winner
        </button>
      </div>
    </div>
  );
}
