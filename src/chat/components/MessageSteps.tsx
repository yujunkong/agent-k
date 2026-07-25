import React, { useEffect, useMemo, useState } from 'react';

/**
 * Sequential Cursor-style steps (per agent turn, stacked — not one mutating row):
 *   ▸ Thought for 2.1s     ← turn 1 reasoning (frozen when done)
 *   ▸ Read 4 files         ← turn 1 tools
 *   ▸ Thought for 1.4s     ← turn 2 reasoning
 *   ▸ Explored 10 files    ← turn 2 tools
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

function inferTurn(step: MessageStep): number {
  if (typeof step.turn === 'number' && step.turn > 0) return step.turn;
  const m = step.id.match(/(?:thinking|planning|tool|step)[^\d]*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

function isMeta(kind: string): boolean {
  return kind === 'thinking' || kind === 'planning' || kind === 'done';
}

function toolSteps(steps: MessageStep[]): MessageStep[] {
  return steps.filter((s) => !isMeta(s.kind));
}

function thoughtWithText(steps: MessageStep[]): MessageStep | undefined {
  // Prefer the thinking step that has text for THIS turn (not reverse-global)
  const withText = steps.filter(
    (s) => s.kind === 'thinking' && (s.detail || '').trim().length > 0
  );
  return withText[withText.length - 1];
}

function summarizeTools(steps: MessageStep[]): string {
  const tools = toolSteps(steps);
  const errors = tools.filter((s) => s.itemStatus === 'error');
  if (errors.length && !tools.some((s) => s.itemStatus === 'done')) {
    return errors.length === 1
      ? `Failed · ${errors[0].toolName || errors[0].label}`
      : `Failed · ${errors.length} tools`;
  }
  const searches = tools.filter((s) => s.kind === 'searching');
  const reads = tools.filter((s) => s.kind === 'reading');
  const edits = tools.filter((s) => s.kind === 'editing');
  const runs = tools.filter((s) => s.kind === 'running');
  if (searches.length && !reads.length && !edits.length) {
    const fileHit = searches
      .map((s) => s.detail || '')
      .join(' ')
      .match(/(\d+)\s*file/);
    if (fileHit) return `Explored ${fileHit[1]} files`;
    return searches.length === 1 ? 'Searched briefly' : `Searched · ${searches.length}`;
  }
  if (reads.length && !edits.length && searches.length === 0) {
    return reads.length === 1 ? 'Read 1 file' : `Read ${reads.length} files`;
  }
  if (edits.length) {
    return edits.length === 1 ? 'Edited 1 file' : `Edited ${edits.length} files`;
  }
  if (runs.length) {
    return runs.length === 1 ? 'Ran a command' : `Ran ${runs.length} commands`;
  }
  if (tools.length) {
    return tools.length === 1 ? 'Used 1 tool' : `Used ${tools.length} tools`;
  }
  return '';
}

function liveActivityLabel(steps: MessageStep[]): string {
  const runningTool = [...steps]
    .reverse()
    .find((s) => s.itemStatus === 'running' && !isMeta(s.kind));
  if (runningTool) {
    return runningTool.toolName || runningTool.label.replace(/\s*·.*$/, '') || 'Working';
  }
  return 'Working';
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

function liveTail(details: MessageStep[], max = 4): MessageStep[] {
  if (details.length <= max) return details;
  const running = details.filter((s) => s.itemStatus === 'running');
  const rest = details.filter((s) => s.itemStatus !== 'running');
  const recent = rest.slice(-(max - Math.min(running.length, 1)));
  return [...recent, ...running].slice(-max);
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
    <div style={{ marginBottom: 2 }}>
      <button
        type="button"
        onClick={() => {
          if (live) return;
          onToggle();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '2px 0',
          margin: 0,
          cursor: live ? 'default' : 'pointer',
          color: 'inherit',
          font: 'inherit',
          textAlign: 'left'
        }}
        aria-expanded={expanded}
      >
        <span style={{ width: 10, flexShrink: 0, opacity: 0.65, fontSize: 10 }}>
          {expanded ? '▾' : '▸'}
        </span>
        <span
          style={{
            fontWeight: live ? 500 : 400,
            color: live ? STEPS_LIVE : STEPS_FG
          }}
        >
          {title}
        </span>
        {live ? (
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--vscode-progressBar-background, #0e639c)',
              marginLeft: 2,
              animation: 'ak-pulse 1.2s ease-in-out infinite'
            }}
          />
        ) : null}
      </button>
      {expanded ? children : null}
    </div>
  );
}

export function MessageSteps({ steps }: MessageStepsProps) {
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

  // openThought[turn], openTools[turn]
  const [openThought, setOpenThought] = useState<Record<number, boolean>>({});
  const [openTools, setOpenTools] = useState<Record<number, boolean>>({});
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
    setOpenTools((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        const was = wasLiveRef.current[g.turn];
        if (g.live) next[g.turn] = true;
        else if (was === true) next[g.turn] = false;
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
        color: STEPS_FG
      }}
    >
      {groups.map((g) => {
        const th = thoughtWithText(g.steps);
        const reasoning = (th?.detail || '').trim();
        const tools = toolSteps(g.steps);
        const toolSummary = summarizeTools(g.steps);
        const thoughtLive = g.live && th?.itemStatus === 'running';
        const toolsLive = g.live && tools.some((t) => t.itemStatus === 'running');
        const showThought = Boolean(reasoning);
        const showTools =
          tools.length > 0 ||
          (g.live && !showThought) ||
          (!g.live && toolSummary);

        const thoughtExpanded = thoughtLive || (openThought[g.turn] ?? false);
        const toolsExpanded = toolsLive || (openTools[g.turn] ?? false);
        const shown = g.live ? liveTail(tools) : tools;
        const activityTitle = g.live
          ? toolsLive || tools.length
            ? liveActivityLabel(g.steps)
            : 'Working'
          : toolSummary || 'Done';

        if (!showThought && !showTools) return null;

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
                <div
                  style={{
                    padding: '2px 0 6px 16px',
                    color: STEPS_MUTED,
                    fontSize: 12,
                    lineHeight: 1.5,
                    maxHeight: thoughtLive ? 120 : 200,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {reasoning.length > 2500
                    ? `${reasoning.slice(0, 2500)}…`
                    : reasoning}
                </div>
              </ChevronRow>
            ) : null}

            {showTools ? (
              <ChevronRow
                title={activityTitle}
                expanded={toolsExpanded && shown.length > 0}
                live={!!toolsLive || (g.live && !showThought)}
                onToggle={() =>
                  setOpenTools((p) => ({ ...p, [g.turn]: !toolsExpanded }))
                }
              >
                {shown.length > 0 ? (
                  <div
                    style={{
                      padding: '2px 0 6px 16px',
                      color: STEPS_MUTED,
                      maxHeight: g.live ? 72 : 160,
                      overflow: 'hidden'
                    }}
                  >
                    {shown.map((s) => (
                      <div
                        key={s.id}
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
                          {s.itemStatus === 'error' ? '✗' : '·'}
                        </span>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1
                          }}
                        >
                          {s.toolName || s.label.replace(/\s*·.*$/, '')}
                          {s.detail ? (
                            <span style={{ opacity: 0.7 }}>
                              {' '}
                              {shortPath(s.detail)}
                            </span>
                          ) : null}
                        </span>
                        {s.durationMs != null && s.itemStatus !== 'running' ? (
                          <span style={{ opacity: 0.4, flexShrink: 0 }}>
                            {formatMs(s.durationMs)}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </ChevronRow>
            ) : null}
          </div>
        );
      })}
      <style>{`
        @keyframes ak-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
