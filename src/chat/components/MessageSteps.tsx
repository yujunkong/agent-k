import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileEditCard } from './FileEditCard';
import { TerminalRunCard } from './TerminalRunCard';
import { StreamingMarkdown } from '../StreamingMarkdown';
import type { FileEditPreview, TerminalRunPreview } from '../types';

/**
 * Cursor-style sequential steps:
 *   ▸ Thought for 2.1s
 *   ▸ Exploring          ← live: tools slide in underneath
 *   ▸ Explored 10 files  ← done: collapsed summary, expand for detail
 *   ▸ Planning next moves ← between tool batch and next LLM turn
 */

export interface MessageStep {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  toolName?: string;
  turn?: number;
  itemStatus: 'running' | 'done' | 'error';
  durationMs?: number;
}

interface MessageStepsProps {
  steps: MessageStep[];
  /** Edit cards placed after the turn that produced them */
  fileEdits?: FileEditPreview[];
  /** Terminal run cards (Cursor-style expandable shell box) */
  terminalRuns?: TerminalRunPreview[];
  /** Sealed mid-turn assistant prose (between turns) */
  turnProse?: Array<{ id: string; turn: number; content: string }>;
  /** Currently streaming prose after the latest turn (before seal / final) */
  liveProse?: string;
  liveProseStreaming?: boolean;
  onOpenFile?: (path: string) => void;
}

type TurnGroup = {
  turn: number;
  steps: MessageStep[];
  live: boolean;
};

const STEPS_FG = 'var(--vscode-descriptionForeground, #9d9d9d)';
const STEPS_LIVE = 'var(--vscode-foreground, #cccccc)';
const STEPS_MUTED =
  'color-mix(in srgb, var(--vscode-descriptionForeground, #9d9d9d) 72%, transparent)';

/** UI display cap for Thought body (host may send more) */
const THOUGHT_DISPLAY_MAX = 16000;

