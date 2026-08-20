/**
 * Cursor-style Exploring/Explored + Thought chevron chrome for WorkTimeline.
 * Ported from MessageSteps; presentation nodes are the source of truth.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineStep } from '../conversation/timelinePresentation';
import { isPlanGenerateStep } from '../planGenerateStep';

const STEPS_FG = 'var(--vscode-descriptionForeground, #9d9d9d)';
const STEPS_ERROR = '#e2556f';
const STEPS_MUTED = 'var(--vscode-descriptionForeground, #9d9d9d)';
const THOUGHT_DISPLAY_MAX = 16000;
const MID_THOUGHT_DISPLAY_MAX = 900;

function fileBasename(detail?: string): string | undefined {
  if (!detail?.trim()) return undefined;
  const norm = detail.replace(/\\/g, '/').split('/').filter(Boolean);
  const base = norm[norm.length - 1] || detail.trim();
  if (!base || base === '.' || base === '..') return undefined;
  return base.length > 40 ? `${base.slice(0, 38)}…` : base;
}

function shortPath(detail?: string): string {
  if (!detail) return '';
  const parts = detail.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return detail;
  return `…/${parts.slice(-2).join('/')}`;
}

function formatExploreDetail(detail?: string): string {
  if (!detail) return '';
  if (/\sin\s/.test(detail) || /\sL\d/.test(detail)) {
    return detail.length > 100 ? `${detail.slice(0, 97)}…` : detail;
  }
  return shortPath(detail);
}

function toolRowLabel(step: TimelineStep): string {
  const name = (step.toolName || step.title.replace(/\s*·.*$/, '') || '').toLowerCase();
  switch (name) {
    case 'read_file':
    case 'read_files':
      return 'Read';
    case 'grep':
      return 'Grepped';
    case 'glob':
    case 'file_search':
      return 'Searched';
    case 'list_dir':
      return 'Listed';
    case 'codebase_search':
      return 'Searched codebase';
    case 'read_lints':
      return 'Checked lints';
    case 'web_search':
      return 'Searched web';
    case 'web_fetch':
      return 'Fetched';
    default:
      if (/^read/i.test(step.title)) return 'Read';
      if (/^grep/i.test(step.title)) return 'Grepped';
      if (/^search/i.test(step.title)) return 'Searched';
      if (/^list/i.test(step.title)) return 'Listed';
      if (step.kind === 'reasoning') return 'Thought';
      return step.title.split(' · ')[0]?.trim() || 'Tool';
  }
}

function formatRollingTool(step: TimelineStep): string {
  const live = step.status === 'running';
  // Keep "file.ts L10-50" / "pattern in path" — do not drop the window suffix.
  let detail = '';
  if (step.subtitle) {
    if (/\sL\d/.test(step.subtitle) || /\sin\s/.test(step.subtitle)) {
      detail = formatExploreDetail(step.subtitle);
    } else {
      detail = fileBasename(step.subtitle) || shortPath(step.subtitle);
    }
  }
  const name = (step.toolName || '').toLowerCase();
  let verb = toolRowLabel(step);
  if (live) {
    if (name === 'read_file' || name === 'read_files' || verb === 'Read') verb = 'Reading';
    else if (name === 'grep' || verb === 'Grepped') verb = 'Grepping';
    else if (verb === 'Searched') verb = 'Searching';
    else if (verb === 'Listed') verb = 'Listing';
    else if (verb === 'Searched codebase') verb = 'Searching codebase';
  }
  return detail ? `${verb} ${detail}` : verb;
}

export function formatThoughtTitle(step: TimelineStep, live: boolean): string {
  if (isPlanGenerateStep(step)) {
    if (live && step.status === 'running') return 'Creating plan';
    if (step.status === 'failed') return 'Failed to create plan';
    return 'Created plan';
  }
  if (live && step.status === 'running') return 'Thinking';
  const ms = step.durationMs;
  if (ms != null && ms >= 1000) {
    return `Thought for ${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  }
  return 'Thought briefly';
}

function LiveStepTitle({
  title,
  live,
  style,
  className
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

function ThoughtBody({
  text,
  live,
  compact
}: {
  text: string;
  live: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const max = compact ? MID_THOUGHT_DISPLAY_MAX : THOUGHT_DISPLAY_MAX;
  const display = text.length > max ? `${text.slice(0, max)}…` : text;

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

function ChevronRow({
  title,
  expanded,
  live,
  hasError,
  rollingStatus,
  onToggle,
  children
}: {
  title: string;
  expanded: boolean;
  live: boolean;
  hasError?: boolean;
  rollingStatus?: string;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const titleColor = hasError ? STEPS_ERROR : live ? undefined : STEPS_FG;
  const showRolling = !expanded && !!live && !!rollingStatus?.trim();
  const shimmerHeader = !!live && !hasError && rollingStatus == null;
  return (
    <div
      className={['ak-step-row', live ? 'ak-step-row--live' : '', hasError ? 'ak-step-row--error' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        onClick={() => {
          if (live && !children) return;
          onToggle();
        }}
        className="ak-step-chevron-btn"
        aria-expanded={expanded}
        aria-busy={live || undefined}
        style={{ cursor: live && !children ? 'default' : 'pointer' }}
      >
        <span
          className="ak-step-chevron"
          aria-hidden
          style={hasError ? { color: STEPS_ERROR, opacity: 0.9 } : undefined}
        >
          {expanded ? '▾' : '▸'}
        </span>
        <LiveStepTitle
          title={title}
          live={shimmerHeader}
          style={{
            fontWeight: live || hasError ? 500 : 400,
            ...(titleColor ? { color: titleColor } : null),
            ...(!shimmerHeader && live && !hasError ? { color: STEPS_FG } : null)
          }}
        />
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

function useExploringRollingStatus(children: TimelineStep[], active: boolean): string | undefined {
  const [flash, setFlash] = useState<{ toolId: string; label: string } | null>(null);
  const lastFlashedToolIdRef = useRef<string | null>(null);
  const lastTool = useMemo(() => {
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].kind !== 'reasoning') return children[i];
    }
    return undefined;
  }, [children]);
  const runningToolCount = useMemo(
    () => children.filter((s) => s.kind !== 'reasoning' && s.status === 'running').length,
    [children]
  );
  const thinkingLive = useMemo(
    () => children.some((s) => s.kind === 'reasoning' && s.status === 'running'),
    [children]
  );

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
  if (flash?.label) return flash.label;
  if (runningToolCount > 0) return 'Planning next moves';
  if (thinkingLive) return 'Thinking';
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
      className="ak-tool-slide-list ak-explore-scroll"
      style={{
        color: STEPS_MUTED,
        maxHeight: live ? 220 : 320,
        overflowX: 'hidden',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}
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
              style={{ padding: '1px 0' }}
            >
              <button
                type="button"
                className="ak-step-chevron-btn ak-explore-mid-thought__btn"
                aria-expanded={expanded}
                onClick={() => {
                  setOpenThoughtIds((p) => ({ ...p, [s.id]: !expanded }));
                }}
                style={{
                  display: 'flex',
                  gap: 8,
                  width: '100%',
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <span style={{ opacity: 0.7, flexShrink: 0, width: 10 }}>{expanded ? '▾' : '▸'}</span>
                <LiveStepTitle
                  title={title}
                  live={!!thoughtLive}
                  style={{ flex: '0 1 auto', minWidth: 0, fontWeight: thoughtLive ? 500 : 400 }}
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

        return (
          <div
            key={s.id}
            className={live && s.status === 'running' ? 'ak-tool-slide-in ak-tool-row--running' : undefined}
            style={{
              display: 'flex',
              gap: 8,
              padding: '1px 0',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontSize: 11.5
            }}
          >
            <span
              style={{
                opacity: s.status === 'failed' ? 0.95 : 0.5,
                flexShrink: 0,
                color: s.status === 'failed' ? '#f87171' : undefined
              }}
            >
              {s.status === 'failed' ? '✗' : s.status === 'running' ? '›' : '·'}
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
                color: s.status === 'failed' ? '#fca5a5' : undefined
              }}
            >
              {toolRowLabel(s)}
              {s.subtitle ? (
                <span style={{ opacity: 0.75 }}> {formatExploreDetail(s.subtitle)}</span>
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

export function ThoughtRow({ step }: { step: TimelineStep }) {
  const live = step.status === 'running';
  const [open, setOpen] = useState(live);
  const body = (step.body || '').trim();
  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);
  return (
    <ChevronRow
      title={formatThoughtTitle(step, live)}
      expanded={open && (!!body || live)}
      live={live}
      hasError={step.status === 'failed'}
      onToggle={() => setOpen((v) => !v)}
    >
      {body || live ? <ThoughtBody text={body} live={live} /> : null}
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
