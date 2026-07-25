/**
 * Timeline - 루프 상태 타임라인 UI (C0-T13 / PRD-C0 §5.3)
 *
 * Turn별 상태 표시: Thinking → Searching → Reading → Planning → Done
 * 완료된 턴은 기본 collapse; duration 표시
 */
import React, { useEffect, useMemo, useState } from 'react';

export interface TimelineItem {
  id: string;
  turnNumber: number;
  status:
    | 'thinking'
    | 'planning'
    | 'searching'
    | 'reading'
    | 'editing'
    | 'running'
    | 'browsing'
    | 'asking'
    | 'done'
    | 'error';
  /** In-flight vs finished (PRD-C0 §5.3 ✓ / ✗) */
  itemStatus?: 'running' | 'done' | 'error';
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

function formatDuration(ms?: number): string {
  if (ms == null || ms < 0) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/** Item leading mark: spinner while running, ✓/✗ when settled */
function itemMark(item: TimelineItem): string {
  const st = item.itemStatus;
  if (st === 'done') return '✓';
  if (st === 'error' || item.status === 'error') return '✗';
  if (st === 'running') return '…';
  return STATUS_ICONS[item.status] || '⏳';
}

export function Timeline({ items, onRestoreCheckpoint }: TimelineProps) {
  // PRD-C0 §5.3: default-collapse completed turns; keep active turn expanded
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const groups = useMemo(() => {
    return items.reduce<Record<number, TimelineItem[]>>((acc, item) => {
      if (!acc[item.turnNumber]) acc[item.turnNumber] = [];
      acc[item.turnNumber].push(item);
      return acc;
    }, {});
  }, [items]);

  const turnNumbers = useMemo(
    () => Object.keys(groups).map(Number).sort((a, b) => a - b),
    [groups]
  );

  // Auto-collapse turns that ended with Done/Error; expand the latest active turn
  useEffect(() => {
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const turn of turnNumbers) {
        const turnItems = groups[turn] || [];
        const hasDone = turnItems.some(
          (i) => i.status === 'done' || i.itemStatus === 'done'
        );
        const hasError = turnItems.some(
          (i) => i.status === 'error' || i.itemStatus === 'error'
        );
        const stillRunning = turnItems.some((i) => i.itemStatus === 'running');
        const isLatest = turn === turnNumbers[turnNumbers.length - 1];
        if ((hasDone || hasError) && !stillRunning && !isLatest) {
          // Completed older turns stay collapsed by default
          if (prev[turn] === undefined) next[turn] = true;
        } else if (stillRunning || isLatest) {
          next[turn] = false;
        }
      }
      return next;
    });
  }, [groups, turnNumbers]);

  if (items.length === 0) return null;

  const toggleGroup = (turn: number) => {
    setCollapsed((prev) => ({ ...prev, [turn]: !prev[turn] }));
  };

  return (
    <div
      className="timeline"
      style={{
        fontSize: '0.85em',
        borderLeft: '2px solid var(--vscode-panel-border, #333)',
        paddingLeft: 12,
        margin: '8px 12px',
        background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.08))',
        borderRadius: 4,
        paddingTop: 8,
        paddingBottom: 8,
        paddingRight: 8
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>
        Agent Loop Timeline
      </div>

      {turnNumbers.map((turn) => {
        const turnItems = groups[turn];
        const isCollapsed = !!collapsed[turn];
        const lastStatus = turnItems[turnItems.length - 1].status;
        const stillRunning = turnItems.some((i) => i.itemStatus === 'running');
        const isComplete =
          !stillRunning && (lastStatus === 'done' || lastStatus === 'error');
        const turnDuration = (() => {
          const times = turnItems.map((i) => i.timestamp);
          const durs = turnItems.map((i) => i.duration || 0);
          const span = Math.max(...times) - Math.min(...times);
          const sum = durs.reduce((a, b) => a + b, 0);
          return sum || (span > 0 ? span : undefined);
        })();

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
                opacity: isComplete ? 0.65 : 1
              }}
            >
              <span>{isCollapsed ? '▶' : '▼'}</span>
              <span className="status-icon">
                {STATUS_ICONS[lastStatus] || '⏳'}
              </span>
              <span style={{ fontWeight: 500 }}>Turn {turn}</span>
              <span
                style={{
                  fontSize: '0.8em',
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: STATUS_COLORS[lastStatus] || '#555',
                  color: '#fff'
                }}
              >
                {stillRunning ? 'in progress' : lastStatus}
              </span>
              {turnDuration != null && turnDuration > 0 && (
                <span style={{ fontSize: '0.8em', opacity: 0.5 }}>
                  {formatDuration(turnDuration)}
                </span>
              )}
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
                      opacity:
                        item.itemStatus === 'done' || item.status === 'done'
                          ? 0.7
                          : 1
                    }}
                  >
                    <span
                      className="status-icon"
                      style={{
                        fontSize: '0.9em',
                        width: 14,
                        textAlign: 'center',
                        color:
                          item.itemStatus === 'error' || item.status === 'error'
                            ? '#ef4444'
                            : item.itemStatus === 'done'
                              ? '#22c55e'
                              : undefined
                      }}
                    >
                      {itemMark(item)}
                    </span>
                    <span className="timeline-label" style={{ flex: 1 }}>
                      {item.label}
                      {item.detail ? (
                        <span style={{ opacity: 0.55, marginLeft: 6 }}>
                          {item.detail}
                        </span>
                      ) : null}
                    </span>
                    {item.toolName && (
                      <span
                        style={{
                          fontSize: '0.75em',
                          padding: '1px 4px',
                          borderRadius: 3,
                          background: 'var(--vscode-badge-background, #333)',
                          color: 'var(--vscode-badge-foreground, #ccc)'
                        }}
                      >
                        {item.toolName}
                      </span>
                    )}
                    {item.duration != null && item.duration > 0 && (
                      <span style={{ fontSize: '0.8em', opacity: 0.5 }}>
                        {formatDuration(item.duration)}
                      </span>
                    )}
                    {(item.status === 'error' || item.itemStatus === 'error') &&
                      onRestoreCheckpoint && (
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
