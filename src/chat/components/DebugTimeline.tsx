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
  /** RW-C6-03-R2: browser evidence attached to timeline */
  evidenceCount?: number;
  onStageClick?: (stage: DebugStage) => void;
}

const STAGE_INFO: Record<
  DebugStage,
  { label: string; icon: string; color: string; tooltip: string }
> = {
  hypothesis: {
    label: 'Hypothesis',
    icon: '🔍',
    color: '#3b82f6',
    tooltip: '버그 원인 가설을 2–3개 세웁니다.'
  },
  instrument: {
    label: 'Instrument',
    icon: '🔧',
    color: '#f59e0b',
    tooltip: '가설 검증용 DEBUG_INSTRUMENT 로그를 심습니다.'
  },
  reproduce: {
    label: 'Reproduce',
    icon: '🔄',
    color: '#8b5cf6',
    tooltip: '재현 절차를 따라 런타임 증거를 모읍니다.'
  },
  analyze: {
    label: 'Analyze',
    icon: '📊',
    color: '#22c55e',
    tooltip: '로그·스택을 보고 가설을 확정/기각합니다.'
  },
  fix: {
    label: 'Fix',
    icon: '🔨',
    color: '#ef4444',
    tooltip: '확정된 원인에 최소 수정을 적용합니다.'
  },
  cleanup: {
    label: 'Cleanup',
    icon: '🧹',
    color: '#14b8a6',
    tooltip: '계측 마커를 제거하고 정리를 검증합니다.'
  }
};

const STAGE_ORDER: DebugStage[] = [
  'hypothesis',
  'instrument',
  'reproduce',
  'analyze',
  'fix',
  'cleanup'
];

export function DebugTimeline({
  currentStage,
  hypothesisCount,
  logsCollected,
  markersRemaining,
  verified,
  evidenceCount = 0,
  onStageClick
}: DebugTimelineProps) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <div
      className="debug-timeline"
      style={{
        padding: '8px 12px',
        marginBottom: 8,
        borderRadius: 6,
        background:
          'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.02))',
        border: '1px solid rgba(139,92,246,0.2)',
        fontSize: 12
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 12 }}>🐛 Debug</span>
        {verified && (
          <span style={{ color: '#22c55e', fontSize: 11 }}>✅ Verified</span>
        )}
      </div>

      <div
        className="debug-stage-row"
        style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
      >
        {STAGE_ORDER.map((stage, i) => {
          const info = STAGE_INFO[stage];
          const isActive = stage === currentStage;
          const isCompleted = i < currentIdx;
          const isPending = i > currentIdx;
          const clickable = Boolean(onStageClick);

          return (
            <button
              key={stage}
              type="button"
              className="debug-stage-btn"
              title={info.tooltip}
              aria-label={`${info.label}: ${info.tooltip}`}
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onStageClick?.(stage)}
              disabled={!clickable}
              style={{
                flex: '1 1 72px',
                minWidth: 64,
                padding: '6px 4px',
                borderRadius: 6,
                textAlign: 'center',
                background: isActive
                  ? `${info.color}28`
                  : isCompleted
                    ? 'rgba(34,197,94,0.12)'
                    : 'transparent',
                border: `1px solid ${isActive ? info.color + '66' : 'transparent'}`,
                opacity: isPending ? 0.45 : 1,
                fontSize: 11,
                color: 'var(--vscode-foreground, #ccc)',
                cursor: clickable ? 'pointer' : 'default',
                fontFamily: 'inherit'
              }}
            >
              <div
                aria-hidden
                style={{
                  fontSize: 18,
                  lineHeight: 1.2,
                  marginBottom: 2
                }}
              >
                {isCompleted && !isActive ? '✓' : info.icon}
              </div>
              <div style={{ fontWeight: isActive ? 600 : 400, lineHeight: 1.2 }}>
                {info.label}
              </div>
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 8,
          fontSize: 11,
          opacity: 0.65
        }}
      >
        <span title="생성된 가설 수">🧪 {hypothesisCount} hypotheses</span>
        <span title="수집된 로그 수">📊 {logsCollected} logs</span>
        {evidenceCount > 0 && (
          <span title="브라우저 증거">🖼️ {evidenceCount} evidence</span>
        )}
        {markersRemaining > 0 && (
          <span style={{ color: '#f59e0b' }} title="남은 계측 마커">
            ⚠️ {markersRemaining} markers
          </span>
        )}
      </div>
    </div>
  );
}
