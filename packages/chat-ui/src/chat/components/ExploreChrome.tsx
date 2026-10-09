/**
 * Cursor-style Exploring/Explored + Thought chevron chrome for WorkTimeline.
 * Ported from MessageSteps; presentation nodes are the source of truth.
 * Visual styles live in chat.css (ak-step-*, ak-explore-*) — keep inline styles minimal.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineStep } from '../conversation/timelinePresentation';
import {
  formatExploreDetail,
  formatRollingTool,
  formatThoughtTitle,
  toolRowLabel
} from './messageSteps/exploreHelpers';
import { ChevronRow, LiveStepTitle, ThoughtBody } from './messageSteps/stepChrome';

/** Re-exported for SubagentRunRow — keeps the existing import path stable. */
export { formatThoughtTitle };

function useExploringRollingStatus(children: TimelineStep[], active: boolean): string | undefined {
  const [flash, setFlash] = useState<{ toolId: string; label: string } | null>(null);
  const lastFlashedToolIdRef = useRef<string | null>(null);
  const lastTool = useMemo(() => {
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].kind !== 'reasoning') return children[i];
    }
    return undefined;
  }, [children]);
  const thinkingLive = useMemo(
    () => children.some((s) => s.kind === 'reasoning' && s.status === 'running'),
    [children]
  );
  const runningTool = useMemo(() => {
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].kind !== 'reasoning' && children[i].status === 'running') {
        return children[i];
      }
    }
    return undefined;
  }, [children]);

  useEffect(() => {
    if (!active) {
      lastFlashedToolIdRef.current = null;
      setFlash(null);
      return;
    }
    if (!lastTool) return;
    const id = lastTool.id;
    if (id === lastFlashedToolIdRef.current) return;
    lastFlashedToolIdRef.current = id;
    setFlash({ toolId: id, label: formatRollingTool({ ...lastTool, status: 'running' }) });
    const t = window.setTimeout(() => {
      setFlash((prev) => (prev?.toolId === id ? null : prev));
    }, 500);
    return () => window.clearTimeout(t);
  }, [active, lastTool?.id]);

  if (!active) return undefined;
  // Comment: one status slot under Exploring — Thinking | tool | Planning
  if (thinkingLive) return 'Thinking';
  if (flash?.label) return flash.label;
  if (runningTool) return formatRollingTool(runningTool);
  return 'Planning next moves';
}

function ExploreStreamList({
  childrenSteps,
  live
}: {
  childrenSteps: TimelineStep[];
  live: boolean;
}) {
  const [openThoughtIds, setOpenThoughtIds] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !live || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [childrenSteps, live]);

  return (
    <div
      ref={listRef}
      className={[
        'ak-tool-slide-list',
        'ak-explore-scroll',
        live ? 'ak-explore-scroll--live' : 'ak-explore-scroll--settled'
      ].join(' ')}
      onScroll={() => {
        const el = listRef.current;
        if (!el) return;
        const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickRef.current = gap < 48;
      }}
      onWheel={(e) => {
        e.stopPropagation();
      }}
    >
      {childrenSteps.map((s) => {
        if (s.kind === 'reasoning') {
          const thoughtLive = live && s.status === 'running';
          const title = formatThoughtTitle(s, thoughtLive);
          const body = (s.body || '').trim();
          const expanded = thoughtLive || (openThoughtIds[s.id] ?? false);
          return (
            <div
              key={s.id}
              className={
                thoughtLive
                  ? 'ak-explore-mid-thought ak-explore-mid-thought--live'
                  : 'ak-explore-mid-thought'
              }
            >
              <button
                type="button"
                className="ak-step-chevron-btn ak-explore-mid-thought__btn"
                aria-expanded={expanded}
                onClick={() => {
                  setOpenThoughtIds((p) => ({ ...p, [s.id]: !expanded }));
                }}
              >
                <span className="ak-explore-mid-thought__chevron" aria-hidden>
                  {expanded ? '▾' : '▸'}
                </span>
                <LiveStepTitle
                  title={title}
                  live={!!thoughtLive}
                  className="ak-explore-mid-thought__title"
                />
              </button>
              {expanded ? (
                <div className="ak-explore-nested-thought">
                  <ThoughtBody text={body} live={!!thoughtLive} compact />
                </div>
              ) : null}
            </div>
          );
        }

        const rowFailed = s.status === 'failed';
        const rowRunning = live && s.status === 'running';
        return (
          <div
            key={s.id}
            className={[
              'ak-explore-tool-row',
              rowRunning ? 'ak-tool-slide-in ak-tool-row--running ak-explore-tool-row--running' : '',
              rowFailed ? 'ak-explore-tool-row--failed' : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="ak-explore-tool-row__marker" aria-hidden>
              {rowFailed ? '✗' : s.status === 'running' ? '›' : '·'}
            </span>
            <span className="ak-explore-tool-row__text">
              {toolRowLabel(s)}
              {s.subtitle ? (
                <span className="ak-explore-tool-row__detail"> {formatExploreDetail(s.subtitle)}</span>
              ) : null}
            </span>
            {s.status === 'running' ? (
              <span className="ak-live-blink ak-live-blink--sm" aria-hidden>
                <span className="ak-live-blink__dot" />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function PlanningTailRow({ title }: { title: string }) {
  return (
    <ChevronRow
      title={title}
      expanded={false}
      live
      onToggle={() => {}}
    />
  );
}

export function ThoughtRow({
  step,
  /** Subagent detail / sequential: collapse settled thoughts (Cursor-style). */
  preferCollapsed = false
}: {
  step: TimelineStep;
  preferCollapsed?: boolean;
}) {
  const live = step.status === 'running';
  // Cursor: live "Thinking" may show body; settled "Thought for Xs" stays collapsed.
  const [open, setOpen] = useState(live && !preferCollapsed);
  const body = (step.body || '').trim();
  useEffect(() => {
    if (live) {
      // Live Thinking stays visible (compact body); settled Thought collapses to chevron.
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [live, step.id]);
  return (
    <ChevronRow
      title={formatThoughtTitle(step, live)}
      expanded={open && (!!body || live)}
      live={live}
      hasError={step.status === 'failed'}
      onToggle={() => setOpen((v) => !v)}
    >
      {body || live ? (
        <ThoughtBody text={body} live={live} compact={preferCollapsed} />
      ) : null}
    </ChevronRow>
  );
}

export function ExploreRunRow({
  title,
  childrenSteps,
  live,
  hasError
}: {
  title: string;
  childrenSteps: TimelineStep[];
  live: boolean;
  hasError: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rollingStatus = useExploringRollingStatus(childrenSteps, live && !open);

  useEffect(() => {
    // Collapse when Exploring settles into Explored.
    if (!live) setOpen(false);
  }, [live]);

  return (
    <ChevronRow
      title={title}
      expanded={open && childrenSteps.length > 0}
      live={live}
      hasError={hasError}
      rollingStatus={rollingStatus}
      onToggle={() => setOpen((v) => !v)}
    >
      <ExploreStreamList childrenSteps={childrenSteps} live={live} />
    </ChevronRow>
  );
}
