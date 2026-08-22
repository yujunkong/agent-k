import React, { useMemo, useState } from 'react';
import type { FileEditPreview } from '../types';
import { languageBadge } from '../editDiffPreview';
import { FileEditPreviewView } from './FileEditPreviewView';

export interface DiffReviewPanelProps {
  files: FileEditPreview[];
  onOpenFile?: (path: string) => void;
  onUndoAll?: () => void;
  onClose?: () => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

/**
 * Cursor-style multi-file diff review surface.
 * Undo uses the host checkpoint layer. Inline Edit Accept/Reject reuse the
 * same FileEditPreview cards instead of a second diff engine.
 */
export function DiffReviewPanel({
  files,
  onOpenFile,
  onUndoAll,
  onClose,
  onAcceptFile,
  onRejectFile
}: DiffReviewPanelProps) {
  const [selectedId, setSelectedId] = useState(files[0]?.id || '');
  const selected = useMemo(
    () => files.find((file) => file.id === selectedId) || files[0],
    [files, selectedId]
  );

  if (!files.length || !selected) return null;

  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <section className="ak-diff-review" aria-label="Review changed files">
      <header className="ak-diff-review__header">
        <div className="ak-diff-review__title-group">
          <strong>Review changes</strong>
          <span className="ak-diff-review__summary">
            {files.length} {files.length === 1 ? 'file' : 'files'}
            {additions ? ` · +${additions}` : ''}
            {deletions ? ` · -${deletions}` : ''}
          </span>
        </div>
        <div className="ak-diff-review__actions">
          {onUndoAll ? (
            <button
              type="button"
              className="ak-diff-review__secondary"
              onClick={onUndoAll}
              title="Undo all changes using the host checkpoint handler"
            >
              Undo all
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="ak-diff-review__secondary"
              onClick={onClose}
              title="Close diff review"
            >
              Done
            </button>
          ) : null}
        </div>
      </header>

      <div className="ak-diff-review__body">
        <nav className="ak-diff-review__files" aria-label="Changed files">
          {files.map((file) => {
            const active = file.id === selected.id;
            return (
              <button
                key={file.id}
                type="button"
                className={`ak-diff-review__file${active ? ' ak-diff-review__file--active' : ''}`}
                onClick={() => setSelectedId(file.id)}
                title={file.path}
              >
                <span className="ak-diff-review__file-badge" aria-hidden>
                  {languageBadge(file.path)}
                </span>
                <span className="ak-diff-review__file-name">{basename(file.path)}</span>
                <span className="ak-diff-review__file-stats">
                  {file.additions ? <span className="add">+{file.additions}</span> : null}
                  {file.deletions ? <span className="del">-{file.deletions}</span> : null}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="ak-diff-review__diff">
          <FileEditPreviewView
            file={selected}
            onOpenFile={onOpenFile}
            onAccept={onAcceptFile}
            onReject={onRejectFile}
            expanded
          />
        </div>
      </div>
    </section>
  );
}
