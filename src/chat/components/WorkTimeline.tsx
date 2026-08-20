import React, { useEffect, useState } from 'react';
import {
  buildTimelinePresentation,
  collapseExploreSteps,
  type TimelineNode,
  type TimelineStep,
  type TimelineStepStatus,
  visibleSubagentChildren,
  subagentHasAggregatedChanges
} from '../conversation/timelinePresentation';
import type { FileEditPreview, TerminalRunPreview } from '../types';
import { TimelineStepCard } from './TimelineStepCard';
import { SubagentChangesCard } from './SubagentChangesCard';
import { ExploreRunRow, PlanningTailRow, ThoughtRow } from './ExploreChrome';
import { isPlanGenerateStep, PLAN_V2_GENERATE_STEP_ID } from '../planGenerateStep';
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
  /** Turn still streaming — show Planning tail when idle between tools */
  isStreaming?: boolean;
  /** Elapsed work ms for settled "Worked for Xs" label */
  workedDurationMs?: number;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onWorktreeReview?: (subagentId: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
}

/** Thought chevron is reasoning / plan-generate only — DAG diagnostics are cards. */
function isThoughtChrome(step: TimelineStep): boolean {
  return step.kind === 'reasoning' || isPlanGenerateStep(step);
}

/** Cursor-style settled turn duration (ported from MessageBubble). */
function formatWorkedLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 800) return 'Worked briefly';
  if (ms < 60_000) {
    const sec = ms / 1000;
    return `Worked for ${sec >= 10 ? Math.round(sec) : sec.toFixed(1)}s`;
  }
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `Worked for ${m}m ${s}s` : `Worked for ${m}m`;
}

function resolveWorkedMs(items: ConversationWorkEvent[], override?: number): number {
  if (typeof override === 'number' && override >= 0) return override;
  let sum = 0;
  for (const item of items) {
    if (item.startedAt != null && item.completedAt != null) {
      sum += Math.max(0, item.completedAt - item.startedAt);
    }
  }
  return sum;
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
          {collapseExploreSteps(visibleChildren).map((child) =>
            renderTimelineNode(
              child,
              activeStepId,
              onOpenFile,
              onAcceptFile,
              onRejectFile,
              undefined,
              undefined,
              undefined,
              node.subagent.compactFileEdits
            )
          )}
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
  onWorktreeReject?: (subagentId: string) => void,
  compactFileEdit?: boolean
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

  if (node.kind === 'explore') {
    // Exploring/Explored 묶음 — 카드가 아니라 MessageSteps식 chevron 행
    const live = node.step.status === 'running' || node.children.some((c) => c.status === 'running');
    const hasError =
      node.step.status === 'failed' || node.children.some((c) => c.status === 'failed');
    return (
      <ExploreRunRow
        key={node.step.id}
        title={node.step.title}
        childrenSteps={node.children}
        live={live}
        hasError={hasError}
      />
    );
  }

  if (isThoughtChrome(node.step)) {
    return <ThoughtRow key={node.step.id} step={node.step} />;
  }

  return (
    <WorkTimelineStepRow
      key={node.step.id}
      step={node.step}
      activeStepId={activeStepId}
      compactFileEdit={compactFileEdit}
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
  isStreaming = false,
  workedDurationMs,
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
  const live = timelineSummary.hasActive || isStreaming;
  const settled = !timelineSummary.hasActive && !isStreaming;
  const [workedOpen, setWorkedOpen] = useState(defaultOpen || timelineSummary.hasActive || pendingInline);

  useEffect(() => {
    if (isStreaming || timelineSummary.hasActive || pendingInline) {
      setWorkedOpen(true);
    } else if (settled) {
      setWorkedOpen(false);
    }
  }, [isStreaming, timelineSummary.hasActive, pendingInline, settled]);

  // Idle between tool rounds — same tail as legacy MessageSteps
  const showPlanningTail = isStreaming && !timelineSummary.hasActive;
  const planGenRunning = items.some(
    (e) => e.id === PLAN_V2_GENERATE_STEP_ID && e.status === 'running'
  );
  const planningTailTitle = planGenRunning ? 'Creating plan' : 'Planning next moves';

  const workedLabel = title || formatWorkedLabel(resolveWorkedMs(items, workedDurationMs));

  // Live + settled share one item column; settled only adds the "Worked for Xs" header.
  const showItems = !settled || workedOpen;

  const itemNodes = (
    <>
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
      {showPlanningTail ? <PlanningTailRow title={planningTailTitle} /> : null}
    </>
  );

  return (
    <div
      className={[
        'ak-work-timeline',
        settled ? 'ak-work-timeline--settled' : live ? 'ak-work-timeline--live' : '',
        timelineSummary.hasError ? 'ak-work-timeline--error' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {settled ? (
        <button
          type="button"
          className="ak-worked__toggle"
          onClick={() => setWorkedOpen((v) => !v)}
          aria-expanded={workedOpen}
        >
          <span className="ak-worked__chevron" aria-hidden>
            {workedOpen ? '▾' : '▸'}
          </span>
          <span className="ak-worked__label">{workedLabel}</span>
        </button>
      ) : null}
      {showItems ? <div className="ak-work-timeline__items">{itemNodes}</div> : null}
    </div>
  );
}
