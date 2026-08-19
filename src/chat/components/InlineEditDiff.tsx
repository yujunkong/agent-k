/**
 * Inline Edit presentation — FileEditCard + Accept/Reject.
 * Reuses the existing edit preview; does not compute a new diff.
 */
import React, { useCallback } from 'react';
import type { FileEditPreview } from '../types';
import { inlineEditReviewStatus } from '../inlineEditReview';
import { FileEditCard } from './FileEditCard';

export interface InlineEditDiffProps {
  file: FileEditPreview;
  expanded?: boolean;
  embedded?: boolean;
  onOpenFile?: (path: string) => void;
  onAccept?: (file: FileEditPreview) => void;
  onReject?: (file: FileEditPreview) => void;
}

export function InlineEditDiff({
  file,
  expanded = true,
  embedded = false,
  onOpenFile,
  onAccept,
  onReject
}: InlineEditDiffProps) {
  const status = inlineEditReviewStatus(file);
  const pending = status === 'pending';

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!pending) return;
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        onAccept?.(file);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onReject?.(file);
      }
    },
    [file, onAccept, onReject, pending]
  );

  return (
    <section
      className={`ak-inline-edit-diff ak-inline-edit-diff--${status}${
        embedded ? ' ak-inline-edit-diff--embedded' : ''
      }`}
      aria-label="Inline Edit"
      data-review-status={status}
      tabIndex={pending ? 0 : undefined}
      onKeyDown={onKeyDown}
    >
      {embedded ? null : (
        <header className="ak-inline-edit-diff__head">
          <span className="ak-inline-edit-diff__title">Inline Edit</span>
          {status !== 'pending' ? (
            <span className="ak-inline-edit-diff__status">
              {status === 'accepted' ? 'Accepted' : 'Rejected'}
            </span>
          ) : null}
        </header>
      )}
      <FileEditCard
        path={file.path}
        absPath={file.absPath}
        additions={file.additions}
        deletions={file.deletions}
        lines={file.lines || []}
        onOpenFile={onOpenFile}
        expanded={expanded}
        embedded={embedded}
      />
      {pending && (onAccept || onReject) ? (
        <div className="ak-inline-edit-diff__actions">
          {onReject ? (
            <button
              type="button"
              className="ak-inline-edit-diff__reject"
              onClick={() => onReject(file)}
            >
              Reject
            </button>
          ) : null}
          {onAccept ? (
            <button
              type="button"
              className="ak-inline-edit-diff__accept"
              onClick={() => onAccept(file)}
            >
              Accept
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
