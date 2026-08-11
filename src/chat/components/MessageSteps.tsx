import React, { useEffect, useMemo, useState } from 'react';
import { FileEditCard } from './FileEditCard';
import { TerminalRunCard } from './TerminalRunCard';
import { StreamingMarkdown } from '../StreamingMarkdown';
import type { FileEditPreview, TerminalRunPreview } from '../types';

/**
 * Cursor-style agent timeline.
 *
 * Rules:
 * - Render structured steps in arrival order (no natural-language heuristics).
 * - Group consecutive explore tools into Exploring / Explored.
 * - Thought is collapsible; opens while running.
 * - File edits & terminal cards attach after the matching action in the same turn.
 * - liveProse (final answer stream) always renders at the bottom.
 */

export interface MessageStep {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  toolName?: string;
  turn?: number;
  thoughtRole?: 'opening' | 'mid';
  itemStatus: 'running' | 'done' | 'error';
  durationMs?: number;
}

interface MessageStepsProps {
  steps: MessageStep[];
  fileEdits?: FileEditPreview[];
  terminalRuns?: TerminalRunPreview[];
  turnProse?: Array<{ id: string; turn: number; content: string }>;
  liveProse?: string;
  liveProseStreaming?: boolean;
  isStreaming?: boolean;
  /** When true, hide turnProse / liveProse (used under collapsed Worked). */
  toolsOnly?: boolean;
  onOpenFile?: (path: string) => void;
}

const FG = 'var(--vscode-descriptionForeground, #9d9d9d)';
const FG_ERR = '#e2556f';

function turnOf(v: { turn?: number }): number {
  return typeof v.turn === 'number' && v.turn > 0 ? v.turn : 1;
}

function isMeta(kind: string): boolean {
  return kind === 'done' || kind === 'session' || kind === 'planning';
}

function isNoiseTool(name?: string): boolean {
  const n = (name || '').toLowerCase();
  return (
    n === 'todo_write' ||
    n === 'switch_mode' ||
    n === 'checkpoint_create' ||
    n === 'checkpoint_restore'
  );
}

/** Explore-class tools — Cursor "Exploring N files…" */
function isExploreStep(s: MessageStep): boolean {
  if (s.kind === 'searching' || s.kind === 'reading' || s.kind === 'browsing') {
    return true;
  }
  const n = (s.toolName || '').toLowerCase();
  if (!n) return false;
  if (
    n === 'read_file' ||
    n === 'read_files' ||
    n === 'list_dir' ||
    n === 'read_lints' ||
    n === 'grep' ||
    n === 'glob' ||
    n === 'file_search' ||
    n === 'codebase_search' ||
    n === 'web_search' ||
    n === 'web_fetch'
  ) {
    return true;
  }
  if (n.startsWith('mcp_') && s.kind !== 'editing' && s.kind !== 'running') {
    return true;
  }
  return false;
}

function isShellStep(s: MessageStep): boolean {
  const n = (s.toolName || '').toLowerCase();
  return n === 'run_terminal_cmd' || n === 'terminal_output' || s.kind === 'running';
}

function isEditStep(s: MessageStep): boolean {
  if (s.kind === 'editing') return true;
  const n = (s.toolName || '').toLowerCase();
  return n === 'edit_file' || n === 'write_file' || n === 'delete_file';
}

function shortPath(detail?: string): string {
  if (!detail?.trim()) return '';
  const parts = detail.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return detail.trim();
  return `…/${parts.slice(-2).join('/')}`;
}

function fileBasename(detail?: string): string {
  if (!detail?.trim()) return '';
  const parts = detail.replace(/\\/g, '/').split('/').filter(Boolean);
  const base = parts[parts.length - 1] || detail.trim();
  return base.length > 42 ? `${base.slice(0, 40)}…` : base;
}

