import React, { useEffect, useState } from 'react';
import type {
  ConversationWorkEvent,
  ConversationWorkStatus
} from '../conversation/conversationWorkEvent';

export type { ConversationWorkEvent };

/** @deprecated Use ConversationWorkEvent — WorkTimeline renders the event model directly. */
export type WorkItem = ConversationWorkEvent;
export type WorkItemKind = ConversationWorkEvent['type'];
export type WorkItemStatus = ConversationWorkStatus;

export interface WorkTimelineProps {
  items: ConversationWorkEvent[];
  defaultOpen?: boolean;
  title?: string;
}

function marker(status: ConversationWorkStatus = 'complete') {
  if (status === 'running') return '●';
  if (status === 'error') return '×';
  if (status === 'pending') return '○';
  return '✓';
}

function stepsLabel(count: number): string {
  return count === 1 ? '1 step' : `${count} steps`;
}

/** Compact Cursor-style activity timeline. Renders ConversationWorkEvent rows as-is. */
export function WorkTimeline({ items, defaultOpen = false, title }: WorkTimelineProps) {
  if (!items.length) return null;
  const active = items.some((item) => {
    const status = item.status ?? 'complete';
    return status === 'running' || status === 'pending';
  });
  const hasError = items.some((item) => item.status === 'error');
  const [open, setOpen] = useState(defaultOpen || active);

  useEffect(() => {
    setOpen(active);
  }, [active]);

  const summary = title
    ? title
    : active
      ? `Working · ${stepsLabel(items.length)}`
      : `Worked · ${stepsLabel(items.length)}`;

  return (
    <details
      className="ak-work-timeline"
      open={active || open}
      onToggle={(event) => {
        if (active) return;
        setOpen((event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary className="ak-work-timeline__summary">
        <span className="ak-work-timeline__marker" data-active={active ? 'true' : undefined}>
          {active ? '●' : hasError ? '×' : '✓'}
        </span>
        <span className="ak-work-timeline__title">{summary}</span>
      </summary>
      <div className="ak-work-timeline__items">
        {items.map((item) => {
          const status = item.status ?? 'complete';
          return (
            <div
              key={item.id}
              className={`ak-work-item ak-work-item--${status}`}
              data-work-type={item.type}
            >
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
