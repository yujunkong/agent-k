/**
 * PlanHistory - 최근 계획 10개 목록/불러오기 (C5-T22)
 */
import React, { useState } from 'react';
import type { StoredPlan } from './PlanStorage';

interface PlanHistoryProps {
  plans: StoredPlan[];
  onLoad: (slug: string) => void;
  onDelete: (slug: string) => void;
}

export function PlanHistory({ plans, onLoad, onDelete }: PlanHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const recent = plans.slice(0, 10);

  if (recent.length === 0) return null;

  return (
    <div className="plan-history" style={{ fontSize: '0.85em' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="settings-btn"
        style={{ padding: '4px 12px', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
      >
        <span>📋 Recent Plans ({recent.length})</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{
          marginTop: 4, padding: 4,
          background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.02))',
          borderRadius: 4,
          border: '1px solid var(--vscode-panel-border, #333)'
        }}>
          {recent.map(plan => (
            <div key={plan.slug} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 4,
              cursor: 'pointer',
              transition: 'background 0.15s'
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={() => onLoad(plan.slug)}>
                📄 {plan.title}
              </span>
              <span style={{ fontSize: '0.75em', opacity: 0.4 }}>
                {plan.todoCount} steps
              </span>
              <button onClick={() => onDelete(plan.slug)}
                style={{ fontSize: '0.8em', padding: '2px 6px', opacity: 0.5, cursor: 'pointer' }}
                title="Delete plan">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
