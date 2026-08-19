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
  formatSubagentDuration,
  formatSubagentFilesChanged,
  formatSubagentToolCount,
  type SubagentResult
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
  onReviewChanges?: () => void;
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

function SubagentResultBlock({
  result,
  fileEdits,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onReviewChanges
}: {
  result: SubagentResult;
  fileEdits: FileEditPreview[];
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onReviewChanges?: () => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const canReview = (result.filesChanged ?? 0) > 0 || fileEdits.length > 0;

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
      {canReview ? (
        <button
          type="button"
          className="ak-subagent-result__review"
          onClick={() => {
            setReviewOpen(true);
            onReviewChanges?.();
          }}
        >
          Review changes
        </button>
      ) : null}
      {reviewOpen
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
  onReviewChanges
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
                  onReviewChanges={onReviewChanges}
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
