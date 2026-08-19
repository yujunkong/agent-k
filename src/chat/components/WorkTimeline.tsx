import React, { useEffect, useState } from 'react';
import type {
  ConversationWorkEvent,
  ConversationWorkStatus
} from '../conversation/conversationWorkEvent';
import {
  resolveFileEditForEvent,
  resolveTerminalRunForEvent
} from '../conversation/workEventDetails';
import { groupWorkTimelineItems } from '../conversation/groupWorkTimelineItems';
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
import { isPendingInlineEdit } from '../inlineEditReview';
import { FileEditPreviewView } from './FileEditPreviewView';
import { TerminalRunCard } from './TerminalRunCard';

export type { ConversationWorkEvent };

/** @deprecated Use ConversationWorkEvent — WorkTimeline renders the event model directly. */
export type WorkItem = ConversationWorkEvent;
export type WorkItemKind = ConversationWorkEvent['type'];
export type WorkItemStatus = ConversationWorkStatus;

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

function fileEditsForSubagent(
  fileEdits: FileEditPreview[],
  subagentId: string,
  children: ConversationWorkEvent[]
): FileEditPreview[] {
  const childIds = new Set(
    children.filter((item) => item.type === 'edit').map((item) => item.id)
  );
  const prefix = `tl_sub_${subagentId}_`;
  return fileEdits.filter((file) => {
    const toolId = file.toolId || '';
    return childIds.has(toolId) || toolId.startsWith(prefix);
  });
}

