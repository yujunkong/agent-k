/**
 * Cursor-style subagent progress row in the parent timeline.
 * Shows the short task name (description) while running; click opens a detail tab
 * (no composer) with the same WorkTimeline progress as the main chat.
 */
import React, { useMemo } from 'react';
import type { TimelineStep } from '../conversation/timelinePresentation';
import { formatThoughtTitle } from './ExploreChrome';

function LiveTitle({ title, live }: { title: string; live: boolean }) {
  if (!live) {
    return <span className="ak-step-title">{title}</span>;
  }
  return (
    <span className="ak-step-title ak-step-title--live-shimmer" data-text={title}>
      <span className="ak-step-title__base">{title}</span>
      <span className="ak-step-title__shine" aria-hidden>
        {title}
      </span>
    </span>
  );
}

function latestChildStatus(children: TimelineStep[]): string | undefined {
  for (let i = children.length - 1; i >= 0; i--) {
    const c = children[i];
    if (c.status !== 'running') continue;
    if (c.kind === 'reasoning') return formatThoughtTitle(c, true);
    const head = String(c.title || '').split(' · ')[0]?.trim();
    if (head) return head;
    return 'Working…';
  }
  return undefined;
}

export function SubagentRunRow({
  title,
  live,
  hasError,
  childrenSteps = [],
  onOpen,
  interactive = true
}: {
  title: string;
  live: boolean;
  hasError?: boolean;
  childrenSteps?: TimelineStep[];
  onOpen: () => void;
  /** Parent timeline: clickable open-in-tab. Detail pane: display-only. */
  interactive?: boolean;
}) {
  const rolling = useMemo(
    () => (live ? latestChildStatus(childrenSteps) : undefined),
    [live, childrenSteps]
  );

  return (
    <div
      className={[
        'ak-step-row',
        'ak-subagent-run',
        live ? 'ak-step-row--live' : '',
        hasError ? 'ak-step-row--error' : '',
        interactive ? '' : 'ak-subagent-run--static'
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className={[
          'ak-step-chevron-btn',
          'ak-subagent-run__btn',
          interactive ? '' : 'ak-step-chevron-btn--locked'
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (interactive) onOpen();
        }}
        aria-label={interactive ? `Open subagent: ${title}` : title}
        title={interactive ? 'Open in tab' : undefined}
      >
        <span className="ak-step-chevron" aria-hidden>
          {interactive ? '›' : '·'}
        </span>
        <LiveTitle title={title} live={!!live && !hasError} />
        {interactive ? (
          <span className="ak-subagent-run__hint" aria-hidden>
            Open
          </span>
        ) : null}
      </button>
      {rolling ? (
        <div className="ak-step-rolling ak-step-rolling--live" aria-live="polite">
          <LiveTitle title={rolling} live />
        </div>
      ) : null}
    </div>
  );
}
