/**
 * Cursor-style changed-files bar above the composer.
 * Row: [badge] filename ……………… +n -n
 * Path shows on hover (title + floating hint).
 */
import React, { useState } from 'react';
import type { FileEditPreview } from '../types';
import { languageBadge } from '../editDiffPreview';

/** ADDON-T07: lightweight checkpoint summary (no file contents over the wire) */
export interface CheckpointSummary {
  id: string;
  label: string;
  timestamp: number;
}

export interface ChangedFilesBarProps {
  files: FileEditPreview[];
  onOpenFile?: (path: string) => void;
  onUndoAll?: () => void;
  onReview?: () => void;
  /** While agent is running — show Stop like Cursor */
  isStreaming?: boolean;
  onStop?: () => void;
  /** ADDON-T07: recent checkpoints dropdown (minimal — button + list) */
  checkpoints?: CheckpointSummary[];
  onListCheckpoints?: () => void;
  onRestoreCheckpoint?: (id: string) => void;
}

function formatCheckpointTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '';
  }
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

function dirHint(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  if (i <= 0) return norm;
  return norm.slice(0, i + 1);
}

export function ChangedFilesBar({
  files,
  onOpenFile,
  onUndoAll,
  onReview,
  isStreaming = false,
  onStop,
  checkpoints,
  onListCheckpoints,
  onRestoreCheckpoint
}: ChangedFilesBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [hoverPath, setHoverPath] = useState<string | null>(null);
  const [showCheckpoints, setShowCheckpoints] = useState(false);

  if (!files.length) return null;

  const toggleCheckpoints = () => {
    setShowCheckpoints((v) => {
      const next = !v;
      if (next) onListCheckpoints?.();
      return next;
    });
  };

  return (
    <div className="changed-files-bar">
      <div className="changed-files-bar__row">
        <button
          type="button"
          className="changed-files-bar__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? '파일 목록 접기' : '파일 목록 펼치기'}
          aria-label={expanded ? '파일 목록 접기' : '파일 목록 펼치기'}
        >
          <span className="changed-files-bar__chevron" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
          <span className="changed-files-bar__count">
            {files.length} {files.length === 1 ? 'File' : 'Files'}
          </span>
        </button>

        <div className="changed-files-bar__actions">
          {isStreaming && onStop ? (
            <button
              type="button"
              className="changed-files-bar__stop"
              onClick={onStop}
              title="중지"
              aria-label="중지"
            >
              Stop
              <kbd className="changed-files-bar__kbd">⌃c</kbd>
            </button>
          ) : null}
          {!isStreaming && onUndoAll ? (
            <button
              type="button"
              className="changed-files-bar__link"
              onClick={onUndoAll}
              title="이번 세션의 모든 수정 되돌리기"
            >
              Undo
            </button>
          ) : null}
          {onReview ? (
            <button
              type="button"
              className="changed-files-bar__review"
              onClick={() => {
                setExpanded(true);
                onReview();
              }}
              title="변경된 파일 검토"
            >
              Review
            </button>
          ) : null}
          {!isStreaming && onUndoAll && onListCheckpoints ? (
            <button
              type="button"
              className="changed-files-bar__link"
              aria-expanded={showCheckpoints}
              onClick={toggleCheckpoints}
              title="최근 체크포인트 목록"
            >
              Checkpoints
            </button>
          ) : null}
        </div>
      </div>

      {showCheckpoints ? (
        <ul className="changed-files-bar__checkpoints" role="list">
          {!checkpoints || checkpoints.length === 0 ? (
            <li className="changed-files-bar__checkpoint-empty">체크포인트 없음</li>
          ) : (
            checkpoints.slice(0, 8).map((cp) => (
              <li key={cp.id} className="changed-files-bar__checkpoint-row">
                <span className="changed-files-bar__checkpoint-label" title={cp.label}>
                  {cp.label}
                </span>
                <span className="changed-files-bar__checkpoint-time">
                  {formatCheckpointTime(cp.timestamp)}
                </span>
                <button
                  type="button"
                  className="changed-files-bar__checkpoint-restore"
                  onClick={() => {
                    onRestoreCheckpoint?.(cp.id);
                    setShowCheckpoints(false);
                  }}
                  title="이 체크포인트로 복원"
                >
                  Restore
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {expanded ? (
        <ul className="changed-files-bar__list" role="list">
          {files.map((f) => {
            const full = f.absPath || f.path;
            const name = basename(f.path);
            return (
              <li key={f.id} className="changed-files-bar__li">
                <button
                  type="button"
                  className="changed-files-bar__file"
                  onClick={() => onOpenFile?.(full)}
                  onMouseEnter={() => setHoverPath(full)}
                  onMouseLeave={() =>
                    setHoverPath((cur) => (cur === full ? null : cur))
                  }
                  title={full}
                >
                  <span
                    className={`changed-files-bar__badge changed-files-bar__badge--${languageBadge(
                      f.path
                    ).toLowerCase()}`}
                  >
                    {languageBadge(f.path)}
                  </span>
                  <span className="changed-files-bar__name">{name}</span>
                  <span className="changed-files-bar__file-stats">
                    {f.additions > 0 ? (
                      <span className="add">+{f.additions}</span>
                    ) : null}
                    {f.deletions > 0 ? (
                      <span className="del">-{f.deletions}</span>
                    ) : null}
                    {f.additions <= 0 && f.deletions <= 0 ? (
                      <span className="changed-files-bar__muted">·</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {hoverPath ? (
        <div className="changed-files-bar__path-tip" role="status">
          <span className="changed-files-bar__path-tip-dir">
            {dirHint(hoverPath)}
          </span>
          <span className="changed-files-bar__path-tip-name">
            {basename(hoverPath)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