function worktreeStatusLabel(result: SubagentResult): string | undefined {
  const outcome = defaultSubagentWorktreeOutcome(result);
  const action = result.worktreeAction ?? 'idle';
  if (action === 'reviewing') return 'Loading changes…';
  if (action === 'applying') return 'Applying changes…';
  if (action === 'rejecting') return 'Discarding worktree…';
  if (outcome === 'applied') return 'Changes applied to workspace';
  if (outcome === 'rejected') return 'Worktree discarded';
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

function SubagentWorktreeChangesPreview({
  preview,
  onOpenFile
}: {
  preview: SubagentWorktreeReviewPreview;
  onOpenFile?: (path: string) => void;
}) {
  const files = preview.files ?? [];
  const untracked = preview.untrackedFiles ?? [];
  const diff = String(preview.diff || '').trim();

  return (
    <div className="ak-worktree-preview">
      <div className="ak-worktree-preview__title">Changes preview</div>
      {preview.filesChanged != null ? (
        <div className="ak-worktree-preview__meta">
          {formatSubagentFilesChanged(preview.filesChanged)}
        </div>
      ) : null}
      {files.length ? (
        <ul className="ak-worktree-preview__files">
          {files.map((path) => (
            <li key={path}>
              {onOpenFile ? (
                <button type="button" className="ak-worktree-preview__file" onClick={() => onOpenFile(path)}>
                  {path}
                </button>
              ) : (
                <span>{path}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {untracked.length ? (
        <div className="ak-worktree-preview__meta">
          Untracked: {untracked.join(', ')}
        </div>
      ) : null}
      {diff ? (
        <pre className="ak-worktree-preview__diff">{diff.slice(0, 12_000)}</pre>
      ) : !files.length ? (
        <div className="ak-worktree-preview__meta">No diff returned.</div>
      ) : null}
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
  const [reviewOpen, setReviewOpen] = useState(Boolean(result.worktreeReview));

  useEffect(() => {
    if (result.worktreeReview) setReviewOpen(true);
  }, [result.worktreeReview]);

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
      {result.filesChanged != null ? (
        <div className="ak-subagent-result__row">
          <span className="ak-subagent-result__value">
            {formatSubagentFilesChanged(result.filesChanged)}
          </span>
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
      {statusLabel ? (
        <div
          className={`ak-subagent-result__status${
            (() => {
              const outcome = defaultSubagentWorktreeOutcome(result);
              return outcome === 'apply_failed' || outcome === 'reject_failed';
            })()
              ? ' ak-subagent-result__status--error'
              : ''
          }`}
        >
          {statusLabel}
        </div>
      ) : null}
      {hasWorktreeActions ? (
        <div className="ak-subagent-result__actions">
          {canReview ? (
            <button
              type="button"
              className="ak-subagent-result__action"
              disabled={busy}
              onClick={() => {
                setReviewOpen(true);
                onWorktreeReview?.(subagentId);
              }}
            >
              {result.worktreeAction === 'reviewing' ? 'Reviewing…' : 'Review'}
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
        </div>
      ) : null}
      {reviewOpen && result.worktreeReview ? (
        <SubagentWorktreeChangesPreview
          preview={result.worktreeReview}
          onOpenFile={onOpenFile}
        />
      ) : null}
      {reviewOpen && !result.worktreeReview && fallbackEdits
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

function marker(status: ConversationWorkStatus = 'complete') {
  if (status === 'running') return '●';
  if (status === 'error') return '×';
  if (status === 'pending') return '○';
  return '✓';
}

function stepsLabel(count: number): string {
  return count === 1 ? '1 step' : `${count} steps`;
}

function WorkTimelineRow({
  item,
  fileEdits,
  terminalRuns,
  onOpenFile,
  onAcceptFile,
  onRejectFile
}: {
  item: ConversationWorkEvent;
  fileEdits: FileEditPreview[];
  terminalRuns: TerminalRunPreview[];
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
}) {
  const status = item.status ?? 'complete';
  const fileEdit = resolveFileEditForEvent(item, fileEdits);
  const terminalRun = resolveTerminalRunForEvent(item, terminalRuns);
  const hasRichDetail = Boolean(fileEdit || terminalRun);
  const hasTextDetail = Boolean(item.detail) && item.type !== 'thinking';
  const expandable = hasRichDetail || hasTextDetail;
  const live = status === 'running' && hasRichDetail;
  const pendingInline = Boolean(fileEdit && isPendingInlineEdit(fileEdit));
  const [open, setOpen] = useState(live || pendingInline);

  useEffect(() => {
    if (live || pendingInline) setOpen(true);
  }, [live, pendingInline]);

  return (
    <div
      className={`ak-work-item ak-work-item--${status}${
        expandable ? ' ak-work-item--expandable' : ''
      }${open ? ' ak-work-item--open' : ''}`}
      data-work-type={item.type}
    >
      {expandable ? (
        <button
          type="button"
          className="ak-work-item__row"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="ak-work-item__marker">{marker(status)}</span>
          <span className="ak-work-item__label">{item.label}</span>
          {item.detail ? <span className="ak-work-item__detail">{item.detail}</span> : null}
          <span className="ak-work-item__chev" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </button>
      ) : (
        <div className="ak-work-item__row">
          <span className="ak-work-item__marker">{marker(status)}</span>
          <span className="ak-work-item__label">{item.label}</span>
          {item.detail ? <span className="ak-work-item__detail">{item.detail}</span> : null}
        </div>
      )}
      {open && expandable ? (
        <div className="ak-work-item__panel">
          {fileEdit ? (
            <FileEditPreviewView
              file={fileEdit}
              onOpenFile={onOpenFile}
              onAccept={onAcceptFile}
              onReject={onRejectFile}
            />
          ) : null}
          {terminalRun ? (
            <TerminalRunCard {...terminalRun} embedded open />
          ) : null}
          {!fileEdit && !terminalRun && item.detail ? (
            <div className="ak-work-item__panel-text">{item.detail}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Compact Cursor-style activity timeline. Renders ConversationWorkEvent rows as-is. */
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
  const active = items.some((item) => {
    const status = item.status ?? 'complete';
    return status === 'running' || status === 'pending';
  });
  const hasError = items.some((item) => item.status === 'error');
  const pendingInline = fileEdits.some(isPendingInlineEdit);
  const [open, setOpen] = useState(defaultOpen || active || pendingInline);

  useEffect(() => {
    setOpen(active || pendingInline);
  }, [active, pendingInline]);

  const summary = title
    ? title
    : active
      ? `Working · ${stepsLabel(items.length)}`
      : `Worked · ${stepsLabel(items.length)}`;

  return (
    <details
      className="ak-work-timeline"
      open={active || pendingInline || open}
      onToggle={(event) => {
        if (active) return;
        setOpen((event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary className="ak-work-timeline__summary">
        <span className="ak-work-timeline__marker" data-active={active ? 'true' : undefined}>
          {active ? '●' : hasError ? '×' : '✓'}
        </span>
        <span className="ak-work-timeline__title">{summary}</span>
      </summary>
      <div className="ak-work-timeline__items">
        {groupWorkTimelineItems(items).map((node) =>
          node.kind === 'group' ? (
            <div
              key={node.id}
              className={`ak-work-subagent ak-work-subagent--${node.header.status ?? 'complete'}`}
              data-subagent-id={node.id}
            >
              <WorkTimelineRow
                item={node.header}
                fileEdits={fileEdits}
                terminalRuns={terminalRuns}
                onOpenFile={onOpenFile}
                onAcceptFile={onAcceptFile}
                onRejectFile={onRejectFile}
              />
              {node.children.length > 0 ? (
                <div className="ak-work-subagent__children">
                  {node.children.map((item) => (
                    <WorkTimelineRow
                      key={item.id}
                      item={item}
                      fileEdits={fileEdits}
                      terminalRuns={terminalRuns}
                      onOpenFile={onOpenFile}
                      onAcceptFile={onAcceptFile}
                      onRejectFile={onRejectFile}
                    />
                  ))}
                </div>
              ) : null}
              {node.header.result ? (
                <SubagentResultBlock
                  result={node.header.result}
                  fileEdits={fileEditsForSubagent(
                    fileEdits,
                    node.id,
                    node.children
                  )}
                  onOpenFile={onOpenFile}
                  onAcceptFile={onAcceptFile}
                  onRejectFile={onRejectFile}
                  onWorktreeReview={onWorktreeReview}
                  onWorktreeApply={onWorktreeApply}
                  onWorktreeReject={onWorktreeReject}
                />
              ) : null}
            </div>
          ) : (
            <WorkTimelineRow
              key={node.item.id}
              item={node.item}
              fileEdits={fileEdits}
              terminalRuns={terminalRuns}
              onOpenFile={onOpenFile}
              onAcceptFile={onAcceptFile}
              onRejectFile={onRejectFile}
            />
          )
        )}
      </div>
    </details>
  );
}
