/**
 * Cursor-style terminal run card — FileEdit-shaped: clipped body + bottom expand.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { TerminalRunPreview } from '../types';

export type TerminalRunCardProps = TerminalRunPreview & {
  /** Nested under a WorkTimeline row — hide the duplicate header. */
  embedded?: boolean;
  /** Controlled expand; omit to use internal state (bottom ⌄). */
  open?: boolean;
};

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

function outputLineCount(text: string): number {
  if (!text.trim()) return 0;
  return text.split(/\r?\n/).length;
}

export function TerminalRunCard({
  embedded = false,
  open,
  ...run
}: TerminalRunCardProps) {
  const live = run.status === 'running';
  const [localExpanded, setLocalExpanded] = useState(false);
  const bodyRef = useRef<HTMLPreElement>(null);
  const output =
    [run.stdout, run.stderr].filter(Boolean).join('') ||
    (run.error ? String(run.error) : '');
  // Comment: controlled `open` (WorkTimeline embedded) bypasses local bottom toggle
  const isExpanded = open ?? localExpanded;
  const controlled = open != null;
  const lines = outputLineCount(output);
  // Comment: FileEdit shows ⌄ when >4 lines; live output may grow — keep toggle available
  const showExpand =
    !embedded && !controlled && (live || lines > 4 || output.length > 180);

  useEffect(() => {
    if (controlled) return;
    // Comment: auto-expand only while live when output already exceeds collapse viewport
    if (live && (lines > 4 || output.length > 180)) setLocalExpanded(true);
  }, [live, lines, output.length, controlled]);

  useEffect(() => {
    if (!bodyRef.current || !live) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [output, live, isExpanded]);

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
      }${embedded ? ' ak-terminal-card--embedded' : ''}${
        isExpanded ? ' ak-terminal-card--expanded' : ''
      }`}
    >
      {embedded ? null : (
        <div className="ak-terminal-card__header" title={run.command}>
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
              <span className="ak-terminal-card__dur">
                {' '}
                · {formatDuration(run.durationMs)}
              </span>
            ) : null}
          </span>
        </div>
      )}

      {/* Comment: body always mounted — expand only raises max-height (FileEdit parity) */}
      <div className="ak-terminal-card__body">
        {!embedded && run.command && run.description ? (
          <div className="ak-terminal-card__cmd" title={run.command}>
            {run.command}
          </div>
        ) : null}
        <pre ref={bodyRef} className="ak-terminal-card__output">
          {output.trim() ? output : live ? '…' : '(no output)'}
          {live ? <span className="ak-terminal-card__caret" aria-hidden /> : null}
        </pre>
      </div>

      {showExpand ? (
        <button
          type="button"
          className="ak-terminal-card__expand"
          title={isExpanded ? 'Collapse' : 'Expand'}
          aria-expanded={isExpanded}
          onClick={() => setLocalExpanded((v) => !v)}
        >
          <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>
            {isExpanded ? '⌃' : '⌄'}
          </span>
        </button>
      ) : null}
    </div>
  );
}
