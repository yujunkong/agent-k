/**
 * CONV-017 — Change Summary card (SKIPPED).
 * Session file list lives in footer ChangedFilesBar (CONV-016) only.
 * Kept as presentational remnant + ChangeSummaryItem type for CONV-012 normalize.
 */
import React from 'react';

export interface ChangeSummaryItem {
  path: string;
  additions?: number;
  deletions?: number;
  status?: 'modified' | 'added' | 'deleted';
}

export interface ChangeSummaryProps {
  files: ChangeSummaryItem[];
  onReview?: () => void;
  onOpenFile?: (path: string) => void;
}

function statusLabel(status?: ChangeSummaryItem['status']) {
  if (status === 'added') return 'A';
  if (status === 'deleted') return 'D';
  return 'M';
}

/** Small result summary; detailed diff remains behind Review. */
export function ChangeSummary({ files, onReview, onOpenFile }: ChangeSummaryProps) {
  if (!files.length) return null;
  const totalAdditions = files.reduce((n, f) => n + (f.additions ?? 0), 0);
  const totalDeletions = files.reduce((n, f) => n + (f.deletions ?? 0), 0);

  return (
    <section className="ak-change-summary" aria-label="Changed files">
      <div className="ak-change-summary__header">
        <span>{files.length} {files.length === 1 ? 'file' : 'files'} changed</span>
        <span className="ak-change-summary__stats">
          {totalAdditions ? `+${totalAdditions}` : ''}
          {totalDeletions ? ` −${totalDeletions}` : ''}
        </span>
      </div>
      <div className="ak-change-summary__files">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            className="ak-change-summary__file"
            onClick={() => onOpenFile?.(file.path)}
          >
            <span className="ak-change-summary__status">{statusLabel(file.status)}</span>
            <span className="ak-change-summary__path">{file.path}</span>
            <span className="ak-change-summary__delta">
              {file.additions ? `+${file.additions}` : ''}
              {file.deletions ? ` −${file.deletions}` : ''}
            </span>
          </button>
        ))}
      </div>
      {onReview ? (
        <button type="button" className="ak-change-summary__review" onClick={onReview}>
          Review changes
        </button>
      ) : null}
    </section>
  );
}
