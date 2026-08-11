/**
 * Terminal run card: click header to expand live/final output.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { TerminalRunPreview } from '../types';

export type TerminalRunCardProps = TerminalRunPreview;

function statusLabel(run: TerminalRunPreview): string {
  if (run.status === 'running') return 'Running';
  if (run.status === 'error') {
    return run.exitCode != null ? `Exit ${run.exitCode}` : 'Failed';
  }
  return run.exitCode != null ? `Exit ${run.exitCode}` : 'Done';
}

function formatDuration(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function TerminalRunCard(run: TerminalRunCardProps) {
  const live = run.status === 'running';
  const [expanded, setExpanded] = useState(live);
  const bodyRef = useRef<HTMLPreElement>(null);
  const output = [run.stdout, run.stderr].filter(Boolean).join('') ||
    (run.error ? String(run.error) : '');

  useEffect(() => {
    if (live) setExpanded(true);
  }, [live]);

  useEffect(() => {
    if (!expanded || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [output, expanded, live]);

  const title = run.description?.trim() || run.command;
  const statusColor =
    run.status === 'error'
      ? '#f87171'
      : run.status === 'running'
        ? 'var(--vscode-charts-blue, #4fc1ff)'
        : 'var(--vscode-descriptionForeground, #9d9d9d)';

  return (
    <div
      className={`ak-terminal-card${live ? ' ak-terminal-card--live' : ''}${
        run.status === 'error' ? ' ak-terminal-card--error' : ''
      }`}
    >
      <button
        type="button"
        className="ak-terminal-card__header"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Collapse output' : 'Show output'}
        aria-expanded={expanded}
      >
        <span className="ak-terminal-card__badge" aria-hidden>
          sh
        </span>
        <span className="ak-terminal-card__title" title={run.command}>
          <span className="ak-terminal-card__prompt">$</span> {title}
        </span>
        <span className="ak-terminal-card__meta" style={{ color: statusColor }}>
          {live ? (
            <span className="ak-live-blink ak-live-blink--sm" aria-hidden>
              <span className="ak-live-blink__dot" />
            </span>
          ) : null}
          {statusLabel(run)}
          {run.durationMs != null && !live ? (
            <span className="ak-terminal-card__dur"> · {formatDuration(run.durationMs)}</span>
          ) : null}
        </span>
        <span className="ak-terminal-card__chev" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded ? (
        <div className="ak-terminal-card__body">
          {run.command && run.description ? (
            <div className="ak-terminal-card__cmd" title={run.command}>
              {run.command}
            </div>
          ) : null}
          <pre ref={bodyRef} className="ak-terminal-card__output">
            {output.trim()
              ? output
              : live
                ? '…'
                : '(no output)'}
            {live ? <span className="ak-terminal-card__caret" aria-hidden /> : null}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
