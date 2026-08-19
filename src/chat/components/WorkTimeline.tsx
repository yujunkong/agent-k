import React, { useEffect, useState } from 'react';
import {
  buildTimelinePresentation,
  type TimelineNode,
  type TimelineStep,
  type TimelineStepStatus,
  visibleSubagentChildren,
  subagentHasAggregatedChanges
} from '../conversation/timelinePresentation';
import type { FileEditPreview, TerminalRunPreview } from '../types';
import { TimelineStepCard } from './TimelineStepCard';
import { SubagentChangesCard } from './SubagentChangesCard';
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
  activeStepId,
  compactFileEdit = false,
  onOpenFile,
  onAcceptFile,
  onRejectFile
}: {
  step: TimelineStep;
  activeStepId?: string;
  compactFileEdit?: boolean;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
}) {
  const pendingInline = Boolean(step.fileEdit && isPendingInlineEdit(step.fileEdit));
  const showFilePanel = Boolean(step.fileEdit) && !compactFileEdit;
  const panel = showFilePanel ? (
    <FileEditPreviewView
      file={step.fileEdit!}
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

  const displayStep =
    compactFileEdit && step.kind === 'file'
      ? { ...step, fileEdit: undefined }
      : step;

  return (
    <TimelineStepCard
      step={displayStep}
      activeStepId={activeStepId}
      forceOpen={pendingInline || undefined}
    >
      {panel}
    </TimelineStepCard>
  );
}

function SubagentTimelineGroup({
  node,
  activeStepId,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onWorktreeReview,
  onWorktreeApply,
  onWorktreeReject
}: {
  node: Extract<TimelineNode, { kind: 'group' }>;
  activeStepId?: string;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onWorktreeReview?: (subagentId: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
}) {
  const subagentId =
    node.step.subagentId || node.step.id.replace(/^tl_subagent_/, '');
  const [reviewOpen, setReviewOpen] = useState(false);
  const result = node.step.result;
  const showChanges =
    Boolean(result) &&
    node.step.status === 'completed' &&
    subagentHasAggregatedChanges(result);
  const visibleChildren = visibleSubagentChildren(node.children, node.subagent);

  const agentBody =
    showChanges && result ? (
      <SubagentChangesCard
        result={result}
        reviewOpen={reviewOpen}
        onReviewToggle={() => {
          const next = !reviewOpen;
          setReviewOpen(next);
          if (next && !result.worktreeReview) onWorktreeReview?.(subagentId);
        }}
        onOpenFile={onOpenFile}
        onWorktreeApply={onWorktreeApply}
        onWorktreeReject={onWorktreeReject}
      />
    ) : null;

  return (
    <div
      className={`ak-work-subagent ak-work-subagent--${stepStatusClass(node.step.status)}`}
      data-subagent-id={subagentId}
    >
      <TimelineStepCard
        step={node.step}
        activeStepId={activeStepId}
        forceOpen={reviewOpen || undefined}
      >
        {agentBody}
      </TimelineStepCard>
      {visibleChildren.length > 0 ? (
        <div className="ak-work-subagent__children">
          {visibleChildren.map((child) => (
            <WorkTimelineStepRow
              key={child.id}
              step={child}
              activeStepId={activeStepId}
              compactFileEdit={node.subagent.compactFileEdits && child.kind === 'file'}
              onOpenFile={onOpenFile}
              onAcceptFile={onAcceptFile}
              onRejectFile={onRejectFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderTimelineNode(
  node: TimelineNode,
  activeStepId: string | undefined,
  onOpenFile?: (path: string) => void,
  onAcceptFile?: (file: FileEditPreview) => void,
  onRejectFile?: (file: FileEditPreview) => void,
  onWorktreeReview?: (subagentId: string) => void,
  onWorktreeApply?: (subagentId: string) => void,
  onWorktreeReject?: (subagentId: string) => void
): React.ReactNode {
  if (node.kind === 'group') {
    return (
      <SubagentTimelineGroup
        key={node.step.id}
        node={node}
        activeStepId={activeStepId}
        onOpenFile={onOpenFile}
        onAcceptFile={onAcceptFile}
        onRejectFile={onRejectFile}
        onWorktreeReview={onWorktreeReview}
        onWorktreeApply={onWorktreeApply}
        onWorktreeReject={onWorktreeReject}
      />
    );
  }

  return (
    <WorkTimelineStepRow
      key={node.step.id}
      step={node.step}
      activeStepId={activeStepId}
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
      ? presentation.progressLabel || `Working · ${stepsLabel(timelineSummary.stepCount)}`
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
            presentation.activeStepId,
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
