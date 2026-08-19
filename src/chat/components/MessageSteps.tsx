import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { FileEditPreviewView } from './FileEditPreviewView';
import { TerminalRunCard } from './TerminalRunCard';
import { StreamingMarkdown } from '../StreamingMarkdown';
import type { FileEditPreview, TerminalRunPreview } from '../types';
import { looksLikeVisibleTurnProse } from '../planPromote';

/**
 * Curiosity phases (Cursor-style):
 *   ▸ Exploring N files…   ← collapsed; rolling status while tools/thoughts run
 *   ▸ Explored N files…    ← settled; expand to see Thought + tool rows
 *   ▸ Thought (main)       ← only when no explore chrome yet
 *
 * Rolling under Exploring:
 *   new file tool → ~500ms activity flash → "Planning next moves" while tools run
 *   Thinking only → "Thinking"
 */

/** Live timeline row while Plan V2 JSON is generated after clarifying questions */
export const PLAN_V2_GENERATE_STEP_ID = 'tl_plan_v2_generate';

export interface MessageStep {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  toolName?: string;
  turn?: number;
  /**
   * Host-declared Thought role (preferred over UI heuristics).
   * opening = main Thought for that agent-loop turn (outside Exploring)
   * mid = rare in-turn Thought nested under Exploring
   */
  thoughtRole?: 'opening' | 'mid';
  itemStatus: 'running' | 'done' | 'error';
  durationMs?: number;
}

type ExploreRow = { type: 'tool' | 'thought' | 'prose'; step: MessageStep };

interface MessageStepsProps {
  steps: MessageStep[];
  /** Edit cards placed after the turn that produced them */
  fileEdits?: FileEditPreview[];
  /** Terminal run cards (Cursor-style expandable shell box) */
  terminalRuns?: TerminalRunPreview[];
  /** Sealed mid-turn assistant prose (between turns) */
  turnProse?: Array<{ id: string; turn: number; content: string }>;
  /**
   * Live assistant prose while streaming — always appended after the full
   * timeline (never inserted above existing steps).
   */
  liveProse?: string;
  liveProseStreaming?: boolean;
  /** Host still running this assistant message */
  isStreaming?: boolean;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
}

type TurnGroup = {
  turn: number;
  steps: MessageStep[];
  live: boolean;
};

const STEPS_FG = 'var(--vscode-descriptionForeground, #9d9d9d)';
const STEPS_LIVE = 'var(--vscode-foreground, #cccccc)';
/** Group header when any tool in the group failed — rose, a bit darker than pink */
const STEPS_ERROR = '#e2556f';
/** Explore/tool list body — opaque muted (never mix with transparent; that looked like a wipe) */
const STEPS_MUTED = 'var(--vscode-descriptionForeground, #9d9d9d)';

/** UI display cap for Thought body (host may send more) */
const THOUGHT_DISPLAY_MAX = 16000;
/** Exploring mid-Thought — keep the nested pane short */
const MID_THOUGHT_DISPLAY_MAX = 900;

function isPlanGenerateStep(s: MessageStep): boolean {
  return (
    s.id === PLAN_V2_GENERATE_STEP_ID ||
    /계획 생성|Creating plan|Created plan|Failed to create plan/.test(s.label || '')
  );
}

