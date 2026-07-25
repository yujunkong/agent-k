/**
 * Timeline - 루프 상태 타임라인 UI (C0-T13)
 * 
 * Turn별 상태 표시: Thinking → Searching → Editing → Complete
 * 접이식 그룹, 완료 시 collapse
 */
import React, { useState } from 'react';

export interface TimelineItem {
  id: string;
  turnNumber: number;
  status: 'thinking' | 'planning' | 'searching' | 'reading' | 'editing' | 'running' | 'browsing' | 'asking' | 'done' | 'error';
  label: string;
  detail?: string;
  toolName?: string;
  duration?: number;
  timestamp: number;
}

interface TimelineProps {
  items: TimelineItem[];
  onRestoreCheckpoint?: (itemId: string) => void;
}

const STATUS_ICONS: Record<string, string> = {
  thinking: '💭',
  planning: '📋',
  searching: '🔍',
  reading: '📖',
  editing: '✏️',
  running: '⚡',
  browsing: '🌐',
  asking: '❓',
  done: '✅',
  error: '❌'
};

const STATUS_COLORS: Record<string, string> = {
  thinking: '#6b7280',
  planning: '#8b5cf6',
  searching: '#3b82f6',
  reading: '#10b981',
  editing: '#f59e0b',
  running: '#ef4444',
  browsing: '#6366f1',
  asking: '#ec4899',
  done: '#22c55e',
  error: '#ef4444'
};

export function Timeline({ items, onRestoreCheckpoint }: TimelineProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (items.length === 0) return null;

  // Group items by turn number
  const groups = items.reduce<Record<number, TimelineItem[]>>((acc, item) => {
    if (!acc[item.turnNumber]) acc[item.turnNumber] = [];
    acc[item.turnNumber].push(item);
    return acc;
  }, {});

  const toggleGroup = (turn: number) => {
    setCollapsed(prev => ({ ...prev, [turn]: !prev[turn] }));
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="timeline" style={{
      fontSize: '0.85em',
      borderLeft: '2px solid var(--vscode-panel-border, #333)',
      paddingLeft: 12,
      margin: '8px 0'
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>🔄 Agent Loop Timeline</div>
      
      {Object.entries(groups).map(([turnStr, turnItems]) => {
        const turn = Number(turnStr);
        const isCollapsed = collapsed[turn];
        const lastStatus = turnItems[turnItems.length - 1].status;
        const isComplete = lastStatus === 'done' || lastStatus === 'error';

        return (
          <div key={turn} className="timeline-group" style={{ marginBottom: 6 }}>
            <div
              className="timeline-turn-header"
              onClick={() => toggleGroup(turn)}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 0',
                opacity: isComplete ? 0.6 : 1
              }}
            >
              <span>{isCollapsed ? '▶' : '▼'}</span>
              <span className="status-icon">{STATUS_ICONS[lastStatus] || '⏳'}</span>
              <span style={{ fontWeight: 500 }}>Turn {turn}</span>
              <span style={{
                fontSize: '0.8em',
                padding: '1px 6px',
                borderRadius: 4,
                background: STATUS_COLORS[lastStatus] || '#555',
                color: '#fff'
              }}>
                {lastStatus}
              </span>
              {isComplete && <span style={{ opacity: 0.5, fontSize: '0.85em' }}>— collapsed</span>}
            </div>

            {!isCollapsed && (
              <div className="timeline-items" style={{ paddingLeft: 16 }}>
                {turnItems.map((item) => (
                  <div
                    key={item.id}
                    className="timeline-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 0',
                      opacity: item.status === 'done' ? 0.6 : 1
                    }}
                  >
                    <span className="status-icon" style={{ fontSize: '0.9em' }}>
                      {STATUS_ICONS[item.status] || '⏳'}
                    </span>
                    <span className="timeline-label" style={{ flex: 1 }}>{item.label}</span>
                    {item.toolName && (
                      <span style={{
                        fontSize: '0.8em',
                        padding: '1px 4px',
                        borderRadius: 3,
                        background: 'var(--vscode-badge-background, #333)',
                        color: 'var(--vscode-badge-foreground, #ccc)'
                      }}>
                        {item.toolName}
                      </span>
                    )}
                    {item.duration && (
                      <span style={{ fontSize: '0.8em', opacity: 0.5 }}>{formatDuration(item.duration)}</span>
                    )}
                    {item.status === 'error' && onRestoreCheckpoint && (
                      <button
                        onClick={() => onRestoreCheckpoint(item.id)}
                        style={{ fontSize: '0.8em', cursor: 'pointer' }}
                        title="Restore checkpoint"
                      >
                        ↩️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
