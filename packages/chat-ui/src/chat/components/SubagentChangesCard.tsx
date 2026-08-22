import React, { useEffect, useState } from 'react';
import {
  buildWorktreeDiffFiles,
  type WorktreeDiffFile,
  type WorktreeDiffLine
} from '../conversation/worktreeDiff';
import {
  canApplySubagentWorktree,
  canRejectSubagentWorktree,
  canReviewSubagentWorktree,
  defaultSubagentWorktreeOutcome,
  formatSubagentFilesChanged,
  isSubagentWorktreeBusy,
  type SubagentResult
} from '../conversation/subagentResult';

function worktreeStatusLabel(result: SubagentResult): string | undefined {
  const outcome = defaultSubagentWorktreeOutcome(result);
  const action = result.worktreeAction ?? 'idle';
  if (action === 'reviewing') return 'Loading changes…';
  if (action === 'applying') return 'Applying changes…';
  if (action === 'rejecting') return 'Discarding worktree…';
  if (outcome === 'applied') return 'Changes applied to workspace ✓';
  if (outcome === 'rejected') return 'Worktree discarded ✓';
  if (outcome === 'apply_failed') {
    return result.worktreeError ? `Apply failed: ${result.worktreeError}` : 'Apply failed';
  }
  if (outcome === 'reject_failed') {
    return result.worktreeError ? `Reject failed: ${result.worktreeError}` : 'Reject failed';
  }
  if (result.worktreeError && action === 'idle') return result.worktreeError;
  return undefined;
}

