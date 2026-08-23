/**
 * SUB-011 — Cursor-style subagent progress row on the parent timeline.
 * Screenshot: 6-dot icon · title · role badge · rolling detail / Waiting for subagent.
 */
import React, { useMemo } from 'react';
import type { TimelineStep } from '../conversation/timelinePresentation';
import { subagentRoleTitle } from '../conversation/conversationWorkEvent';
import { formatThoughtTitle } from './ExploreChrome';

function LiveTitle({ title, live }: { title: string; live: boolean }) {
  if (!live) {
    return <span className="ak-subagent-run__title">{title}</span>;
  }
  return (
    <span
      className="ak-subagent-run__title ak-step-title--live-shimmer"
      data-text={title}
    >
      <span className="ak-step-title__base">{title}</span>
      <span className="ak-step-title__shine" aria-hidden>
        {title}
      </span>
    </span>
  );
}

/** Six-dot cluster (Cursor subagent glyph). */
function SubagentGlyph() {
  return (
    <span className="ak-subagent-run__glyph" aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
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
    if (c.subtitle?.trim()) return c.subtitle.trim();
    return 'Working…';
  }
  // Comment: settled child titles still useful as last activity line
  for (let i = children.length - 1; i >= 0; i--) {
    const c = children[i];
    const head = String(c.title || '').split(' · ')[0]?.trim();
    if (head && c.kind !== 'subagent') return head;
  }
  return undefined;
}

export function SubagentRunRow({
  title,
  role,
  live,
  hasError,
  childrenSteps = [],
  rollingOverride,
  onOpen,
  interactive = true,
}: {
  title: string;
  /** SUB-008 — shown as muted badge (Explorer / Coding / …) */
  role?: string;
  live: boolean;
  hasError?: boolean;
  childrenSteps?: TimelineStep[];
  /** SUB-010 — parent peeks child session when childrenSteps are empty */
  rollingOverride?: string;
  onOpen: () => void;
  /** Parent timeline: clickable open-in-tab. Detail pane: display-only. */
  interactive?: boolean;
}) {
  const rolling = useMemo(() => {
    if (rollingOverride != null && String(rollingOverride).trim()) {
      return String(rollingOverride).trim();
    }
    return live ? latestChildStatus(childrenSteps) : undefined;
  }, [live, childrenSteps, rollingOverride]);
  const roleBadge = subagentRoleTitle(role);
  // Comment: SUB-011 — settled row shows Completed/Failed, not last keypoint (Edited)
  const detailLine = live
    ? rolling || 'Waiting for subagent'
    : hasError
      ? rolling === 'Failed'
        ? rolling
        : 'Failed'
      : rolling === 'Completed' || rolling === 'Failed'
        ? rolling
        : 'Completed';

  return (
    <div
      className={[
        'ak-subagent-run',
        live ? 'ak-subagent-run--live' : '',
        hasError ? 'ak-subagent-run--error' : '',
        interactive ? '' : 'ak-subagent-run--static',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className={[
          'ak-subagent-run__btn',
          interactive ? '' : 'ak-subagent-run__btn--locked',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (interactive) onOpen();
        }}
        aria-label={interactive ? `Open subagent: ${title}` : title}
        title={interactive ? 'Open in tab' : undefined}
      >
        <SubagentGlyph />
        <span className="ak-subagent-run__main">
          <span className="ak-subagent-run__headline">
            <LiveTitle title={title} live={!!live && !hasError} />
            {roleBadge ? (
              <span className="ak-subagent-run__role">{roleBadge}</span>
            ) : null}
          </span>
          {detailLine ? (
            <span
              className={[
                'ak-subagent-run__detail',
                live && !rolling ? 'ak-subagent-run__detail--wait' : '',
                live && rolling ? 'ak-subagent-run__detail--live' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-live={live ? 'polite' : undefined}
            >
              {detailLine}
            </span>
          ) : null}
        </span>
      </button>
    </div>
  );
}
