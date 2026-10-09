/**
 * V31-UI-05 — shared Exploring/Thought chrome.
 * MessageSteps and ExploreChrome both render through this. The card trees stay separate.
 */
import React, { useEffect, useRef } from 'react';
import { MID_THOUGHT_DISPLAY_MAX, THOUGHT_DISPLAY_MAX } from './exploreHelpers';

const STEPS_FG = 'var(--vscode-descriptionForeground, #9d9d9d)';
const STEPS_ERROR = '#e2556f';

export function LiveStepTitle({
  title,
  live,
  style,
  className,
}: {
  title: string;
  live: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  if (!live) {
    return (
      <span className={['ak-step-title', className].filter(Boolean).join(' ')} style={style}>
        {title}
      </span>
    );
  }
  return (
    <span
      className={['ak-step-title', 'ak-step-title--live-shimmer', className].filter(Boolean).join(' ')}
      style={style}
      data-text={title}
    >
      <span className="ak-step-title__base">{title}</span>
      <span className="ak-step-title__shine" aria-hidden>
        {title}
      </span>
    </span>
  );
}

export function ThoughtBody({
  text,
  live,
  compact,
}: {
  text: string;
  live: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const max = compact ? MID_THOUGHT_DISPLAY_MAX : THOUGHT_DISPLAY_MAX;
  // Comment: over cap → drop the head so live Thinking keeps the newest tokens
  const display = text.length > max ? `…${text.slice(text.length - max)}` : text;

  useEffect(() => {
    const el = ref.current;
    if (!el || !live || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [display, live]);

  return (
    <div
      ref={ref}
      className={`message-steps-thought-body${compact ? ' message-steps-thought-body--mid' : ''}`}
      onScroll={() => {
        const el = ref.current;
        if (!el) return;
        const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickRef.current = gap < 48;
      }}
      onWheel={(e) => {
        e.stopPropagation();
      }}
    >
      {display || (live ? '…' : '')}
    </div>
  );
}

export function ChevronRow({
  title,
  expanded,
  live,
  hasError,
  rollingStatus,
  onToggle,
  children,
  tone = 'explore',
}: {
  title: string;
  expanded: boolean;
  live: boolean;
  hasError?: boolean;
  rollingStatus?: string;
  onToggle: () => void;
  children?: React.ReactNode;
  /** steps keeps MessageSteps inline title colors. explore leaves color to CSS. */
  tone?: 'steps' | 'explore';
}) {
  const showRolling = !expanded && !!live && !!rollingStatus?.trim();
  const shimmerHeader = !!live && !hasError && rollingStatus == null;
  const locked = live && !children;
  const steps = tone === 'steps';
  const titleColor = steps ? (hasError ? STEPS_ERROR : live ? undefined : STEPS_FG) : undefined;
  const titleStyle: React.CSSProperties | undefined = steps
    ? {
        fontWeight: live || hasError ? 500 : 400,
        ...(titleColor ? { color: titleColor } : null),
        ...(!shimmerHeader && live && !hasError ? { color: STEPS_FG } : null),
      }
    : undefined;

  return (
    <div
      className={['ak-step-row', live ? 'ak-step-row--live' : '', hasError ? 'ak-step-row--error' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        onClick={() => {
          if (locked) return;
          onToggle();
        }}
        className={['ak-step-chevron-btn', locked ? 'ak-step-chevron-btn--locked' : ''].filter(Boolean).join(' ')}
        aria-expanded={expanded}
        aria-busy={live || undefined}
      >
        <span
          className="ak-step-chevron"
          aria-hidden
          style={steps && hasError ? { color: STEPS_ERROR, opacity: 0.9 } : undefined}
        >
          {expanded ? '▾' : '▸'}
        </span>
        <LiveStepTitle title={title} live={shimmerHeader} style={titleStyle} />
      </button>
      {showRolling ? (
        <div key={rollingStatus} className="ak-step-rolling ak-step-rolling--live" aria-live="polite">
          <LiveStepTitle title={rollingStatus!} live />
        </div>
      ) : null}
      {expanded ? children : null}
    </div>
  );
}
