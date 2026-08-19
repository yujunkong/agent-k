import React, { useEffect, useState } from 'react';
import {
  buildTimelinePresentation,
  type TimelineNode,
  type TimelineStep,
  type TimelineStepStatus
} from '../conversation/timelinePresentation';
import {
  canApplySubagentWorktree,
  canRejectSubagentWorktree,
  canReviewSubagentWorktree,
  defaultSubagentWorktreeOutcome,
  formatSubagentDuration,
  formatSubagentFilesChanged,
  formatSubagentToolCount,
  isSubagentWorktreeBusy,
  type SubagentResult,
  type SubagentWorktreeReviewPreview
} from '../conversation/subagentResult';
import type { FileEditPreview, TerminalRunPreview } from '../types';
import { TimelineStepCard } from './TimelineStepCard';
import { isPendingInlineEdit } from '../inlineEditReview';
import { FileEditPreviewView } from './FileEditPreviewView';
import { TerminalRunCard } from './TerminalRunCard';

export type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';
import type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';

/** @deprecated Use ConversationWorkEvent — stored on message.workItems before presentation mapping. */
export type WorkItem = ConversationWorkEvent;
export type WorkItemKind = ConversationWorkEvent['type'];
export type WorkItemStatus = ConversationWorkEvent['status'];

export interface WorkTimelineProps {
  items: ConversationWorkEvent[];
  fileEdits?: FileEditPreview[];
  terminalRuns?: TerminalRunPreview[];
  defaultOpen?: boolean;
  title?: string;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onWorktreeReview?: (subagentId: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
}

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
  if (result.worktreeError && action === 'idle') {
    return result.worktreeError;
  }
  return undefined;
}

type WorktreeDiffLine = {
  type: 'add' | 'delete' | 'context';
  text: string;
};

type WorktreeDiffFile = {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | '?';
  additions: number;
  deletions: number;
  lines: WorktreeDiffLine[];
};

function normalizeRepoPath(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
}

function countDiffLineStats(body: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

function diffBodyToLines(body: string): WorktreeDiffLine[] {
  const out: WorktreeDiffLine[] = [];
  for (const raw of body.split(/\r?\n/)) {
    if (!raw || raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('@@')) {
      continue;
    }
    if (raw.startsWith('+')) {
      out.push({ type: 'add', text: raw.slice(1) });
    } else if (raw.startsWith('-')) {
      out.push({ type: 'delete', text: raw.slice(1) });
    } else if (raw.startsWith(' ') || raw.startsWith('\t')) {
      out.push({ type: 'context', text: raw.slice(1) });
    }
  }
  return out;
}

/** Split a unified git diff into per-file rows for the worktree review panel. */
function parseWorktreeUnifiedDiff(diff: string): WorktreeDiffFile[] {
  const text = String(diff || '').trim();
  if (!text) return [];

  const parts = text.split(/^diff --git /m).filter(Boolean);
  const files: WorktreeDiffFile[] = [];

  for (const part of parts) {
    const chunk = `diff --git ${part}`;
    const header = chunk.match(/^diff --git a\/(.+?) b\/(.+?)(?:\r?\n|$)/);
    if (!header) continue;

    const oldPath = normalizeRepoPath(header[1]);
    const newPath = normalizeRepoPath(header[2]);
    const bodyStart = chunk.indexOf('\n');
    const body = bodyStart >= 0 ? chunk.slice(bodyStart + 1) : '';

    let status: WorktreeDiffFile['status'] = 'M';
    if (/^deleted file mode/m.test(chunk) || newPath === 'dev/null') {
      status = 'D';
    } else if (/^new file mode/m.test(chunk) || oldPath === 'dev/null') {
      status = 'A';
    } else if (/^rename from /m.test(chunk)) {
      status = 'R';
    }

    const path =
      status === 'D'
        ? oldPath !== 'dev/null'
          ? oldPath
          : newPath
        : newPath !== 'dev/null'
          ? newPath
          : oldPath;

    const stats = countDiffLineStats(body);
    files.push({
      path,
      status,
      additions: stats.additions,
      deletions: stats.deletions,
      lines: diffBodyToLines(body)
    });
  }

  return files;
}

function buildWorktreeDiffFiles(
  preview?: SubagentWorktreeReviewPreview
): WorktreeDiffFile[] {
  if (!preview) return [];
  const parsed = parseWorktreeUnifiedDiff(String(preview.diff || ''));
  const byPath = new Map(parsed.map((file) => [file.path, file]));

  for (const raw of preview.files ?? []) {
    const path = normalizeRepoPath(raw);
    if (!path || byPath.has(path)) continue;
    byPath.set(path, {
      path,
      status: 'M',
      additions: 0,
      deletions: 0,
      lines: []
    });
  }

  for (const raw of preview.untrackedFiles ?? []) {
    const path = normalizeRepoPath(raw);
    if (!path || byPath.has(path)) continue;
    byPath.set(path, {
      path,
      status: '?',
      additions: 0,
      deletions: 0,
      lines: []
    });
  }

  const ordered = [...(preview.files ?? []).map(normalizeRepoPath), ...parsed.map((f) => f.path)];
  const seen = new Set<string>();
  const result: WorktreeDiffFile[] = [];
  for (const path of ordered) {
    if (!path || seen.has(path)) continue;
    const file = byPath.get(path);
    if (file) {
      seen.add(path);
      result.push(file);
    }
  }
  for (const file of parsed) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    result.push(file);
  }
  for (const file of byPath.values()) {
    if (seen.has(file.path)) continue;
    result.push(file);
  }
  return result;
}