function toolVerb(s: MessageStep, live: boolean): string {
  const n = (s.toolName || '').toLowerCase();
  switch (n) {
    case 'read_file':
    case 'read_files':
      return live ? 'Reading' : 'Read';
    case 'grep':
      return live ? 'Grepping' : 'Grepped';
    case 'glob':
    case 'file_search':
      return live ? 'Searching' : 'Searched';
    case 'list_dir':
      return live ? 'Listing' : 'Listed';
    case 'codebase_search':
      return live ? 'Searching codebase' : 'Searched codebase';
    case 'read_lints':
      return live ? 'Checking lints' : 'Checked lints';
    case 'web_search':
      return live ? 'Searching web' : 'Searched web';
    case 'web_fetch':
      return live ? 'Fetching' : 'Fetched';
    case 'edit_file':
      return live ? 'Editing' : 'Edited';
    case 'write_file':
      return live ? 'Writing' : 'Wrote';
    case 'delete_file':
      return live ? 'Deleting' : 'Deleted';
    case 'run_terminal_cmd':
    case 'terminal_output':
      return live ? 'Running' : 'Ran';
    case 'ask_question':
      return live ? 'Asking' : 'Asked';
    default:
      if (s.kind === 'reading') return live ? 'Reading' : 'Read';
      if (s.kind === 'searching') return live ? 'Searching' : 'Searched';
      if (s.kind === 'editing') return live ? 'Editing' : 'Edited';
      if (s.kind === 'running') return live ? 'Running' : 'Ran';
      if (s.kind === 'asking') return live ? 'Asking' : 'Asked';
      return s.label?.trim() || s.toolName || 'Action';
  }
}

function formatMs(ms?: number): string {
  if (ms == null || ms < 0) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
}

