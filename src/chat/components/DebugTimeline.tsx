/**
 * DebugTimeline - 디버그 전용 타임라인 UI (C6-T13)
 */
import React from 'react';
import type { DebugStage } from '../../debug/DebugModeController';

interface DebugTimelineProps {
  currentStage: DebugStage;
  hypothesisCount: number;
  logsCollected: number;
  markersRemaining: number;
  verified: boolean;
}

const STAGE_INFO: Record<DebugStage, { label: string; icon: string; color: string }> = {
  hypothesis: { label: 'Hypothesis', icon: '🔍', color: '#3b82f6' },
  instrument: { label: 'Instrument', icon: '🔧', color: '#f59e0b' },
  reproduce: { label: 'Reproduce', icon: '🔄', color: '#8b5cf6' },
  analyze: { label: 'Analyze', icon: '📊', color: '#22c55e' },
  fix: { label: 'Fix', icon: '🔨', color: '#ef4444' },
  cleanup: { label: 'Cleanup', icon: '🧹', color: '#14b8a6' }
};

const STAGE_ORDER: DebugStage[] = ['hypothesis', 'instrument', 'reproduce', 'analyze', 'fix', 'cleanup'];

export function DebugTimeline({ currentStage, hypothesisCount, logsCollected, markersRemaining, verified }: DebugTimelineProps) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <div className="debug-timeline" style={{
      padding: '8px 12px', marginBottom: 8,
      borderRadius: 6,
      background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.02))',
      border: '1px solid rgba(139,92,246,0.2)',
      fontSize: '0.8em'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: '0.85em' }}>🐛 Debug</span>
        {verified && <span style={{ color: '#22c55e', fontSize: '0.8em' }}>✅ Verified</span>}
      </div>

      <div style={{ display: 'flex', gap: 2 }}>
        {STAGE_ORDER.map((stage, i) => {
          const info = STAGE_INFO[stage];
          const isActive = stage === currentStage;
          const isCompleted = i < currentIdx;
          const isPending = i > currentIdx;

          return (
            <div key={stage} style={{
              flex: 1, padding: '4px 6px', borderRadius: 4, textAlign: 'center',
              background: isActive ? `${info.color}20` : isCompleted ? 'rgba(34,197,94,0.1)' : 'transparent',
              border: `1px solid ${isActive ? info.color + '40' : 'transparent'}`,
              opacity: isPending ? 0.4 : 1,
              fontSize: '0.75em'
            }}>
              <div>{isCompleted ? '✓' : info.icon}</div>
              <div style={{ fontWeight: isActive ? 600 : 400, marginTop: 2 }}>
                {info.label}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.75em', opacity: 0.6 }}>
        <span>🧪 {hypothesisCount} hypotheses</span>
        <span>📊 {logsCollected} logs</span>
        {markersRemaining > 0 && <span style={{ color: '#f59e0b' }}>⚠️ {markersRemaining} markers</span>}
      </div>
    </div>
  );
}
