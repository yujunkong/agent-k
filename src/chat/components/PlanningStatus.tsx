/**
 * PlanningStatus - Planning next moves 상태 표시 (C0-T15)
 * 
 * 도구 호출 직전/턴 사이 고정 문구 표시
 * 컴팩트한 진행 표시줄
 */
import React from 'react';

export interface PlanningStep {
  id: string;
  label: string;
  status: 'pending' | 'current' | 'completed' | 'skipped' | 'error';
  detail?: string;
}

interface PlanningStatusProps {
  steps: PlanningStep[];
  isActive: boolean;
  mode?: 'thinking' | 'planning' | 'executing' | 'idle';
  title?: string;
}

const MODE_ICONS: Record<string, string> = {
  thinking: '💭',
  planning: '📋',
  executing: '⚡',
  idle: '⏸️'
};

export function PlanningStatus({ steps, isActive, mode = 'idle', title }: PlanningStatusProps) {
  if (!isActive && steps.length === 0) return null;

  return (
    <div className="planning-status" style={{
      padding: '8px 12px',
      margin: '4px 0',
      borderRadius: 6,
      background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05))',
      fontSize: '0.85em'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span>{MODE_ICONS[mode] || '⏳'}</span>
        <span style={{ fontWeight: 500 }}>
          {title || (mode === 'thinking' ? 'Thinking about next steps...' :
                     mode === 'planning' ? 'Planning approach...' :
                     mode === 'executing' ? 'Executing plan...' : 'Idle')}
        </span>
        {isActive && <span className="pulse-dot" style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#4ade80', animation: 'pulse 1.5s infinite'
        }} />}
      </div>

      {steps.length > 0 && (
        <div className="planning-steps" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {steps.map((step) => (
            <div
              key={step.id}
              className={`planning-step planning-step-${step.status}`}
              title={step.detail}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 12,
                fontSize: '0.8em',
                background: step.status === 'completed' ? 'rgba(74,222,128,0.15)' :
                           step.status === 'current' ? 'rgba(59,130,246,0.2)' :
                           step.status === 'error' ? 'rgba(239,68,68,0.15)' :
                           step.status === 'skipped' ? 'rgba(107,114,128,0.1)' :
                           'rgba(107,114,128,0.05)',
                color: step.status === 'completed' ? '#4ade80' :
                       step.status === 'current' ? '#60a5fa' :
                       step.status === 'error' ? '#f87171' :
                       step.status === 'skipped' ? '#9ca3af' :
                       '#d1d5db',
                border: `1px solid ${
                  step.status === 'completed' ? 'rgba(74,222,128,0.3)' :
                  step.status === 'current' ? 'rgba(59,130,246,0.4)' :
                  'rgba(107,114,128,0.2)'}`
              }}
            >
              <span>{step.status === 'completed' ? '✓' :
                       step.status === 'current' ? '→' :
                       step.status === 'error' ? '✗' :
                       step.status === 'skipped' ? '–' : '○'}</span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