function formatWorktreeStatParts(
  additions: number,
  deletions: number
): { additions: number; deletions: number } {
  return { additions, deletions };
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
  const stats = formatWorktreeStatParts(file.additions, file.deletions);
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
        <span className={`ak-worktree-file__status ak-worktree-file__status--${file.status}`}>
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
        {stats.additions > 0 || stats.deletions > 0 ? (
          <span className="ak-worktree-file__stats">
            {stats.additions > 0 ? <span className="add">+{stats.additions}</span> : null}
            {stats.deletions > 0 ? <span className="del">−{stats.deletions}</span> : null}
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

function SubagentWorktreeChangesPanel({
  preview,
  filesChanged,
  reviewOpen,
  onOpenFile
}: {
  preview?: SubagentWorktreeReviewPreview;
  filesChanged?: number;
  reviewOpen: boolean;
  onOpenFile?: (path: string) => void;
}) {
  const files = buildWorktreeDiffFiles(preview);
  const fileCount = files.length || filesChanged || 0;
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
    if (firstPath) {
      setExpandedPaths(new Set([firstPath]));
    }
  }, [reviewOpen, firstPath]);

  if (!fileCount) return null;

  const totalsLabel = formatWorktreeStatParts(totals.additions, totals.deletions);

  return (
    <div className="ak-worktree-changes">
      <div className="ak-worktree-changes__summary">
        <span>{formatSubagentFilesChanged(fileCount)}</span>
        {totalsLabel.additions > 0 || totalsLabel.deletions > 0 ? (
          <span className="ak-worktree-changes__totals">
            {totalsLabel.additions > 0 ? (
              <span className="add">+{totalsLabel.additions}</span>
            ) : null}
            {totalsLabel.deletions > 0 ? (
              <span className="del">−{totalsLabel.deletions}</span>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="ak-worktree-changes__panel">
        <div className="ak-worktree-changes__label">Changes</div>
        {files.length ? (
          <div className="ak-worktree-changes__files">
            {files.map((file) => (
                <WorktreeFileRow
                  key={file.path}
                  file={file}
                  reviewOpen={reviewOpen}
                  expanded={reviewOpen && expandedPaths.has(file.path)}
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
          <div className="ak-worktree-changes__placeholder">
            Review changes to load the file list.
          </div>
        )}
      </div>
    </div>
  );
}

function SubagentResultBlock({
  result,
  fileEdits,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onWorktreeReview,
  onWorktreeApply,
  onWorktreeReject
}: {
  result: SubagentResult;
  fileEdits: FileEditPreview[];
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onWorktreeReview?: (subagentId: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
}) {
  const subagentId = String(result.subagentId || '').trim();
  const hasWorktreeActions = Boolean(subagentId);
  const busy = isSubagentWorktreeBusy(result);
  const canReview = hasWorktreeActions && canReviewSubagentWorktree(result);
  const canApply = hasWorktreeActions && canApplySubagentWorktree(result);
  const canReject = hasWorktreeActions && canRejectSubagentWorktree(result);
  const statusLabel = worktreeStatusLabel(result);
  const [reviewOpen, setReviewOpen] = useState(false);
  const outcome = defaultSubagentWorktreeOutcome(result);
  const showChangesPanel =
    hasWorktreeActions &&
    (Boolean(result.worktreeReview) || (result.filesChanged ?? 0) > 0);
  const showReviewButton =
    hasWorktreeActions &&
    (canReview || Boolean(result.worktreeReview));
  const showFooterActions = canApply || canReject;

  const handleReviewToggle = () => {
    const next = !reviewOpen;
    setReviewOpen(next);
    if (next && !result.worktreeReview) {
      onWorktreeReview?.(subagentId);
    }
  };

  const fallbackEdits =
    (result.filesChanged ?? 0) > 0 || fileEdits.length > 0;

  return (
    <div className="ak-subagent-result">
      {result.summary ? (
        <div className="ak-subagent-result__row">
          <span className="ak-subagent-result__label">Summary</span>
          <span className="ak-subagent-result__value">{result.summary}</span>
        </div>
      ) : null}
      {result.toolCount != null ? (
        <div className="ak-subagent-result__row">
          <span className="ak-subagent-result__value">
            {formatSubagentToolCount(result.toolCount)}
          </span>
        </div>
      ) : null}
      {result.durationMs != null ? (
        <div className="ak-subagent-result__row">
          <span className="ak-subagent-result__value">
            {formatSubagentDuration(result.durationMs)}
          </span>
        </div>
      ) : null}
      {showChangesPanel ? (
        <SubagentWorktreeChangesPanel
          preview={result.worktreeReview}
          filesChanged={result.filesChanged}
          reviewOpen={reviewOpen}
          onOpenFile={onOpenFile}
        />
      ) : result.filesChanged != null ? (
        <div className="ak-subagent-result__row">
          <span className="ak-subagent-result__value">
            {formatSubagentFilesChanged(result.filesChanged)}
          </span>
        </div>
      ) : null}
      {statusLabel ? (
        <div
          className={`ak-subagent-result__status${
            outcome === 'apply_failed' || outcome === 'reject_failed'
              ? ' ak-subagent-result__status--error'
              : outcome === 'applied' || outcome === 'rejected'
                ? ' ak-subagent-result__status--done'
                : ''
          }`}
        >
          {statusLabel}
        </div>
      ) : null}
      {showReviewButton ? (
        <div className="ak-subagent-result__review-row">
          <button
            type="button"
            className="ak-subagent-result__review"
            disabled={busy}
            onClick={handleReviewToggle}
          >
            {result.worktreeAction === 'reviewing'
              ? 'Loading changes…'
              : reviewOpen
                ? 'Hide changes'
                : 'Review changes'}
          </button>
        </div>
      ) : null}
      {showFooterActions ? (
        <div className="ak-subagent-result__footer">
          {canReject ? (
            <button
              type="button"
              className="ak-subagent-result__action"
              disabled={busy}
              onClick={() => onWorktreeReject?.(subagentId)}
            >
              {result.worktreeAction === 'rejecting' ? 'Rejecting…' : 'Reject'}
            </button>
          ) : null}
          {canApply ? (
            <button
              type="button"
              className="ak-subagent-result__action ak-subagent-result__action--primary"
              disabled={busy}
              onClick={() => onWorktreeApply?.(subagentId)}
            >
              {result.worktreeAction === 'applying' ? 'Applying…' : 'Apply'}
            </button>
          ) : null}
        </div>
      ) : null}
      {!hasWorktreeActions && reviewOpen && fallbackEdits
        ? fileEdits.map((file) => (
            <FileEditPreviewView
              key={file.id}
              file={file}
              onOpenFile={onOpenFile}
              onAccept={onAcceptFile}
              onReject={onRejectFile}
            />
          ))
        : null}
    </div>
  );
}

function stepsLabel(count: number): string {
  return count === 1 ? '1 step' : `${count} steps`;
}

function stepStatusClass(status: TimelineStepStatus): string {
  if (status === 'failed') return 'error';
  if (status === 'completed') return 'complete';
  return 'running';
}

function WorkTimelineStepRow({
  step,
  onOpenFile,
  onAcceptFile,
  onRejectFile
}: {
  step: TimelineStep;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
}) {
  const pendingInline = Boolean(step.fileEdit && isPendingInlineEdit(step.fileEdit));
  const panel =
    step.fileEdit ? (
      <FileEditPreviewView
        file={step.fileEdit}
        embedded
        expanded
        onOpenFile={onOpenFile}
        onAccept={onAcceptFile}
        onReject={onRejectFile}
      />
    ) : step.terminalRun ? (
      <TerminalRunCard {...step.terminalRun} embedded open />
    ) : step.body ? (
      <div className="ak-timeline-card__text-body">{step.body}</div>
    ) : null;

  return (
    <TimelineStepCard step={step} forceOpen={pendingInline || undefined}>
      {panel}
    </TimelineStepCard>
  );
}

function fileEditsForSubagentSteps(
  fileEdits: FileEditPreview[],
  subagentId: string,
  children: TimelineStep[]
): FileEditPreview[] {
  const childIds = new Set(
    children.filter((item) => item.kind === 'file').map((item) => item.id)
  );
  const prefix = `tl_sub_${subagentId}_`;
  return fileEdits.filter((file) => {
    const toolId = file.toolId || '';
    return childIds.has(toolId) || toolId.startsWith(prefix);
  });
}

function renderTimelineNode(
  node: TimelineNode,
  fileEdits: FileEditPreview[],
  onOpenFile?: (path: string) => void,
  onAcceptFile?: (file: FileEditPreview) => void,
  onRejectFile?: (file: FileEditPreview) => void,
  onWorktreeReview?: (subagentId: string) => void,
  onWorktreeApply?: (subagentId: string) => void,
  onWorktreeReject?: (subagentId: string) => void
): React.ReactNode {
  if (node.kind === 'group') {
    const subagentId = node.step.subagentId || node.step.id.replace(/^tl_subagent_/, '');
    return (
      <div
        key={node.step.id}
        className={`ak-work-subagent ak-work-subagent--${stepStatusClass(node.step.status)}`}
        data-subagent-id={subagentId}
      >
        <WorkTimelineStepRow
          step={node.step}
          onOpenFile={onOpenFile}
          onAcceptFile={onAcceptFile}
          onRejectFile={onRejectFile}
        />
        {node.children.length > 0 ? (
          <div className="ak-work-subagent__children">
            {node.children.map((child) => (
              <WorkTimelineStepRow
                key={child.id}
                step={child}
                onOpenFile={onOpenFile}
                onAcceptFile={onAcceptFile}
                onRejectFile={onRejectFile}
              />
            ))}
          </div>
        ) : null}
        {node.step.result ? (
          <SubagentResultBlock
            result={node.step.result}
            fileEdits={fileEditsForSubagentSteps(fileEdits, subagentId, node.children)}
            onOpenFile={onOpenFile}
            onAcceptFile={onAcceptFile}
            onRejectFile={onRejectFile}
            onWorktreeReview={onWorktreeReview}
            onWorktreeApply={onWorktreeApply}
            onWorktreeReject={onWorktreeReject}
          />
        ) : null}
      </div>
    );
  }

  return (
    <WorkTimelineStepRow
      key={node.step.id}
      step={node.step}
      onOpenFile={onOpenFile}
      onAcceptFile={onAcceptFile}
      onRejectFile={onRejectFile}
    />
  );
}

/** Compact Cursor-style activity timeline — event store → presentation model → UI. */
export function WorkTimeline({
  items,
  fileEdits = [],
  terminalRuns = [],
  defaultOpen = false,
  title,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onWorktreeReview,
  onWorktreeApply,
  onWorktreeReject
}: WorkTimelineProps) {
  if (!items.length) return null;
  const presentation = buildTimelinePresentation(items, { fileEdits, terminalRuns });
  const { summary: timelineSummary } = presentation;
  const pendingInline = fileEdits.some(isPendingInlineEdit);
  const [open, setOpen] = useState(
    defaultOpen || timelineSummary.hasActive || pendingInline
  );

  useEffect(() => {
    setOpen(timelineSummary.hasActive || pendingInline);
  }, [timelineSummary.hasActive, pendingInline]);

  const summary = title
    ? title
    : timelineSummary.hasActive
      ? `Working · ${stepsLabel(timelineSummary.stepCount)}`
      : `Worked · ${stepsLabel(timelineSummary.stepCount)}`;

  return (
    <details
      className="ak-work-timeline"
      open={timelineSummary.hasActive || pendingInline || open}
      onToggle={(event) => {
        if (timelineSummary.hasActive) return;
        setOpen((event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary className="ak-work-timeline__summary">
        <span
          className="ak-work-timeline__marker"
          data-active={timelineSummary.hasActive ? 'true' : undefined}
        >
          {timelineSummary.hasActive ? '●' : timelineSummary.hasError ? '×' : '✓'}
        </span>
        <span className="ak-work-timeline__title">{summary}</span>
      </summary>
      <div className="ak-work-timeline__items">
        {presentation.nodes.map((node) =>
          renderTimelineNode(
            node,
            fileEdits,
            onOpenFile,
            onAcceptFile,
            onRejectFile,
            onWorktreeReview,
            onWorktreeApply,
            onWorktreeReject
          )
        )}
      </div>
    </details>
  );
}