function WorktreeDiffLines({ lines }: { lines: WorktreeDiffLine[] }) {
  if (!lines.length) {
    return <div className="ak-worktree-file__empty">No diff lines for this file.</div>;
  }
  return (
    <div className="ak-worktree-file__diff">
      {lines.map((line, index) => {
        const kind = line.type === 'add' ? 'add' : line.type === 'delete' ? 'delete' : 'context';
        const mark = line.type === 'add' ? '+' : line.type === 'delete' ? '−' : ' ';
        return (
          <div
            key={`${kind}-${index}`}
            className={`ak-file-edit-diff__line ak-file-edit-diff__line--${kind}`}
          >
            <span className="ak-file-edit-diff__mark">{mark}</span>
            <span className="ak-file-edit-diff__text">{line.text || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}

function WorktreeFileRow({
  file,
  reviewOpen,
  expanded,
  onToggle,
  onOpenFile
}: {
  file: WorktreeDiffFile;
  reviewOpen: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpenFile?: (path: string) => void;
}) {
  const hasDiff = file.lines.length > 0;
  const showChev = reviewOpen && hasDiff;

  return (
    <div
      className={`ak-worktree-file${expanded ? ' ak-worktree-file--open' : ''}${
        reviewOpen && hasDiff ? ' ak-worktree-file--interactive' : ''
      }`}
    >
      <button
        type="button"
        className="ak-worktree-file__row"
        onClick={() => {
          if (reviewOpen && hasDiff) onToggle();
        }}
        aria-expanded={expanded}
      >
        <span className="ak-worktree-file__chev" aria-hidden>
          {showChev ? (expanded ? '▾' : '▸') : ' '}
        </span>
        <span className={`ak-worktree-file__status ak-worktree-file__status--${file.status === '?' ? 'untracked' : file.status}`}>
          {file.status}
        </span>
        <span
          className="ak-worktree-file__path"
          onClick={(event) => {
            if (!onOpenFile) return;
            event.stopPropagation();
            onOpenFile(file.path);
          }}
          role={onOpenFile ? 'link' : undefined}
        >
          {file.path}
        </span>
        {file.additions > 0 || file.deletions > 0 ? (
          <span className="ak-worktree-file__stats">
            {file.additions > 0 ? <span className="add">+{file.additions}</span> : null}
            {file.deletions > 0 ? <span className="del">−{file.deletions}</span> : null}
          </span>
        ) : null}
      </button>
      {reviewOpen && expanded && hasDiff ? (
        <div className="ak-worktree-file__panel">
          <WorktreeDiffLines lines={file.lines} />
        </div>
      ) : null}
    </div>
  );
}

export interface SubagentChangesCardProps {
  result: SubagentResult;
  reviewOpen: boolean;
  onReviewToggle: () => void;
  onOpenFile?: (path: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
}

/** Worktree diff review + Apply/Reject — nested inside the Agent timeline card. */
export function SubagentChangesCard({
  result,
  reviewOpen,
  onReviewToggle,
  onOpenFile,
  onWorktreeApply,
  onWorktreeReject
}: SubagentChangesCardProps) {
  const subagentId = String(result.subagentId || '').trim();
  const busy = isSubagentWorktreeBusy(result);
  const canReview = Boolean(subagentId) && (canReviewSubagentWorktree(result) || result.worktreeReview);
  const canApply = Boolean(subagentId) && canApplySubagentWorktree(result);
  const canReject = Boolean(subagentId) && canRejectSubagentWorktree(result);
  const outcome = defaultSubagentWorktreeOutcome(result);
  const statusLabel = worktreeStatusLabel(result);
  const files = buildWorktreeDiffFiles(result.worktreeReview);
  const fileCount = files.length || result.filesChanged || 0;
  const totals = files.reduce(
    (acc, file) => {
      acc.additions += file.additions;
      acc.deletions += file.deletions;
      return acc;
    },
    { additions: 0, deletions: 0 }
  );
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const firstPath = files[0]?.path;

  useEffect(() => {
    if (!reviewOpen) {
      setExpandedPaths(new Set());
      return;
    }
    if (firstPath) setExpandedPaths(new Set([firstPath]));
  }, [reviewOpen, firstPath]);

  if (!fileCount) return null;

  return (
    <div className="ak-subagent-changes">
      <div className="ak-subagent-changes__summary">
        <span>{formatSubagentFilesChanged(fileCount)}</span>
        {totals.additions > 0 || totals.deletions > 0 ? (
          <span className="ak-subagent-changes__totals">
            {totals.additions > 0 ? <span className="add">+{totals.additions}</span> : null}
            {totals.deletions > 0 ? <span className="del">−{totals.deletions}</span> : null}
          </span>
        ) : null}
      </div>
      {reviewOpen ? (
        <div className="ak-subagent-changes__panel">
          <div className="ak-subagent-changes__label">Changes</div>
          {files.length ? (
            <div className="ak-subagent-changes__files">
              {files.map((file) => (
                <WorktreeFileRow
                  key={file.path}
                  file={file}
                  reviewOpen={reviewOpen}
                  expanded={expandedPaths.has(file.path)}
                  onToggle={() => {
                    setExpandedPaths((prev) => {
                      const next = new Set(prev);
                      if (next.has(file.path)) next.delete(file.path);
                      else next.add(file.path);
                      return next;
                    });
                  }}
                  onOpenFile={onOpenFile}
                />
              ))}
            </div>
          ) : (
            <div className="ak-subagent-changes__placeholder">
              Review changes to load the file list.
            </div>
          )}
        </div>
      ) : null}
      {statusLabel ? (
        <div
          className={`ak-subagent-changes__status${
            outcome === 'apply_failed' || outcome === 'reject_failed'
              ? ' ak-subagent-changes__status--error'
              : outcome === 'applied' || outcome === 'rejected'
                ? ' ak-subagent-changes__status--done'
                : ''
          }`}
        >
          {statusLabel}
        </div>
      ) : null}
      <div className="ak-subagent-changes__actions">
        {canReview ? (
          <button
            type="button"
            className="ak-subagent-changes__review"
            disabled={busy}
            onClick={onReviewToggle}
          >
            {result.worktreeAction === 'reviewing'
              ? 'Loading changes…'
              : reviewOpen
                ? 'Hide changes'
                : 'Review changes'}
          </button>
        ) : null}
        <span className="ak-subagent-changes__footer-spacer" />
        {canReject ? (
          <button
            type="button"
            className="ak-subagent-changes__action"
            disabled={busy}
            onClick={() => onWorktreeReject?.(subagentId)}
          >
            {result.worktreeAction === 'rejecting' ? 'Rejecting…' : 'Reject'}
          </button>
        ) : null}
        {canApply ? (
          <button
            type="button"
            className="ak-subagent-changes__action ak-subagent-changes__action--primary"
            disabled={busy}
            onClick={() => onWorktreeApply?.(subagentId)}
          >
            {result.worktreeAction === 'applying' ? 'Applying…' : 'Apply'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