function thoughtTitle(s: MessageStep, live: boolean): string {
  if (live && s.itemStatus === 'running') return 'Thinking';
  const ms = s.durationMs;
  if (ms != null && ms >= 1000) {
    return `Thought for ${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  }
  return 'Thought';
}

function summarizeExplore(tools: MessageStep[], live: boolean): string {
  if (!tools.length) return live ? 'Exploring' : 'Explored';
  const prefix = live ? 'Exploring' : 'Explored';
  let files = 0;
  let searches = 0;
  for (const s of tools) {
    const n = (s.toolName || '').toLowerCase();
    if (n === 'read_file' || n === 'list_dir' || n === 'read_lints' || s.kind === 'reading') {
      files += 1;
    } else if (n === 'read_files') {
      const m = s.detail?.match(/^(\d+)\s+files?/i);
      files += m ? Number(m[1]) : 1;
    } else if (
      n === 'grep' ||
      n === 'glob' ||
      n === 'file_search' ||
      n === 'codebase_search' ||
      s.kind === 'searching'
    ) {
      searches += 1;
    } else {
      searches += 1;
    }
  }
  if (files && searches) {
    return `${prefix} ${files} ${files === 1 ? 'file' : 'files'}, ${searches} ${
      searches === 1 ? 'search' : 'searches'
    }`;
  }
  if (files) return `${prefix} ${files} ${files === 1 ? 'file' : 'files'}`;
  if (searches) {
    return `${prefix} ${searches} ${searches === 1 ? 'search' : 'searches'}`;
  }
  return `${prefix} ${tools.length} ${tools.length === 1 ? 'item' : 'items'}`;
}

function actionSummary(tools: MessageStep[]): string {
  const edits = tools.filter(isEditStep);
  const runs = tools.filter(isShellStep);
  if (edits.some((s) => s.itemStatus === 'running')) return 'Editing';
  if (runs.some((s) => s.itemStatus === 'running')) return 'Running';
  if (edits.length) {
    return edits.length === 1 ? 'Edited 1 file' : `Edited ${edits.length} files`;
  }
  if (runs.length) {
    return runs.length === 1 ? 'Ran a command' : `Ran ${runs.length} commands`;
  }
  return tools.length === 1 ? 'Used 1 tool' : `Used ${tools.length} tools`;
}

type TimelineItem =
  | { type: 'thought'; step: MessageStep }
  | { type: 'explore'; steps: MessageStep[]; live: boolean }
  | { type: 'action'; steps: MessageStep[]; live: boolean }
  | { type: 'prose'; id: string; content: string }
  | { type: 'edit'; edit: FileEditPreview }
  | { type: 'terminal'; run: TerminalRunPreview };

/**
 * Build a Cursor-like timeline from structured steps only.
 * Consecutive explore tools collapse into one Exploring block.
 * Consecutive edit/shell tools collapse into one action block.
 * Edits/terminals are interleaved after the first matching action in the turn.
 */
function buildTimeline(
  steps: MessageStep[],
  prose: Array<{ id: string; turn: number; content: string }>,
  edits: FileEditPreview[],
  terminals: TerminalRunPreview[]
): TimelineItem[] {
  const items: TimelineItem[] = [];
  const usedEdit = new Set<string>();
  const usedTerm = new Set<string>();

  const attachCardsForActions = (actionSteps: MessageStep[]) => {
    const turn = actionSteps.length ? turnOf(actionSteps[0]) : 0;
    for (const fe of edits) {
      if (usedEdit.has(fe.id)) continue;
      const feTurn = turnOf(fe);
      const path = (fe.absPath || fe.path || '').replace(/\\/g, '/');
      const base = path.split('/').filter(Boolean).pop() || '';
      let match = turn > 0 && feTurn === turn;
      if (!match && base) {
        match = actionSteps.some((a) => {
          const d = `${a.detail || ''} ${a.label || ''}`.replace(/\\/g, '/');
          return d.includes(base) || (path && d.includes(path));
        });
      }
      if (match || (turn > 0 && feTurn === turn)) {
        usedEdit.add(fe.id);
        items.push({ type: 'edit', edit: fe });
      }
    }
    for (const tr of terminals) {
      if (usedTerm.has(tr.id)) continue;
      const trTurn = turnOf(tr);
      if (turn > 0 && trTurn === turn) {
        usedTerm.add(tr.id);
        items.push({ type: 'terminal', run: tr });
      } else if (
        actionSteps.some(isShellStep) &&
        (trTurn === turn || trTurn === 0 || turn === 0)
      ) {
        usedTerm.add(tr.id);
        items.push({ type: 'terminal', run: tr });
      }
    }
  };

  // Opening prose for the turn — keep order, no text classification
  for (const p of prose) {
    const text = String(p.content || '').trim();
    if (text) items.push({ type: 'prose', id: p.id, content: text });
  }

  let i = 0;
  const list = steps.filter(
    (s) => !isMeta(s.kind) && !isNoiseTool(s.toolName)
  );

  while (i < list.length) {
    const s = list[i];

    if (s.kind === 'thinking') {
      items.push({ type: 'thought', step: s });
      i += 1;
      continue;
    }

    if (isExploreStep(s)) {
      const batch: MessageStep[] = [];
      while (i < list.length && isExploreStep(list[i])) {
        batch.push(list[i]);
        i += 1;
      }
      const live = batch.some((x) => x.itemStatus === 'running');
      items.push({ type: 'explore', steps: batch, live });
      continue;
    }

    // Action batch: consecutive non-explore tools (edit / shell / ask / other)
    const batch: MessageStep[] = [];
    while (
      i < list.length &&
      list[i].kind !== 'thinking' &&
      !isExploreStep(list[i])
    ) {
      batch.push(list[i]);
      i += 1;
    }
    if (batch.length) {
      const live = batch.some((x) => x.itemStatus === 'running');
      items.push({ type: 'action', steps: batch, live });
      attachCardsForActions(batch);
    }
  }

  // Leftover cards (no matching action step yet)
  for (const fe of edits) {
    if (!usedEdit.has(fe.id)) {
      usedEdit.add(fe.id);
      items.push({ type: 'edit', edit: fe });
    }
  }
  for (const tr of terminals) {
    if (!usedTerm.has(tr.id)) {
      usedTerm.add(tr.id);
      items.push({ type: 'terminal', run: tr });
    }
  }

  return items;
}

function Chevron({
  title,
  expanded,
  live,
  hasError,
  onToggle,
  children,
  rolling
}: {
  title: string;
  expanded: boolean;
  live?: boolean;
  hasError?: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  rolling?: string;
}) {
  const color = hasError ? FG_ERR : live ? undefined : FG;
  return (
    <div
      className={[
        'ak-step-row',
        live ? 'ak-step-row--live' : '',
        hasError ? 'ak-step-row--error' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ margin: '2px 0' }}
    >
      <button
        type="button"
        className="ak-step-chevron-btn"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-busy={live || undefined}
        style={{
          display: 'flex',
          gap: 7,
          alignItems: 'center',
          width: '100%',
          border: 0,
          background: 'transparent',
          color: color || 'inherit',
          font: 'inherit',
          fontSize: 12,
          cursor: 'pointer',
          padding: '2px 0',
          textAlign: 'left'
        }}
      >
        <span style={{ opacity: 0.7, width: 10, flexShrink: 0 }} aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
        <span
          className={
            live && !hasError
              ? 'ak-step-title ak-step-title--live-shimmer'
              : 'ak-step-title'
          }
          style={{
            fontWeight: live || hasError ? 500 : 400,
            color: color
          }}
        >
          {title}
        </span>
      </button>
      {!expanded && live && rolling ? (
        <div
          className="ak-step-rolling"
          style={{
            marginLeft: 17,
            fontSize: 11.5,
            color: FG,
            opacity: 0.85
          }}
          aria-live="polite"
        >
          {rolling}
        </div>
      ) : null}
      {expanded ? children : null}
    </div>
  );
}

function ToolRows({ steps }: { steps: MessageStep[]; live?: boolean }) {
  return (
    <div
      style={{
        marginLeft: 17,
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}
    >
      {steps.map((s) => {
        const running = s.itemStatus === 'running';
        const err = s.itemStatus === 'error';
        const detail = fileBasename(s.detail) || shortPath(s.detail);
        return (
          <div
            key={s.id}
            style={{
              display: 'flex',
              gap: 8,
              padding: '1px 0',
              fontSize: 11.5,
              color: err ? '#fca5a5' : FG,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            <span style={{ width: 10, flexShrink: 0, opacity: err ? 0.95 : 0.5 }}>
              {err ? '✗' : running ? '›' : '·'}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
              {toolVerb(s, running)}
              {detail ? <span style={{ opacity: 0.75 }}> {detail}</span> : null}
            </span>
            {running ? (
              <span className="ak-live-blink ak-live-blink--sm" aria-hidden>
                <span className="ak-live-blink__dot" />
              </span>
            ) : s.durationMs != null ? (
              <span style={{ opacity: 0.4, flexShrink: 0 }}>{formatMs(s.durationMs)}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ThoughtBlock({
  step,
  forceOpen
}: {
  step: MessageStep;
  forceOpen?: boolean;
}) {
  const live = step.itemStatus === 'running';
  const [open, setOpen] = useState(live || !!forceOpen);
  const body = String(step.detail || '').trim();

  useEffect(() => {
    if (live) setOpen(true);
    else if (!forceOpen) setOpen(false);
  }, [live, forceOpen, step.id]);

  return (
    <Chevron
      title={thoughtTitle(step, live)}
      expanded={open && (!!body || live)}
      live={live}
      onToggle={() => {
        if (!body && !live) return;
        setOpen((v) => !v);
      }}
    >
      {(body || live) && (
        <div
          className="message-steps-thought-body"
          style={{
            marginLeft: 17,
            marginTop: 2,
            marginBottom: 4,
            fontSize: 12,
            lineHeight: 1.45,
            color: FG,
            opacity: 0.9,
            whiteSpace: 'pre-wrap',
            maxHeight: live ? 280 : 320,
            overflow: 'auto'
          }}
        >
          {body || (live ? '…' : '')}
        </div>
      )}
    </Chevron>
  );
}

function ExploreBlock({ steps, live }: { steps: MessageStep[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const hasError =
    steps.some((s) => s.itemStatus === 'error') &&
    !steps.some((s) => s.itemStatus === 'done' || s.itemStatus === 'running');
  const running = steps.filter((s) => s.itemStatus === 'running');
  const rolling =
    running.length > 0
      ? toolVerb(running[running.length - 1], true) +
        (fileBasename(running[running.length - 1].detail)
          ? ` ${fileBasename(running[running.length - 1].detail)}`
          : '')
      : live
        ? 'Planning next moves'
        : undefined;

  return (
    <Chevron
      title={summarizeExplore(steps, live)}
      expanded={open}
      live={live}
      hasError={hasError}
      rolling={rolling}
      onToggle={() => setOpen((v) => !v)}
    >
      <ToolRows steps={steps} live={live} />
    </Chevron>
  );
}

function ActionBlock({ steps, live }: { steps: MessageStep[]; live: boolean }) {
  const [open, setOpen] = useState(live);
  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);
  const hasError = steps.some((s) => s.itemStatus === 'error');

  return (
    <Chevron
      title={live ? actionSummary(steps) : actionSummary(steps) || 'Done'}
      expanded={open}
      live={live}
      hasError={hasError}
      onToggle={() => setOpen((v) => !v)}
    >
      <ToolRows steps={steps} live={live} />
    </Chevron>
  );
}

export function MessageSteps({
  steps,
  fileEdits = [],
  terminalRuns = [],
  turnProse = [],
  liveProse,
  liveProseStreaming = false,
  isStreaming = false,
  toolsOnly = false,
  onOpenFile
}: MessageStepsProps) {
  const groups = useMemo(() => {
    const map = new Map<
      number,
      {
        steps: MessageStep[];
        prose: Array<{ id: string; turn: number; content: string }>;
        edits: FileEditPreview[];
        terminals: TerminalRunPreview[];
      }
    >();
    const ensure = (turn: number) => {
      let g = map.get(turn);
      if (!g) {
        g = { steps: [], prose: [], edits: [], terminals: [] };
        map.set(turn, g);
      }
      return g;
    };
    for (const s of steps) {
      if (isMeta(s.kind)) continue;
      ensure(turnOf(s)).steps.push(s);
    }
    for (const p of turnProse) ensure(turnOf(p)).prose.push(p);
    for (const e of fileEdits) ensure(turnOf(e)).edits.push(e);
    for (const t of terminalRuns) ensure(turnOf(t)).terminals.push(t);
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([turn, value]) => ({ turn, ...value }));
  }, [steps, turnProse, fileEdits, terminalRuns]);

  if (!groups.length && !liveProse?.trim()) return null;

  const lastTurn = groups[groups.length - 1]?.turn;
  const showLive = Boolean(liveProse?.trim()) && !toolsOnly;

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
      {groups.map((g) => {
        const timeline = buildTimeline(g.steps, g.prose, g.edits, g.terminals);
        const isLast = g.turn === lastTurn;
        const turnLive =
          isStreaming &&
          isLast &&
          g.steps.some((s) => s.itemStatus === 'running');

        return (
          <section
            key={`turn-${g.turn}`}
            className="message-steps-turn"
            style={{ marginBottom: groups.length > 1 ? 8 : 4 }}
          >
            {groups.length > 1 ? (
              <div
                style={{
                  fontSize: 11,
                  opacity: 0.55,
                  marginBottom: 2,
                  color: FG
                }}
              >
                Turn {g.turn}
                {turnLive ? ' · Working' : ''}
              </div>
            ) : null}

            {timeline.map((item, idx) => {
              if (item.type === 'thought') {
                return <ThoughtBlock key={item.step.id} step={item.step} />;
              }
              if (item.type === 'explore') {
                return (
                  <ExploreBlock
                    key={`ex-${g.turn}-${idx}-${item.steps[0]?.id}`}
                    steps={item.steps}
                    live={item.live}
                  />
                );
              }
              if (item.type === 'action') {
                return (
                  <ActionBlock
                    key={`act-${g.turn}-${idx}-${item.steps[0]?.id}`}
                    steps={item.steps}
                    live={item.live}
                  />
                );
              }
              if (item.type === 'prose') {
                if (toolsOnly) return null;
                return (
                  <div
                    key={item.id}
                    className="message-content message-turn-prose"
                    style={{ margin: '4px 0 6px', opacity: 0.92 }}
                  >
                    <StreamingMarkdown content={item.content} isStreaming={false} />
                  </div>
                );
              }
              if (item.type === 'edit') {
                const fe = item.edit;
                return (
                  <div
                    key={`edit-${fe.id}`}
                    className="ak-file-edits-inline ak-cards-under-action"
                    style={{ margin: '4px 0' }}
                  >
                    <FileEditCard
                      path={fe.path}
                      absPath={fe.absPath}
                      additions={fe.additions}
                      deletions={fe.deletions}
                      lines={fe.lines || []}
                      onOpenFile={onOpenFile}
                    />
                  </div>
                );
              }
              if (item.type === 'terminal') {
                return (
                  <div
                    key={`term-${item.run.id}`}
                    className="ak-terminal-runs-inline ak-cards-under-action"
                    style={{ margin: '4px 0' }}
                  >
                    <TerminalRunCard {...item.run} />
                  </div>
                );
              }
              return null;
            })}
          </section>
        );
      })}

      {/* Streaming gap — tools paused, no answer yet */}
      {isStreaming &&
      !showLive &&
      !groups.some((g) => g.steps.some((s) => s.itemStatus === 'running')) ? (
        <div
          style={{
            marginLeft: 0,
            padding: '2px 0',
            color: FG,
            fontSize: 12,
            opacity: 0.8
          }}
        >
          <span className="ak-step-title ak-step-title--live-shimmer">
            Planning next moves
          </span>
        </div>
      ) : null}

      {showLive ? (
        <div
          className="message-content message-turn-prose message-turn-prose--live"
          style={{ marginTop: 6 }}
        >
          <StreamingMarkdown
            content={liveProse!}
            isStreaming={!!liveProseStreaming}
          />
        </div>
      ) : null}
    </div>
  );
}