function inferTurn(step: MessageStep): number {
  if (typeof step.turn === 'number' && step.turn > 0) return step.turn;
  const m = step.id.match(/(?:thinking|planning|tool|step)[^\d]*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

function isMeta(kind: string): boolean {
  return kind === 'thinking' || kind === 'planning' || kind === 'done';
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

function isActionStep(s: MessageStep): boolean {
  if (isMeta(s.kind)) return false;
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

function planningStep(steps: MessageStep[]): MessageStep | undefined {
  return steps.find((s) => s.kind === 'planning');
}

function thoughtWithText(steps: MessageStep[]): MessageStep | undefined {
  const thinking = steps.filter((s) => s.kind === 'thinking');
  const withText = thinking.filter((s) => (s.detail || '').trim().length > 0);
  if (withText.length) return withText[withText.length - 1];
  // Placeholder Thought row while first reasoning tokens arrive
  return thinking.find((s) => s.itemStatus === 'running');
}

function fileBasename(detail?: string): string | undefined {
  if (!detail?.trim()) return undefined;
  const norm = detail.replace(/\\/g, '/').split('/').filter(Boolean);
  const base = norm[norm.length - 1] || detail.trim();
  return base.length > 40 ? `${base.slice(0, 38)}…` : base;
}

function summarizeExplored(steps: MessageStep[]): string {
  const tools = exploreSteps(steps);
  if (!tools.length) return '';
  const errors = tools.filter((s) => s.itemStatus === 'error');
  if (errors.length && !tools.some((s) => s.itemStatus === 'done')) {
    return errors.length === 1
      ? `Failed · ${errors[0].toolName || errors[0].label}`
      : `Failed · ${errors.length} tools`;
  }

  const searches = tools.filter((s) => s.kind === 'searching');
  const reads = tools.filter((s) => s.kind === 'reading');
  const webs = tools.filter(
    (s) =>
      s.toolName === 'web_search' ||
      s.toolName?.includes('web_search') ||
      s.toolName?.startsWith('mcp_searxng')
  );
  const others = tools.filter(
    (s) => s.kind !== 'searching' && s.kind !== 'reading' && !webs.includes(s)
  );

  // Mixed explore batch → Cursor-style "Explored …"
  if (tools.length >= 2 || (searches.length && reads.length) || webs.length) {
    const n = tools.length;
    if (reads.length && !searches.length && !webs.length) {
      return n === 1
        ? `Explored · ${fileBasename(reads[0].detail) || '1 file'}`
        : `Explored ${n} files`;
    }
    if (webs.length && tools.length === webs.length) {
      return webs.length === 1 ? 'Explored · web' : `Explored · web ×${webs.length}`;
    }
    if (searches.length && !reads.length && !webs.length) {
      return searches.length === 1
        ? `Explored · ${fileBasename(searches[0].detail) || 'search'}`
        : `Explored · ${searches.length} searches`;
    }
    return `Explored ${n} ${n === 1 ? 'item' : 'items'}`;
  }

  if (reads.length === 1) {
    return `Explored · ${fileBasename(reads[0].detail) || '1 file'}`;
  }
  if (reads.length > 1) return `Explored ${reads.length} files`;
  if (searches.length === 1) {
    return `Explored · ${fileBasename(searches[0].detail) || 'search'}`;
  }
  if (searches.length > 1) return `Explored · ${searches.length} searches`;
  if (others.length === 1) {
    return `Explored · ${fileBasename(others[0].detail) || others[0].toolName || '1 item'}`;
  }
  return tools.length === 1
    ? `Explored · ${fileBasename(tools[0].detail) || '1 item'}`
    : `Explored ${tools.length} items`;
}

function summarizeActions(steps: MessageStep[]): string {
  const tools = actionSteps(steps);
  if (!tools.length) return '';
  const edits = tools.filter((s) => s.kind === 'editing');
  const runs = tools.filter((s) => s.kind === 'running');
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

function toolRowLabel(s: MessageStep): string {
  const name = s.toolName || s.label.replace(/\s*·.*$/, '');
  return name;
}

/** Keep last N, prefer showing running items */
function liveTail(details: MessageStep[], max = 6): MessageStep[] {
  if (details.length <= max) return details;
  const running = details.filter((s) => s.itemStatus === 'running');
  const rest = details.filter((s) => s.itemStatus !== 'running');
  const recent = rest.slice(-(max - Math.min(running.length, 2)));
  return [...recent, ...running].slice(-max);
}

function ThoughtBody({ text, live }: { text: string; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const display =
    text.length > THOUGHT_DISPLAY_MAX
      ? `${text.slice(0, THOUGHT_DISPLAY_MAX)}…`
      : text;

  useEffect(() => {
    const el = ref.current;
    if (!el || !live || !stickRef.current) return;
    // Keep following new tokens while user hasn't scrolled up
    el.scrollTop = el.scrollHeight;
  }, [display, live]);

  return (
    <div
      ref={ref}
      className="message-steps-thought-body"
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
  onToggle,
  children
}: {
  title: string;
  expanded: boolean;
  live: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`ak-step-row${live ? ' ak-step-row--live' : ''}`} style={{ marginBottom: 2 }}>
      <button
        type="button"
        onClick={() => {
          if (live && !children) return;
          onToggle();
        }}
        className="ak-step-chevron-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '2px 0',
          margin: 0,
          cursor: live && !children ? 'default' : 'pointer',
          color: 'inherit',
          font: 'inherit',
          textAlign: 'left'
        }}
        aria-expanded={expanded}
        aria-busy={live || undefined}
      >
        <span style={{ width: 10, flexShrink: 0, opacity: 0.65, fontSize: 10 }}>
          {expanded ? '▾' : '▸'}
        </span>
        <span
          className="ak-step-title"
          style={{
            fontWeight: live ? 500 : 400,
            color: live ? STEPS_LIVE : STEPS_FG
          }}
        >
          {title}
        </span>
        {live ? (
          <span className="ak-live-blink" title="In progress" aria-hidden>
            <span className="ak-live-blink__dot" />
          </span>
        ) : null}
      </button>
      {expanded ? children : null}
    </div>
  );
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
        padding: '2px 0 6px 16px',
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
          <span style={{ opacity: 0.5, flexShrink: 0 }}>
            {s.itemStatus === 'error' ? '✗' : s.itemStatus === 'running' ? '›' : '·'}
          </span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1
            }}
          >
            {toolRowLabel(s)}
            {s.detail ? (
              <span style={{ opacity: 0.7 }}>
                {' '}
                {shortPath(s.detail)}
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

export function MessageSteps({
  steps,
  fileEdits = [],
  terminalRuns = [],
  turnProse = [],
  liveProse,
  liveProseStreaming,
  onOpenFile
}: MessageStepsProps) {
  const groups = useMemo(() => {
    const map = new Map<number, MessageStep[]>();
    for (const s of steps) {
      const t = inferTurn(s);
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

  const editsByTurn = useMemo(() => {
    const map = new Map<number, FileEditPreview[]>();
    const orphan: FileEditPreview[] = [];
    for (const fe of fileEdits) {
      const t = typeof fe.turn === 'number' && fe.turn > 0 ? fe.turn : 0;
      if (!t) {
        orphan.push(fe);
        continue;
      }
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(fe);
    }
    return { map, orphan };
  }, [fileEdits]);

  const proseByTurn = useMemo(() => {
    const map = new Map<number, Array<{ id: string; turn: number; content: string }>>();
    for (const p of turnProse) {
      const t = typeof p.turn === 'number' && p.turn > 0 ? p.turn : 1;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(p);
    }
    return map;
  }, [turnProse]);

  const terminalsByTurn = useMemo(() => {
    const map = new Map<number, TerminalRunPreview[]>();
    const orphan: TerminalRunPreview[] = [];
    for (const tr of terminalRuns) {
      const t = typeof tr.turn === 'number' && tr.turn > 0 ? tr.turn : 0;
      if (!t) {
        orphan.push(tr);
        continue;
      }
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(tr);
    }
    return { map, orphan };
  }, [terminalRuns]);

  const [openThought, setOpenThought] = useState<Record<number, boolean>>({});
  const [openExplore, setOpenExplore] = useState<Record<number, boolean>>({});
  const [openAction, setOpenAction] = useState<Record<number, boolean>>({});
  const wasLiveRef = React.useRef<Record<number, boolean>>({});

  useEffect(() => {
    setOpenThought((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        const was = wasLiveRef.current[g.turn];
        if (g.live) next[g.turn] = true;
        else if (was === true) next[g.turn] = false;
        else if (next[g.turn] === undefined) next[g.turn] = false;
      }
      return next;
    });
    // Explore collapses when turn finishes (Cursor: Explored closed by default)
    setOpenExplore((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        const was = wasLiveRef.current[g.turn];
        const exploreLive =
          g.live && exploreSteps(g.steps).some((t) => t.itemStatus === 'running');
        if (exploreLive) next[g.turn] = true;
        else if (was === true && !g.live) next[g.turn] = false;
        else if (next[g.turn] === undefined) next[g.turn] = false;
      }
      return next;
    });
    setOpenAction((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        const was = wasLiveRef.current[g.turn];
        const actionLive =
          g.live && actionSteps(g.steps).some((t) => t.itemStatus === 'running');
        if (actionLive) next[g.turn] = true;
        else if (was === true && !g.live) next[g.turn] = false;
        else if (next[g.turn] === undefined) next[g.turn] = false;
        wasLiveRef.current[g.turn] = g.live;
      }
      return next;
    });
  }, [groups]);

  if (!groups.length) return null;

  return (
    <div
      className="message-steps"
      style={{
        margin: '4px 0 10px',
        fontSize: 12,
        lineHeight: 1.45,
        fontFamily: 'var(--vscode-font-family)',
        color: STEPS_FG,
        width: '100%',
        maxWidth: '100%'
      }}
    >
      {groups.map((g) => {
        const th = thoughtWithText(g.steps);
        const reasoning = (th?.detail || '').trim();
        const explores = exploreSteps(g.steps);
        const actions = actionSteps(g.steps);
        const plan = planningStep(g.steps);
        const exploreSummary = summarizeExplored(g.steps);
        const actionSummary = summarizeActions(g.steps);

        const thoughtLive = g.live && th?.itemStatus === 'running';
        const exploreLive =
          g.live && explores.some((t) => t.itemStatus === 'running');
        const actionLive =
          g.live && actions.some((t) => t.itemStatus === 'running');

        // Exactly one live chrome at a time: tools > thought > planning
        const busy = exploreLive || actionLive || thoughtLive;
        const planningLive =
          g.live &&
          !busy &&
          plan?.itemStatus === 'running';

        // Waiting for LLM with no tools/thought yet → Planning next moves
        const idlePlanning =
          g.live &&
          !busy &&
          !reasoning &&
          explores.length === 0 &&
          actions.length === 0;

        const showThought = Boolean(th) && (Boolean(reasoning) || thoughtLive);
        const showExplore = explores.length > 0;
        const showAction = actions.length > 0;
        const showPlanning = (planningLive || idlePlanning) && !busy;

        const thoughtExpanded = thoughtLive || (openThought[g.turn] ?? false);
        const exploreExpanded = exploreLive || (openExplore[g.turn] ?? false);
        const actionExpanded = actionLive || (openAction[g.turn] ?? false);

        const shownExplore = g.live ? liveTail(explores) : explores;
        const shownAction = g.live ? liveTail(actions) : actions;
        const turnEdits = editsByTurn.map.get(g.turn) || [];
        const turnNotes = proseByTurn.get(g.turn) || [];
        const turnTerms = terminalsByTurn.map.get(g.turn) || [];
        // Orphan edits (no turn) → after the last turn group
        const isLastGroup = g.turn === groups[groups.length - 1].turn;
        const showOrphanEdits = isLastGroup ? editsByTurn.orphan : [];
        const showOrphanTerms = isLastGroup ? terminalsByTurn.orphan : [];
        const showLiveProse = isLastGroup && Boolean(liveProse?.trim());

        if (
          !showThought &&
          !showExplore &&
          !showAction &&
          !showPlanning &&
          !turnEdits.length &&
          !showOrphanEdits.length &&
          !turnTerms.length &&
          !showOrphanTerms.length &&
          !turnNotes.length &&
          !showLiveProse
        ) {
          return null;
        }

        return (
          <div
            key={g.turn}
            className="message-steps-turn"
            style={{
              marginBottom: 6,
              paddingBottom: 2,
              borderBottom:
                g.turn !== groups[groups.length - 1].turn
                  ? '1px solid rgba(255,255,255,0.06)'
                  : 'none'
            }}
          >
            {showThought && th ? (
              <ChevronRow
                title={formatThoughtTitle(th, thoughtLive)}
                expanded={thoughtExpanded}
                live={!!thoughtLive}
                onToggle={() =>
                  setOpenThought((p) => ({ ...p, [g.turn]: !thoughtExpanded }))
                }
              >
                <ThoughtBody text={reasoning} live={!!thoughtLive} />
              </ChevronRow>
            ) : null}

            {showExplore ? (
              <ChevronRow
                title={exploreLive ? 'Exploring' : exploreSummary || 'Explored'}
                expanded={exploreExpanded && shownExplore.length > 0}
                live={!!exploreLive}
                onToggle={() =>
                  setOpenExplore((p) => ({ ...p, [g.turn]: !exploreExpanded }))
                }
              >
                {shownExplore.length > 0 ? (
                  <ToolSlideList
                    items={shownExplore}
                    live={!!exploreLive}
                    maxHeight={exploreLive ? 160 : 220}
                  />
                ) : null}
              </ChevronRow>
            ) : null}

            {showAction ? (
              <ChevronRow
                title={
                  actionLive
                    ? actionSteps(g.steps).some(
                        (a) =>
                          a.kind === 'editing' && a.itemStatus === 'running'
                      )
                      ? 'Editing'
                      : actions.find((a) => a.itemStatus === 'running')
                          ?.toolName || 'Working'
                    : actionSummary || 'Done'
                }
                expanded={actionExpanded && shownAction.length > 0}
                live={!!actionLive}
                onToggle={() =>
                  setOpenAction((p) => ({ ...p, [g.turn]: !actionExpanded }))
                }
              >
                {shownAction.length > 0 ? (
                  <ToolSlideList
                    items={shownAction}
                    live={!!actionLive}
                    maxHeight={g.live ? 72 : 140}
                  />
                ) : null}
              </ChevronRow>
            ) : null}

            {/* Edit cards sit in this turn — not after the whole timeline */}
            {turnEdits.length > 0 || showOrphanEdits.length > 0 ? (
              <div className="ak-file-edits-inline" style={{ margin: '4px 0 6px' }}>
                {[...turnEdits, ...showOrphanEdits].map((fe) => (
                  <FileEditCard
                    key={fe.id}
                    path={fe.path}
                    absPath={fe.absPath}
                    additions={fe.additions}
                    deletions={fe.deletions}
                    lines={fe.lines || []}
                    onOpenFile={onOpenFile}
                  />
                ))}
              </div>
            ) : null}

            {/* Terminal cards — click to expand live / final output */}
            {turnTerms.length > 0 || showOrphanTerms.length > 0 ? (
              <div className="ak-terminal-runs-inline" style={{ margin: '4px 0 6px' }}>
                {[...turnTerms, ...showOrphanTerms].map((tr) => (
                  <TerminalRunCard key={tr.id} {...tr} />
                ))}
              </div>
            ) : null}

            {/* Mid-turn prose: full assistant voice (not muted step chrome) */}
            {turnNotes.map((note) => (
              <div key={note.id} className="message-content message-turn-prose">
                <StreamingMarkdown content={note.content} isStreaming={false} />
              </div>
            ))}

            {showLiveProse ? (
              <div className="message-content message-turn-prose message-turn-prose--live">
                <StreamingMarkdown
                  content={liveProse!}
                  isStreaming={!!liveProseStreaming}
                />
              </div>
            ) : null}

            {showPlanning ? (
              <ChevronRow
                title="Planning next moves"
                expanded={false}
                live={!!planningLive || idlePlanning}
                onToggle={() => {}}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
