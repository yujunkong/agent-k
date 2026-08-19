import React, { useEffect, useState } from 'react';
import type { TimelineStep, TimelineStepStatus } from '../conversation/timelinePresentation';
import {
  buildTimelineStepCardView,
  timelineStepMarker
} from './timelineStepCardView';

export interface TimelineStepCardProps {
  step: TimelineStep;
  /** Presentation active step — drives density hierarchy. */
  activeStepId?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children?: React.ReactNode;
}

function statusClass(status: TimelineStepStatus): string {
  if (status === 'failed') return 'error';
  if (status === 'completed') return 'complete';
  return 'running';
}

/** Shared Cursor-style card shell for timeline tool / reasoning / subagent rows. */
export function TimelineStepCard({
  step,
  activeStepId,
  defaultOpen: defaultOpenProp,
  forceOpen,
  children
}: TimelineStepCardProps) {
  const view = buildTimelineStepCardView(step, { activeStepId });
  const live = step.status === 'running';
  const [open, setOpen] = useState(forceOpen ?? defaultOpenProp ?? view.defaultOpen);

  useEffect(() => {
    if (forceOpen != null) {
      setOpen(forceOpen);
      return;
    }
    if (view.defaultOpen) setOpen(true);
    else if (view.density === 'compact' && !live) setOpen(false);
  }, [forceOpen, view.defaultOpen, view.density, live, step.id]);

  const expanded = open && Boolean(children);
  const HeaderTag = view.expandable ? 'button' : 'div';
  const showSubtitle = Boolean(view.subtitle);
  // Compact completed cards: keep subtitle; hide meta when expanded body is open.
  const showMeta = Boolean(view.meta) && !expanded;

  return (
    <article
      className={`ak-timeline-card ak-timeline-card--${statusClass(step.status)} ak-timeline-card--${view.kind} ak-timeline-card--${view.density}${
        view.expandable ? ' ak-timeline-card--expandable' : ''
      }${expanded ? ' ak-timeline-card--open' : ''}${live ? ' ak-timeline-card--live' : ''}`}
      data-step-id={step.id}
      data-step-active={view.density === 'active' ? 'true' : undefined}
      data-step-density={view.density}
    >
      <HeaderTag
        type={view.expandable ? 'button' : undefined}
        className="ak-timeline-card__header"
        aria-expanded={view.expandable ? expanded : undefined}
        onClick={view.expandable ? () => setOpen((value) => !value) : undefined}
      >
        <span className="ak-timeline-card__marker" aria-hidden>
          {timelineStepMarker(step.status, live, view.marker)}
        </span>
        <span className="ak-timeline-card__text">
          <span className={`ak-timeline-card__title${live ? ' ak-timeline-card__title--shimmer' : ''}`}>
            <span className="ak-timeline-card__title-base">{view.title}</span>
            {live ? <span className="ak-timeline-card__title-shine" aria-hidden>{view.title}</span> : null}
          </span>
          {showSubtitle ? (
            <span className="ak-timeline-card__subtitle">{view.subtitle}</span>
          ) : null}
          {showMeta ? <span className="ak-timeline-card__meta">{view.meta}</span> : null}
        </span>
        {view.expandable ? (
          <span className="ak-timeline-card__chev" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
        ) : null}
      </HeaderTag>
      {expanded ? <div className="ak-timeline-card__body">{children}</div> : null}
    </article>
  );
}