function inferTurn(step: MessageStep): number {
  if (typeof step.turn === 'number' && step.turn > 0) return step.turn;
  const m = step.id.match(/(?:thinking|planning|tool|step)[^\d]*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

function isMeta(kind: string): boolean {
  return kind === 'thinking' || kind === 'planning' || kind === 'done' || kind === 'session';
}

/** Explore-class tools (search / read / web / mcp browse) — Cursor "Exploring" */
function isExploreStep(s: MessageStep): boolean {
  if (s.kind === 'searching' || s.kind === 'reading' || s.kind === 'browsing') return true;
  const n = s.toolName || '';
  if (n === 'web_search' || n === 'web_fetch') return true;
  if (n.startsWith('mcp_searxng') || n.includes('web_search')) return true;
  if (n.startsWith('mcp_') && s.kind !== 'editing') return true;
  return false;
}

/** Session chrome (todos / mode) — never show as "Ran a command" */
function isNoiseAction(s: MessageStep): boolean {
  if (s.kind === 'session') return true;
  const n = s.toolName || '';
  return (
    n === 'todo_write' ||
    n === 'switch_mode' ||
    n === 'checkpoint_create' ||
    n === 'checkpoint_restore'
  );
}

function isShellStep(s: MessageStep): boolean {
  const n = s.toolName || '';
  return n === 'run_terminal_cmd' || n === 'terminal_output' || s.kind === 'running';
}

function isActionStep(s: MessageStep): boolean {
  if (isMeta(s.kind)) return false;
  if (isNoiseAction(s)) return false;
  return !isExploreStep(s);
}

function toolSteps(steps: MessageStep[]): MessageStep[] {
  return steps.filter((s) => !isMeta(s.kind));
}

function exploreSteps(steps: MessageStep[]): MessageStep[] {
  return toolSteps(steps).filter(isExploreStep);
}

function actionSteps(steps: MessageStep[]): MessageStep[] {
  return toolSteps(steps).filter(isActionStep);
}

function thoughtWithText(steps: MessageStep[]): MessageStep | undefined {
  const thinking = steps.filter((s) => s.kind === 'thinking');
  const withText = thinking.filter((s) => (s.detail || '').trim().length > 0);
  if (withText.length) return withText[withText.length - 1];
  // Placeholder Thought row while first reasoning tokens arrive
  return thinking.find((s) => s.itemStatus === 'running');
}

/** Still digging after a partial understanding — keep Exploring (do NOT close) */
function looksLikeExploreContinue(text: string): boolean {
  return /let me read (a )?few more|few more key|complete the picture|read the remaining|이어서 읽|더 읽|몇 개 더|나머지 .{0,20}(읽|확인)|추가로 읽|complete my understanding|to complete the/i.test(
    text
  );
}

/** Forward-looking intent (next dig / will write later) — not a settle wrap-up */
function looksLikeExploreStart(text: string): boolean {
  if (looksLikeExploreContinue(text)) return true;
  return /시작하|파악하겠|파악하고\s*있|파악한 뒤|살펴보|탐색하|리서치|읽어보|확인하겠|분석하|작성하겠|작성할|먼저 .{0,40}(읽|파악|탐색|작성)|let me (read|search|explore|check|look|write)|i('ll| will) (read|search|explore|check|start|write)|starting (research|to)|currently (understanding|reading|exploring)|계획을\s*작성하겠/i.test(
    text
  );
}

/** Intent prose that means curiosity settled enough to close → Explored */
function looksLikeExploreSettled(text: string): boolean {
  // Future / continue intent is never a settle
  if (looksLikeExploreContinue(text) || looksLikeExploreStart(text)) return false;
  return /파악했|이해했|확인했|정리하면|충분하|문서화|이제 .{0,40}(작성|구현|수정|문서)|thorough understanding|I (have|now) (a )?(thorough |good )?(understanding|reviewed|read)|enough (context|information)|before writing the plan|next I('ll| will) (write|implement|plan)|계획을\s*작성했|계획\s*문서\s*작성\s*(완료|했)/i.test(
    text
  );
}

function fileBasename(detail?: string): string | undefined {
  if (!detail?.trim()) return undefined;
  const norm = detail.replace(/\\/g, '/').split('/').filter(Boolean);
  const base = norm[norm.length - 1] || detail.trim();
  if (!base || base === '.' || base === '..') return undefined;
  return base.length > 40 ? `${base.slice(0, 38)}…` : base;
}

/** Count explore tools — live "Exploring N files…" or settled "Explored N files…" */
function summarizeExplored(steps: MessageStep[], live = false): string {
  const tools = exploreSteps(steps);
  if (!tools.length) return live ? 'Exploring' : '';
  const prefix = live ? 'Exploring' : 'Explored';
  const errors = tools.filter((s) => s.itemStatus === 'error');
  if (!live && errors.length && !tools.some((s) => s.itemStatus === 'done')) {
    return errors.length === 1
      ? `Failed · ${errors[0].toolName || errors[0].label}`
      : `Failed · ${errors.length} tools`;
  }

  let fileCount = 0;
  let searchCount = 0;
  for (const s of tools) {
    const n = (s.toolName || '').toLowerCase();
    if (n === 'read_file' || n === 'list_dir' || n === 'read_lints') {
      fileCount += 1;
    } else if (n === 'read_files') {
      const m = s.detail?.match(/^(\d+)\s+files?/i);
      fileCount += m ? Number(m[1]) : 1;
    } else if (
      n === 'grep' ||
      n === 'glob' ||
      n === 'file_search' ||
      n === 'codebase_search' ||
      s.kind === 'searching'
    ) {
      searchCount += 1;
    } else if (s.kind === 'reading') {
      fileCount += 1;
    } else {
      // Unknown explore tools still count toward the header total as searches
      searchCount += 1;
    }
  }

  // Cursor-style counts only — never "Explored · ." from a bare path
  if (fileCount && searchCount) {
    return `${prefix} ${fileCount} ${fileCount === 1 ? 'file' : 'files'}, ${searchCount} ${
      searchCount === 1 ? 'search' : 'searches'
    }`;
  }
  if (fileCount) {
    return `${prefix} ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;
  }
  if (searchCount) {
    return `${prefix} ${searchCount} ${searchCount === 1 ? 'search' : 'searches'}`;
  }
  return `${prefix} ${tools.length} ${tools.length === 1 ? 'item' : 'items'}`;
}

/**
 * Rolling line under collapsed Exploring.
 *
 * - New file tool → flash activity ~500ms (e.g. "Reading foo.ts"), then fold into Exploring counts
 * - While file tool(s) still run → "Planning next moves"
 * - While only Thinking runs → "Thinking"
 * - Between tools (waiting on model) → "Planning next moves"
 */
function useExploringRollingStatus(
  rows: ExploreRow[],
  active: boolean
): string | undefined {
  const [flash, setFlash] = useState<{ toolId: string; label: string } | null>(
    null
  );
  const lastFlashedToolIdRef = useRef<string | null>(null);

  const lastTool = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].type === 'tool') return rows[i];
    }
    return undefined;
  }, [rows]);

  const runningToolCount = useMemo(
    () =>
      rows.filter((r) => r.type === 'tool' && r.step.itemStatus === 'running')
        .length,
    [rows]
  );

  const thinkingLive = useMemo(
    () =>
      rows.some(
        (r) => r.type === 'thought' && r.step.itemStatus === 'running'
      ),
    [rows]
  );

  useEffect(() => {
    if (!active) {
      lastFlashedToolIdRef.current = null;
      setFlash(null);
      return;
    }
    if (!lastTool) return;
    const id = lastTool.step.id;
    if (id === lastFlashedToolIdRef.current) return;
    lastFlashedToolIdRef.current = id;
    const label = formatRollingTool({
      ...lastTool.step,
      // Flash always reads as the live verb for the brief window
      itemStatus: 'running'
    });
    setFlash({ toolId: id, label });
    const t = window.setTimeout(() => {
      setFlash((prev) => (prev?.toolId === id ? null : prev));
    }, 500);
    return () => window.clearTimeout(t);
  }, [active, lastTool?.step.id]);

  if (!active) return undefined;
  if (flash?.label) return flash.label;
  if (runningToolCount > 0) return 'Planning next moves';
  if (thinkingLive) return 'Thinking';

  const last = [...rows]
    .reverse()
    .find((r) => r.type === 'tool' || r.type === 'thought');
  if (!last) return 'Planning next moves';
  if (last.type === 'thought') return 'Thinking';
  return 'Planning next moves';
}

/** Collapsed Exploring chrome with timed rolling status */
function ExploringChrome({
  title,
  expanded,
  live,
  hasError,
  rows,
  onToggle,
  children
}: {
  title: string;
  expanded: boolean;
  live: boolean;
  hasError?: boolean;
  rows: ExploreRow[];
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const rollingStatus = useExploringRollingStatus(
    rows,
    !!live && !expanded
  );
  return (
    <ChevronRow
      title={title}
      expanded={expanded}
      live={live}
      hasError={hasError}
      rollingStatus={rollingStatus}
      onToggle={onToggle}
    >
      {children}
    </ChevronRow>
  );
}

function formatRollingTool(s: MessageStep): string {
  const name = (s.toolName || '').toLowerCase();
  const detail = fileBasename(s.detail) || shortPath(s.detail);
  const live = s.itemStatus === 'running';
  let verb: string;
  switch (name) {
    case 'read_file':
    case 'read_files':
      verb = live ? 'Reading' : 'Read';
      break;
    case 'grep':
      verb = live ? 'Grepping' : 'Grepped';
      break;
    case 'glob':
    case 'file_search':
      verb = live ? 'Searching' : 'Searched';
      break;
    case 'list_dir':
      verb = live ? 'Listing' : 'Listed';
      break;
    case 'codebase_search':
      verb = live ? 'Searching codebase' : 'Searched codebase';
      break;
    case 'read_lints':
      verb = live ? 'Checking lints' : 'Checked lints';
      break;
    case 'web_search':
      verb = live ? 'Searching web' : 'Searched web';
      break;
    case 'web_fetch':
      verb = live ? 'Fetching' : 'Fetched';
      break;
    default:
      if (s.kind === 'reading') verb = live ? 'Reading' : 'Read';
      else if (s.kind === 'searching') verb = live ? 'Searching' : 'Searched';
      else verb = live ? 'Working' : toolRowLabel(s);
  }
  return detail ? `${verb} ${detail}` : verb;
}

function summarizeActions(steps: MessageStep[]): string {
  const tools = actionSteps(steps);
  if (!tools.length) return '';
  const edits = tools.filter((s) => s.kind === 'editing');
  const runs = tools.filter((s) => isShellStep(s));
  const asks = tools.filter((s) => s.kind === 'asking');
  if (edits.length) {
    if (edits.every((s) => s.itemStatus === 'error')) {
      return edits.length === 1
        ? 'Edit attempted'
        : `Edit attempted · ${edits.length}`;
    }
    if (edits.some((s) => s.itemStatus === 'running')) {
      return 'Editing';
    }
    return edits.length === 1 ? 'Edited 1 file' : `Edited ${edits.length} files`;
  }
  if (runs.length) {
    return runs.length === 1 ? 'Ran a command' : `Ran ${runs.length} commands`;
  }
  if (asks.length) return 'Asked a question';
  return tools.length === 1 ? 'Used 1 tool' : `Used ${tools.length} tools`;
}

function formatThoughtTitle(th: MessageStep, live: boolean): string {
  if (isPlanGenerateStep(th)) {
    if (live && th.itemStatus === 'running') return 'Creating plan';
    if (th.itemStatus === 'error') return 'Failed to create plan';
    return 'Created plan';
  }
  if (live && th.itemStatus === 'running') return 'Thinking';
  const ms = th.durationMs;
  if (ms != null && ms >= 1000) {
    return `Thought for ${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  }
  return 'Thought briefly';
}

function formatMs(ms?: number): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortPath(detail?: string): string {
  if (!detail) return '';
  const parts = detail.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return detail;
  return `…/${parts.slice(-2).join('/')}`;
}

/** Cursor-style verb for explore/action rows (Read / Grepped / …) */
function toolRowLabel(s: MessageStep): string {
  const name = (s.toolName || s.label.replace(/\s*·.*$/, '') || '').toLowerCase();
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
    case 'edit_file':
      return 'Edited';
    case 'write_file':
      return 'Wrote';
    case 'delete_file':
      return 'Deleted';
    case 'run_terminal_cmd':
    case 'terminal_output':
      return 'Ran';
    case 'ask_question':
      return 'Asked';
    case 'todo_write':
      return 'Updated todos';
    case 'task_run':
      return 'Ran task';
    case 'skill_run':
      return 'Ran skill';
    case 'switch_mode':
      return 'Switched mode';
    default:
      if (s.kind === 'reading') return 'Read';
      if (s.kind === 'searching') return 'Searched';
      if (s.kind === 'editing') return 'Edited';
      if (isShellStep(s)) return 'Ran';
      if (s.kind === 'task') return 'Used';
      return s.toolName || name || 'Tool';
  }
}

/** Keep last N, prefer showing running items */
function liveTail(details: MessageStep[], max = 6): MessageStep[] {
  if (details.length <= max) return details;
  const running = details.filter((s) => s.itemStatus === 'running');
  const rest = details.filter((s) => s.itemStatus !== 'running');
  const recent = rest.slice(-(max - Math.min(running.length, 2)));
  return [...recent, ...running].slice(-max);
}

function ThoughtBody({
  text,
  live,
  compact
}: {
  text: string;
  live: boolean;
  /** Nested under Exploring — tighter clip */
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const max = compact ? MID_THOUGHT_DISPLAY_MAX : THOUGHT_DISPLAY_MAX;
  const display =
    text.length > max ? `${text.slice(0, max)}…` : text;

  useEffect(() => {
    const el = ref.current;
    if (!el || !live || !stickRef.current) return;
    // Keep following new tokens while user hasn't scrolled up
    el.scrollTop = el.scrollHeight;
  }, [display, live]);

  return (
    <div
      ref={ref}
      className={`message-steps-thought-body${
        compact ? ' message-steps-thought-body--mid' : ''
      }`}
      onScroll={() => {
        const el = ref.current;
        if (!el) return;
        const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickRef.current = gap < 48;
      }}
      onWheel={(e) => {
        // Don't let the parent message-list steal the wheel
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
  /** Any tool in this group failed */
  hasError?: boolean;
  /** Collapsed + live: one-line activity under the header (Cursor Exploring) */
  rollingStatus?: string;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const titleColor = hasError ? STEPS_ERROR : live ? undefined : STEPS_FG;
  const showRolling = !expanded && !!live && !!rollingStatus?.trim();
  // Shimmer belongs on the rolling activity line (e.g. Thinking), not "Exploring N files…"
  const shimmerHeader = !!live && !hasError && rollingStatus == null;
  return (
    <div
      className={[
        'ak-step-row',
        live ? 'ak-step-row--live' : '',
        hasError ? 'ak-step-row--error' : ''
      ]
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
        style={{
          cursor: live && !children ? 'default' : 'pointer'
        }}
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
            ...(!shimmerHeader && live && !hasError
              ? { color: STEPS_FG }
              : null)
          }}
        />
      </button>
      {showRolling ? (
        <div
          key={rollingStatus}
          className="ak-step-rolling ak-step-rolling--live"
          aria-live="polite"
        >
          <LiveStepTitle title={rollingStatus!} live />
        </div>
      ) : null}
      {expanded ? children : null}
    </div>
  );
}

/**
 * Live Exploring/Thinking label: opaque base glyphs + moving highlight.
 * Never puts transparent fill on the readable text (webview-safe).
 */
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
      <span
        className={['ak-step-title', className].filter(Boolean).join(' ')}
        style={style}
      >
        {title}
      </span>
    );
  }
  return (
    <span
      className={[
        'ak-step-title',
        'ak-step-title--live-shimmer',
        className
      ]
        .filter(Boolean)
        .join(' ')}
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

/** ADDON-T09: task_run detail carries a lifecycle word — render as a small status pill */
const TASK_STATUS_WORDS = new Set([
  'running',
  'completed',
  'error',
  'timeout',
  'cancelled'
]);

function taskStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return '#22c55e';
    case 'timeout':
    case 'cancelled':
      return '#f59e0b';
    case 'error':
      return '#f87171';
    default:
      return STEPS_LIVE;
  }
}

function TaskStatusBadge({ status }: { status: string }) {
  const color = taskStatusColor(status);
  return (
    <span
      style={{
        marginLeft: 6,
        padding: '0 6px',
        borderRadius: 8,
        fontSize: 10,
        opacity: 0.9,
        border: `1px solid ${color}`,
        color
      }}
    >
      {status}
    </span>
  );
}

function formatExploreDetail(detail?: string): string {
  if (!detail) return '';
  // Already Cursor-formatted ("pattern in path", "file.ts L10-20")
  if (/\sin\s/.test(detail) || /\sL\d/.test(detail)) {
    return detail.length > 100 ? `${detail.slice(0, 97)}…` : detail;
  }
  return shortPath(detail);
}

function ToolSlideList({
  items,
  live,
  maxHeight
}: {
  items: MessageStep[];
  live: boolean;
  maxHeight: number;
}) {
  return (
    <div
      className="ak-tool-slide-list"
      style={{
        color: STEPS_MUTED,
        maxHeight,
        overflow: 'hidden'
      }}
    >
      {items.map((s) => (
        <div
          key={s.id}
          className={
            live && s.itemStatus === 'running'
              ? 'ak-tool-slide-in ak-tool-row--running'
              : undefined
          }
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
              opacity: s.itemStatus === 'error' ? 0.95 : 0.5,
              flexShrink: 0,
              color: s.itemStatus === 'error' ? '#f87171' : undefined
            }}
            title={s.itemStatus === 'error' ? s.detail || 'failed' : undefined}
          >
            {s.itemStatus === 'error' ? '✗' : s.itemStatus === 'running' ? '›' : '·'}
          </span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              color: s.itemStatus === 'error' ? '#fca5a5' : undefined
            }}
          >
            {toolRowLabel(s)}
            {s.toolName === 'task_run' && s.detail && TASK_STATUS_WORDS.has(s.detail) ? (
              <TaskStatusBadge status={s.detail} />
            ) : s.detail ? (
              <span style={{ opacity: 0.75 }}>
                {' '}
                {s.itemStatus === 'error' ? s.detail : formatExploreDetail(s.detail)}
              </span>
            ) : null}
          </span>
          {s.itemStatus === 'running' ? (
            <span className="ak-live-blink ak-live-blink--sm" aria-hidden>
              <span className="ak-live-blink__dot" />
            </span>
          ) : s.durationMs != null ? (
            <span style={{ opacity: 0.4, flexShrink: 0 }}>{formatMs(s.durationMs)}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Cursor Explored body: Grepped / Read / Thought / intent prose interleaved */
function ExploreStreamList({
  rows,
  live,
  maxHeight
}: {
  rows: Array<{ type: 'tool' | 'thought' | 'prose'; step: MessageStep }>;
  live: boolean;
  maxHeight: number;
}) {
  const [openThoughtIds, setOpenThoughtIds] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !live || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [rows, live]);

  return (
    <div
      ref={listRef}
      className="ak-tool-slide-list ak-explore-scroll"
      style={{
        color: STEPS_MUTED,
        maxHeight,
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
        // Keep wheel inside Exploring list — don't scroll the whole chat away
        e.stopPropagation();
      }}
    >
      {rows.map((row) => {
        const s = row.step;
        if (row.type === 'prose') {
          // Legacy sealed asides — show as nested Thought, not bare markdown
          const text = (s.detail || '').trim();
          if (!text) return null;
          const thoughtLive = live && s.itemStatus === 'running';
          const title = formatThoughtTitle(
            { ...s, kind: 'thinking', label: 'Thought' },
            thoughtLive
          );
          const expanded =
            thoughtLive || (openThoughtIds[s.id] ?? false);
          return (
            <div
              key={`prose-${s.id}`}
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
                  setOpenThoughtIds((p) => ({
                    ...p,
                    [s.id]: !expanded
                  }));
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
                <span style={{ opacity: 0.7, flexShrink: 0, width: 10 }}>
                  {expanded ? '▾' : '▸'}
                </span>
                <LiveStepTitle
                  title={title}
                  live={!!thoughtLive}
                  style={{
                    flex: '0 1 auto',
                    minWidth: 0,
                    fontWeight: thoughtLive ? 500 : 400
                  }}
                />
              </button>
              {expanded ? (
                <div className="ak-explore-nested-thought">
                  <ThoughtBody text={text} live={!!thoughtLive} compact />
                </div>
              ) : null}
            </div>
          );
        }
        if (row.type === 'thought') {
          const thoughtLive = live && s.itemStatus === 'running';
          const title = formatThoughtTitle(s, thoughtLive);
          const body = (s.detail || '').trim();
          const expanded =
            thoughtLive || (openThoughtIds[s.id] ?? false);
          return (
            <div
              key={`th-${s.id}`}
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
                aria-busy={thoughtLive || undefined}
                onClick={() => {
                  if (!body && !thoughtLive) return;
                  setOpenThoughtIds((p) => ({
                    ...p,
                    [s.id]: !expanded
                  }));
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
                  cursor: body || thoughtLive ? 'pointer' : 'default',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  overflow: thoughtLive ? 'visible' : 'hidden'
                }}
              >
                <span style={{ opacity: 0.7, flexShrink: 0, width: 10 }}>
                  {body || thoughtLive ? (expanded ? '▾' : '▸') : '·'}
                </span>
                <LiveStepTitle
                  title={title}
                  live={!!thoughtLive}
                  style={{
                    overflow: thoughtLive ? 'visible' : 'hidden',
                    textOverflow: thoughtLive ? 'clip' : 'ellipsis',
                    flex: thoughtLive ? '0 0 auto' : '0 1 auto',
                    minWidth: thoughtLive ? 'max-content' : 0,
                    fontWeight: thoughtLive ? 500 : 400
                  }}
                />
              </button>
              {expanded && (body || thoughtLive) ? (
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
            className={
              live && s.itemStatus === 'running'
                ? 'ak-tool-slide-in ak-tool-row--running'
                : undefined
            }
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
                opacity: s.itemStatus === 'error' ? 0.95 : 0.5,
                flexShrink: 0,
                width: 10,
                color: s.itemStatus === 'error' ? '#f87171' : undefined
              }}
            >
              {s.itemStatus === 'error' ? '✗' : s.itemStatus === 'running' ? '›' : '·'}
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
                color: s.itemStatus === 'error' ? '#fca5a5' : undefined
              }}
            >
              {toolRowLabel(s)}
              {s.detail ? (
                <span style={{ opacity: 0.75 }}>
                  {' '}
                  {s.itemStatus === 'error' ? s.detail : formatExploreDetail(s.detail)}
                </span>
              ) : null}
            </span>
            {s.itemStatus === 'running' ? (
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

export function MessageSteps({
  steps,
  fileEdits = [],
  terminalRuns = [],
  turnProse = [],
  liveProse,
  liveProseStreaming,
  isStreaming = false,
  onOpenFile,
  onAcceptFile,
  onRejectFile
}: MessageStepsProps) {
  const groups = useMemo(() => {
    const map = new Map<number, MessageStep[]>();
    let maxOther = 0;
    for (const s of steps) {
      if (isPlanGenerateStep(s)) continue;
      maxOther = Math.max(maxOther, inferTurn(s));
    }
    for (const s of steps) {
      const t = isPlanGenerateStep(s)
        ? typeof s.turn === 'number' && s.turn > maxOther
          ? s.turn
          : maxOther + 1
        : inferTurn(s);
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(s);
    }
    const raw = [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([turn, list]) => ({
        turn,
        steps: list,
        hasRunning: list.some((x) => x.itemStatus === 'running')
      }));
    const latestLive = [...raw].reverse().find((g) => g.hasRunning)?.turn ?? -1;
    return raw.map(
      (g): TurnGroup => ({
        turn: g.turn,
        steps: g.steps,
        live: g.turn === latestLive
      })
    );
  }, [steps]);

  const proseByTurn = useMemo(() => {
    const map = new Map<number, Array<{ id: string; turn: number; content: string }>>();
    for (const p of turnProse) {
      const t = typeof p.turn === 'number' && p.turn > 0 ? p.turn : 1;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(p);
    }
    return map;
  }, [turnProse]);

  const [openThought, setOpenThought] = useState<Record<string, boolean>>({});
  const [openExplore, setOpenExplore] = useState<Record<string, boolean>>({});
  const [openAction, setOpenAction] = useState<Record<string, boolean>>({});
  const wasLiveRef = React.useRef<Record<string, boolean>>({});

  type CuriosityPhase = {
    id: string;
    openingThought?: MessageStep;
    /** Intent right after opening Thought, before Exploring tools */
    leadProse: Array<{ id: string; content: string }>;
    rows: ExploreRow[];
    /** Settled wrap-up after Explored closes */
    proseAfter: Array<{ id: string; content: string }>;
    /** Curiosity from opening Thought answered → Explored; else Exploring */
    resolved: boolean;
    actions: MessageStep[];
  };

  const phases = useMemo((): CuriosityPhase[] => {
    const out: CuriosityPhase[] = [];
    let cur: CuriosityPhase | null = null;
    const turns = [...groups].sort((a, b) => a.turn - b.turn);

    const startPhase = (opening?: MessageStep): CuriosityPhase => {
      const p: CuriosityPhase = {
        id: `phase_${out.length + 1}`,
        openingThought: opening,
        leadProse: [],
        rows: [],
        proseAfter: [],
        resolved: false,
        actions: []
      };
      out.push(p);
      return p;
    };

    const hasExploreTools = (p: CuriosityPhase) =>
      p.rows.some((r) => r.type === 'tool');

    const closeExplore = () => {
      if (cur && !cur.resolved && hasExploreTools(cur)) cur.resolved = true;
    };

    for (const g of turns) {
      const notes = proseByTurn.get(g.turn) || [];
      const list = g.steps;
      let notesConsumed = false;

      const consumeNotes = () => {
        if (notesConsumed) return;
        notesConsumed = true;
        if (!cur) cur = startPhase(undefined);

        const foldAsideIntoThought = (noteId: string, text: string) => {
          if (cur!.openingThought) {
            const prev = String(cur!.openingThought.detail || '').trim();
            if (prev.includes(text)) return;
            cur!.openingThought = {
              ...cur!.openingThought,
              detail: prev ? `${prev}\n\n${text}` : text
            };
            return;
          }
          if (hasExploreTools(cur!) && !cur!.resolved) {
            cur!.rows.push({
              type: 'thought',
              step: {
                id: noteId,
                kind: 'thinking',
                label: 'Thought',
                detail: text,
                itemStatus: 'done',
                thoughtRole: 'mid'
              }
            });
            return;
          }
          cur!.openingThought = {
            id: noteId,
            kind: 'thinking',
            label: 'Thought',
            detail: text,
            itemStatus: 'done',
            thoughtRole: 'opening'
          };
        };

        for (const note of notes) {
          const text = String(note.content || '').trim();
          if (!text) continue;
          const payload = { id: note.id, content: text };
          const digIntent =
            looksLikeExploreStart(text) || looksLikeExploreContinue(text);

          // Plan markdown / long structured prose: keep visible, never fold into Thought
          if (looksLikeVisibleTurnProse(text)) {
            if (hasExploreTools(cur) && !cur.resolved) {
              cur.resolved = true;
              cur.proseAfter.push(payload);
            } else {
              cur.leadProse.push(payload);
            }
            continue;
          }

          if (looksLikeExploreSettled(text) && hasExploreTools(cur)) {
            cur.resolved = true;
            cur.proseAfter.push(payload);
            continue;
          }

          // After Explored: next dig ack is visible lead
          if (cur.resolved && digIntent) {
            cur = startPhase(undefined);
            cur.leadProse.push(payload);
            continue;
          }

          // Still Exploring (incl. between tool batches): self-talk → Thought
          if (hasExploreTools(cur) && !cur.resolved) {
            foldAsideIntoThought(note.id, text);
            continue;
          }

          if (cur.actions.length > 0) {
            cur.proseAfter.push(payload);
          } else {
            cur.leadProse.push(payload);
          }
        }
      };

      for (const s of list) {
        if (s.kind === 'planning' || s.kind === 'done') continue;

        if (s.kind === 'thinking') {
          const text = (s.detail || '').trim();
          const live = s.itemStatus === 'running';
          if (!text && !live) continue;

          // Same Thought id streaming/status after Edited — update in place.
          // Never spawn a new phase that parks Thought *below* its own edits.
          if (s.id) {
            const owned = out.find((p) => p.openingThought?.id === s.id);
            if (owned) {
              owned.openingThought = { ...s, thoughtRole: 'opening' };
              cur = owned;
              continue;
            }
            const midIdx = out.findIndex((p) =>
              p.rows.some(
                (r) => r.type === 'thought' && r.step.id === s.id
              )
            );
            if (midIdx >= 0) {
              const phase = out[midIdx];
              phase.rows = phase.rows.map((r) =>
                r.type === 'thought' && r.step.id === s.id
                  ? { type: 'thought' as const, step: { ...s, thoughtRole: 'mid' as const } }
                  : r
              );
              cur = phase;
              continue;
            }
          }

          if (!cur || cur.resolved || cur.actions.length > 0) {
            // After Explored or after Edited/Ran: *new* Thought id starts a new dig
            cur = startPhase({ ...s, thoughtRole: 'opening' });
          } else if (hasExploreTools(cur) && !cur.resolved) {
            // Still Exploring: Thought stays inside and drives the next tools
            cur.rows.push({
              type: 'thought',
              step: { ...s, thoughtRole: 'mid' }
            });
          } else if (
            cur.openingThought &&
            cur.openingThought.id &&
            s.id &&
            cur.openingThought.id !== s.id
          ) {
            // Consecutive main Thoughts (no tools between) — never overwrite
            cur = startPhase({ ...s, thoughtRole: 'opening' });
          } else {
            // Same Thought id streaming / status update
            cur.openingThought = { ...s, thoughtRole: 'opening' };
          }
          continue;
        }

        if (isExploreStep(s)) {
          // Edit/Ran already in this phase → don't hoist later reads above Edited
          if (cur && cur.actions.length > 0) {
            consumeNotes();
            cur = startPhase(undefined);
          } else {
            consumeNotes();
            if (!cur || cur.resolved) cur = startPhase(undefined);
          }
          cur.rows.push({ type: 'tool', step: s });
          continue;
        }

        if (isActionStep(s)) {
          closeExplore();
          if (!cur || cur.resolved) cur = startPhase(undefined);
          // Push action first so subsequent note routing sees actions.length
          cur.actions.push(s);
          continue;
        }
      }

      consumeNotes();
    }

    if (liveProse?.trim() && cur && !cur.resolved && hasExploreTools(cur)) {
      if (
        looksLikeExploreSettled(liveProse) &&
        !looksLikeExploreContinue(liveProse) &&
        !looksLikeExploreStart(liveProse)
      ) {
        cur.resolved = true;
      }
    }

    if (!isStreaming) {
      const anyRunning = steps.some(
        (s) =>
          s.itemStatus === 'running' &&
          (s.kind === 'thinking' || isExploreStep(s) || isActionStep(s))
      );
      if (!anyRunning && cur && !cur.resolved && hasExploreTools(cur)) {
        cur.resolved = true;
      }
    }

    return out;
  }, [groups, proseByTurn, steps, liveProse, isStreaming]);

  /**
   * Attach file/terminal cards to the phase that owns the matching action
   * (Edited → diffs, Ran → terminal) — not the Explored dig that shares a turn.
   * Each card renders once.
   */
  const cardsByPhase = useMemo(() => {
    const edits = new Map<string, FileEditPreview[]>();
    const terms = new Map<string, TerminalRunPreview[]>();
    for (const p of phases) {
      edits.set(p.id, []);
      terms.set(p.id, []);
    }
    const usedEdit = new Set<string>();
    const usedTerm = new Set<string>();

    const scorePhaseForEdit = (p: CuriosityPhase, turn: number): number => {
      const hasEditAction = p.actions.some(
        (a) =>
          a.kind === 'editing' &&
          (inferTurn(a) === turn ||
            a.toolName === 'edit_file' ||
            a.toolName === 'write_file' ||
            a.toolName === 'delete_file')
      );
      const hasAnyAction = p.actions.some((a) => inferTurn(a) === turn);
      const hasExplore = p.rows.some(
        (r) => r.type === 'tool' && inferTurn(r.step) === turn
      );
      if (hasEditAction) return 100;
      if (hasAnyAction) return 60;
      if (hasExplore) return 20;
      return 0;
    };

    const scorePhaseForTerm = (p: CuriosityPhase, turn: number): number => {
      const isShell = (a: MessageStep) =>
        a.kind === 'running' ||
        a.toolName === 'run_terminal_cmd' ||
        a.toolName === 'terminal_output';
      const hasRunOnTurn = p.actions.some((a) => isShell(a) && inferTurn(a) === turn);
      const hasRun = p.actions.some(isShell);
      const hasAnyAction = p.actions.some((a) => inferTurn(a) === turn);
      const hasExplore = p.rows.some(
        (r) => r.type === 'tool' && inferTurn(r.step) === turn
      );
      if (hasRunOnTurn) return 100;
      if (hasRun && hasAnyAction) return 80;
      if (hasRun) return 55;
      if (hasAnyAction) return 40;
      if (hasExplore) return 10;
      return 0;
    };

    const pickPhase = (
      turn: number,
      score: (p: CuriosityPhase, turn: number) => number
    ): CuriosityPhase | null => {
      let best: CuriosityPhase | null = null;
      let bestScore = -1;
      for (const p of phases) {
        const s = score(p, turn);
        if (s > bestScore) {
          bestScore = s;
          best = p;
        }
      }
      if (bestScore <= 0) {
        // Prefer last phase that has actions; else last phase
        return (
          [...phases].reverse().find((p) => p.actions.length > 0) ||
          phases[phases.length - 1] ||
          null
        );
      }
      return best;
    };

    for (const fe of fileEdits) {
      if (!fe?.id || usedEdit.has(fe.id)) continue;
      const turn = typeof fe.turn === 'number' && fe.turn > 0 ? fe.turn : 0;
      const feNorm = (fe.absPath || fe.path || '').replace(/\\/g, '/');
      const feRel = (fe.path || '').replace(/\\/g, '/');
      const base =
        feNorm.split('/').filter(Boolean).pop() || feRel.split('/').pop() || '';

      // Score phases by path specificity — basename-only is last resort
      // (many crates share Cargo.toml; never pin every card to the first match).
      let pathPhase: CuriosityPhase | null = null;
      let pathScore = -1;
      for (const p of phases) {
        for (const a of p.actions) {
          if (a.kind !== 'editing') continue;
          const d = `${a.detail || ''} ${a.label || ''}`.replace(/\\/g, '/');
          let score = 0;
          if (feNorm && d.includes(feNorm)) score = 100;
          else if (feRel && feRel.includes('/') && d.includes(feRel)) score = 90;
          else if (base && d.includes(base)) {
            // Basename hit — only strong if this base is unique among edit actions
            const baseHits = phases.reduce((n, ph) => {
              return (
                n +
                ph.actions.filter((x) => {
                  if (x.kind !== 'editing') return false;
                  const xd = `${x.detail || ''} ${x.label || ''}`;
                  return xd.includes(base);
                }).length
              );
            }, 0);
            score = baseHits <= 1 ? 50 : 15;
          }
          if (score > pathScore) {
            pathScore = score;
            pathPhase = p;
          }
        }
      }
      if (pathScore < 40) pathPhase = null;

      const phase =
        pathPhase ||
        (turn > 0
          ? pickPhase(turn, scorePhaseForEdit)
          : [...phases].reverse().find((p) => p.actions.some((a) => a.kind === 'editing')) ||
            phases[phases.length - 1] ||
            null);
      if (!phase) continue;
      usedEdit.add(fe.id);
      // Dedupe identical path under the same phase (double-posted file.edit)
      const bucket = edits.get(phase.id)!;
      const dupIdx = bucket.findIndex((x) => {
        const xn = (x.absPath || x.path || '').replace(/\\/g, '/');
        return xn === feNorm && xn.length > 0;
      });
      if (dupIdx >= 0) bucket[dupIdx] = fe;
      else bucket.push(fe);
    }

    for (const tr of terminalRuns) {
      if (usedTerm.has(tr.id)) continue;
      const turn = typeof tr.turn === 'number' && tr.turn > 0 ? tr.turn : 0;
      const phase =
        turn > 0
          ? pickPhase(turn, scorePhaseForTerm)
          : [...phases].reverse().find((p) =>
              p.actions.some(
                (a) => a.kind === 'running' || a.toolName === 'run_terminal_cmd'
              )
            ) ||
            phases[phases.length - 1] ||
            null;
      if (!phase) continue;
      usedTerm.add(tr.id);
      terms.get(phase.id)!.push(tr);
    }

    return { edits, terms };
  }, [phases, fileEdits, terminalRuns]);

  useEffect(() => {
    setOpenThought((prev) => {
      const next = { ...prev };
      for (const p of phases) {
        const id = p.id;
        const live =
          p.openingThought?.itemStatus === 'running' &&
          !p.rows.some((r) => r.step.itemStatus === 'running');
        const was = wasLiveRef.current[id];
        if (live) next[id] = true;
        else if (was === true) next[id] = false;
        else if (next[id] === undefined) next[id] = false;
      }
      return next;
    });
    setOpenExplore((prev) => {
      const next = { ...prev };
      for (const p of phases) {
        const id = p.id;
        const hasTools = p.rows.some((r) => r.type === 'tool');
        // Exploring chrome is live while unresolved with tools — stay collapsed by default.
        // Only auto-collapse when Exploring → Explored (falling edge); never force-open.
        const chromeLive = !p.resolved && hasTools;
        const was = wasLiveRef.current[`ex_${id}`];
        if (was === true && !chromeLive) next[id] = false;
        else if (next[id] === undefined) next[id] = false;
        wasLiveRef.current[`ex_${id}`] = chromeLive;
        wasLiveRef.current[id] =
          p.openingThought?.itemStatus === 'running' ||
          p.rows.some(
            (r) =>
              (r.type === 'tool' || r.type === 'thought') &&
              r.step.itemStatus === 'running'
          ) ||
          chromeLive;
      }
      return next;
    });
    setOpenAction((prev) => {
      const next = { ...prev };
      for (const p of phases) {
        const id = p.id;
        const actionLive = p.actions.some((a) => a.itemStatus === 'running');
        if (actionLive) next[id] = true;
        else if (next[id] === undefined) next[id] = false;
      }
      return next;
    });
  }, [phases]);

  if (!phases.length && !groups.length) return null;

  const showLiveProse = Boolean(liveProse?.trim());

  // Any live chrome still running in the last phase?
  const lastPhase = phases[phases.length - 1];
  const timelineBusy = Boolean(
    isStreaming &&
      lastPhase &&
      (lastPhase.openingThought?.itemStatus === 'running' ||
        lastPhase.rows.some((r) => r.step.itemStatus === 'running') ||
        lastPhase.actions.some((a) => a.itemStatus === 'running') ||
        (!lastPhase.resolved && lastPhase.rows.some((r) => r.type === 'tool')))
  );
  const showPlanningTail =
    Boolean(isStreaming) && !showLiveProse && !timelineBusy;
  const planGenRunning = steps.some(
    (s) => isPlanGenerateStep(s) && s.itemStatus === 'running'
  );
  const planningTailTitle = planGenRunning ? 'Creating plan' : 'Planning next moves';

  return (
    <div
      className="message-steps"
      style={{
        margin: '4px 0 10px',
        fontSize: 12,
        lineHeight: 1.45,
        fontFamily: 'var(--vscode-font-family)',
        width: '100%',
        maxWidth: '100%'
      }}
    >
      {phases.map((p, phaseIdx) => {
        const tools = p.rows.filter((r) => r.type === 'tool').map((r) => r.step);
        const exploreSummary = summarizeExplored(tools, false);
        const exploringSummary = summarizeExplored(tools, true);
        const exploreHasError =
          tools.some((t) => t.itemStatus === 'error') &&
          !tools.some((t) => t.itemStatus === 'done' || t.itemStatus === 'running');
        const exploreLive = tools.some((t) => t.itemStatus === 'running');
        const midThoughtLive = p.rows.some(
          (r) => r.type === 'thought' && r.step.itemStatus === 'running'
        );
        const isLast = phaseIdx === phases.length - 1;
        const showExplore =
          tools.length > 0 || p.rows.some((r) => r.type === 'thought');
        const openingInExplore =
          !!p.openingThought &&
          showExplore &&
          p.openingThought.itemStatus === 'running';
        const exploreBlink = exploreLive || midThoughtLive || openingInExplore;
        const isExploring = !p.resolved && tools.length > 0;
        const exploreChromeLive =
          isExploring && (exploreBlink || (Boolean(isStreaming) && isLast));

        const th = p.openingThought;
        const reasoning = (th?.detail || '').trim();
        const thoughtLive =
          !!th &&
          th.itemStatus === 'running' &&
          !exploreLive &&
          !midThoughtLive &&
          !showExplore;
        const showThought =
          Boolean(th) &&
          (Boolean(reasoning) || thoughtLive) &&
          !showExplore;
        const actions = p.actions;
        const actionLive = actions.some((a) => a.itemStatus === 'running');
        const actionHasError = actions.some((a) => a.itemStatus === 'error');
        const actionSummary = summarizeActions(actions);

        const thoughtExpanded =
          (thoughtLive && !(th && isPlanGenerateStep(th))) ||
          (openThought[p.id] ?? false);
        const exploreExpanded = openExplore[p.id] ?? false;
        const actionExpanded = actionLive || (openAction[p.id] ?? false);

        const exploreDisplayRows: ExploreRow[] = (() => {
          const base = isExploring
            ? p.rows.slice(-Math.max(10, liveTail(tools, 8).length + 4))
            : p.rows;
          if (!th || !showExplore) return base;
          if (base.some((r) => r.type === 'thought' && r.step.id === th.id)) {
            return base;
          }
          return [{ type: 'thought' as const, step: th }, ...base];
        })();

        const turnEdits = cardsByPhase.edits.get(p.id) || [];
        const turnTerms = cardsByPhase.terms.get(p.id) || [];

        return (
          <Fragment key={p.id}>
            <div
              className="message-steps-turn"
              style={{
                marginBottom: p.proseAfter.length ? 2 : 6,
                paddingBottom: 2
              }}
            >
              {showThought && th ? (
                <ChevronRow
                  title={formatThoughtTitle(th, thoughtLive)}
                  expanded={thoughtExpanded}
                  live={!!thoughtLive}
                  onToggle={() =>
                    setOpenThought((prev) => ({
                      ...prev,
                      [p.id]: !thoughtExpanded
                    }))
                  }
                >
                  <ThoughtBody text={reasoning} live={!!thoughtLive} />
                </ChevronRow>
              ) : null}

              {p.leadProse.map((note) => (
                <div
                  key={note.id}
                  className="message-content message-turn-prose"
                >
                  <StreamingMarkdown
                    content={note.content}
                    isStreaming={false}
                  />
                </div>
              ))}

              {showExplore ? (
                <ExploringChrome
                  title={
                    isExploring
                      ? exploringSummary || 'Exploring'
                      : exploreSummary || 'Explored'
                  }
                  expanded={exploreExpanded && exploreDisplayRows.length > 0}
                  live={!!exploreChromeLive}
                  hasError={exploreHasError}
                  rows={
                    th && showExplore
                      ? [{ type: 'thought' as const, step: th }, ...p.rows]
                      : p.rows
                  }
                  onToggle={() =>
                    setOpenExplore((prev) => ({
                      ...prev,
                      [p.id]: !exploreExpanded
                    }))
                  }
                >
                  {exploreDisplayRows.length > 0 ? (
                    <ExploreStreamList
                      rows={exploreDisplayRows}
                      live={!!exploreChromeLive}
                      maxHeight={exploreChromeLive ? 280 : 360}
                    />
                  ) : null}
                </ExploringChrome>
              ) : null}

              {actions.length > 0 ? (
                <ChevronRow
                  title={
                    actionLive
                      ? actions.some(
                          (a) =>
                            a.kind === 'editing' && a.itemStatus === 'running'
                        )
                        ? 'Editing'
                        : actions.find((a) => a.itemStatus === 'running')
                            ?.toolName || 'Working'
                      : actionSummary || 'Done'
                  }
                  expanded={actionExpanded}
                  live={!!actionLive}
                  hasError={actionHasError}
                  onToggle={() =>
                    setOpenAction((prev) => ({
                      ...prev,
                      [p.id]: !actionExpanded
                    }))
                  }
                >
                  <ToolSlideList
                    items={actionLive ? liveTail(actions) : actions}
                    live={!!actionLive}
                    maxHeight={actionLive ? 72 : 140}
                  />
                </ChevronRow>
              ) : null}

              {turnEdits.length > 0 ? (
                <div className="ak-file-edits-inline ak-cards-under-action">
                  {turnEdits.map((fe) => (
                    <FileEditPreviewView
                      key={fe.id}
                      file={fe}
                      onOpenFile={onOpenFile}
                      onAccept={onAcceptFile}
                      onReject={onRejectFile}
                    />
                  ))}
                </div>
              ) : null}

              {turnTerms.length > 0 ? (
                <div className="ak-terminal-runs-inline ak-cards-under-action">
                  {turnTerms.map((tr) => (
                    <TerminalRunCard key={tr.id} {...tr} />
                  ))}
                </div>
              ) : null}

              {p.proseAfter.map((note) => (
                <div
                  key={note.id}
                  className="message-content message-turn-prose"
                >
                  <StreamingMarkdown
                    content={note.content}
                    isStreaming={false}
                  />
                </div>
              ))}
            </div>
          </Fragment>
        );
      })}

      {/* Chronological tail only — never inject above earlier steps */}
      {!phases.length && isStreaming && !showLiveProse ? (
        <ChevronRow
          title={planningTailTitle}
          expanded={false}
          live
          onToggle={() => {}}
        />
      ) : null}

      {phases.length > 0 && showPlanningTail ? (
        <ChevronRow
          title={planningTailTitle}
          expanded={false}
          live
          onToggle={() => {}}
        />
      ) : null}

      {showLiveProse ? (
        <div className="message-content message-turn-prose message-turn-prose--live">
          <StreamingMarkdown
            content={liveProse!}
            isStreaming={!!liveProseStreaming}
          />
        </div>
      ) : null}
    </div>
  );
}

