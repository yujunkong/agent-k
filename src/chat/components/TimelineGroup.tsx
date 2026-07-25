/**
 * TimelineGroup - 타임라인 접이식 그룹 (C0-T14)
 * 
 * 완료된 턴 자동 collapse + 수동 토글
 */
import React, { useState, useEffect } from 'react';
import type { TimelineItem } from './Timeline';

interface TimelineGroupProps {
  turn: number;
  items: TimelineItem[];
  defaultCollapsed?: boolean;
  onToggle?: (turn: number, collapsed: boolean) => void;
  children: React.ReactNode;
}

export function TimelineGroup({ turn, items, defaultCollapsed, onToggle, children }: TimelineGroupProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (defaultCollapsed !== undefined) return defaultCollapsed;
    // Auto-collapse if all items are done/error
    return items.every(i => i.status === 'done' || i.status === 'error');
  });

  useEffect(() => {
    if (defaultCollapsed !== undefined) {
      setCollapsed(defaultCollapsed);
    }
  }, [defaultCollapsed]);

  const lastStatus = items[items.length - 1]?.status;

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    onToggle?.(turn, next);
  };

  return (
    <div className="timeline-group" style={{ marginBottom: 4 }}>
      <div
        className="timeline-group-header"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={`Turn ${turn} ${collapsed ? 'expanded' : 'collapsed'}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggle(); }}
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderRadius: 4,
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '0.7em', transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
        <span>Turn {turn}</span>
        {lastStatus && (
          <span style={{
            fontSize: '0.75em',
            padding: '1px 6px',
            borderRadius: 3,
            background: lastStatus === 'done' ? '#1a3a1a' : lastStatus === 'error' ? '#3a1a1a' : '#333',
            color: lastStatus === 'done' ? '#4ade80' : lastStatus === 'error' ? '#f87171' : '#ccc'
          }}>
            {lastStatus}
          </span>
        )}
        {collapsed && items.length > 0 && (
          <span style={{ fontSize: '0.8em', opacity: 0.5 }}>
            — {items.length} step{items.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="timeline-group-content" style={{ paddingLeft: 20 }}>
          {children}
        </div>
      )}
    </div>
  );
}
