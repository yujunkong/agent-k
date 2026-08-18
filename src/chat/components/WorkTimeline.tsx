import React from 'react';

export type WorkItemKind = 'read' | 'search' | 'edit' | 'terminal' | 'verify' | 'generic';
export type WorkItemStatus = 'pending' | 'running' | 'complete' | 'error';

export interface WorkItem {
  id: string;
  label: string;
  kind?: WorkItemKind;
  status?: WorkItemStatus;
  detail?: string;
}

export interface WorkTimelineProps {
  items: WorkItem[];
  defaultOpen?: boolean;
  title?: string;
}

function marker(status: WorkItemStatus = 'complete') {
  if (status === 'running') return '●';
  if (status === 'error') return '×';
  if (status === 'pending') return '○';
  return '✓';
}

/** Compact Cursor-style activity timeline. It deliberately has no card per event. */
export function WorkTimeline({ items, defaultOpen = false, title = 'Working' }: WorkTimelineProps) {
  if (!items.length) return null;
  const active = items.some((item) => (item.status ?? 'complete') === 'running');

  return (
    <details className="ak-work-timeline" open={defaultOpen || active}>
      <summary className="ak-work-timeline__summary">
        <span className="ak-work-timeline__marker">{active ? '●' : '✓'}</span>
        <span>{title}</span>
        <span className="ak-work-timeline__count">{items.length}</span>
      </summary>
      <div className="ak-work-timeline__items">
        {items.map((item) => {
          const status = item.status ?? 'complete';
          return (
            <div key={item.id} className={`ak-work-item ak-work-item--${status}`}>
              <span className="ak-work-item__marker">{marker(status)}</span>
              <span className="ak-work-item__label">{item.label}</span>
              {item.detail ? <span className="ak-work-item__detail">{item.detail}</span> : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}
