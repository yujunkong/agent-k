/**
 * Cursor-style changed-files bar above the composer.
 */
import React, { useState } from 'react';
import type { FileEditPreview } from '../types';
import { languageBadge } from '../editDiffPreview';

export interface ChangedFilesBarProps {
  files: FileEditPreview[];
  onOpenFile?: (path: string) => void;
  onUndoAll?: () => void;
  onReview?: () => void;
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

export function ChangedFilesBar({
  files,
  onOpenFile,
  onUndoAll,
  onReview
}: ChangedFilesBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!files.length) return null;

  const totalAdd = files.reduce((s, f) => s + (f.additions || 0), 0);
  const totalDel = files.reduce((s, f) => s + (f.deletions || 0), 0);

  return (
    <div className="changed-files-bar">
      <div className="changed-files-bar__row">
        <button
          type="button"
          className="changed-files-bar__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Collapse file list' : 'Expand file list'}
        >
          <span className="changed-files-bar__chevron" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
          <span className="changed-files-bar__count">
            {files.length} {files.length === 1 ? 'File' : 'Files'}
          </span>
          <span className="changed-files-bar__stats">
            <span className="add">+{totalAdd}</span>
            <span className="del">-{totalDel}</span>
          </span>
        </button>
        <div className="changed-files-bar__actions">
          {onUndoAll ? (
            <button
              type="button"
              className="changed-files-bar__link"
              onClick={onUndoAll}
              title="Undo all edits in this session (restore earliest checkpoint)"
            >
              Undo All
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
              title="Review changed files"
            >
              Review
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <ul className="changed-files-bar__list">
          {files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="changed-files-bar__file"
                onClick={() => onOpenFile?.(f.absPath || f.path)}
                title={f.path}
              >
                <span className="changed-files-bar__badge">
                  {languageBadge(f.path)}
                </span>
                <span className="changed-files-bar__name">{basename(f.path)}</span>
                <span className="changed-files-bar__path">{f.path}</span>
                <span className="changed-files-bar__file-stats">
                  {f.additions > 0 && (
                    <span className="add">+{f.additions}</span>
                  )}
                  {f.deletions > 0 && (
                    <span className="del">-{f.deletions}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
