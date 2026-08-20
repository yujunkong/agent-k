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
import { SubagentRunRow } from './SubagentRunRow';
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
  /**
   * Subagent detail tab: expand group children inline (full progress),
   * do not offer "open in tab" on the progress row.
   */
  subagentDetail?: boolean;
  /** Parent timeline: open a Cursor-style subagent progress tab (no composer). */
  onOpenSubagent?: (subagentId: string, title: string) => void;
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
  expandInline = false,
  onOpenSubagent,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onWorktreeReview,
  onWorktreeApply,
  onWorktreeReject
}: {
  node: Extract<TimelineNode, { kind: 'group' }>;
  activeStepId?: string;
  /** Detail tab: show full child timeline; parent: progress row → open tab */
  expandInline?: boolean;
  onOpenSubagent?: (subagentId: string, title: string) => void;
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
  const live = node.step.status === 'running';
  const hasError = node.step.status === 'failed';
  // Prefer short task_run description for Cursor-style progress title.
  const progressTitle =
    String(node.step.description || '').trim() ||
    String(node.step.title || '')
      .replace(/\s*·\s*(running|completed|failed|queued)$/i, '')
      .trim() ||
    'Agent';

  // Parent conversation: one progress row; click opens detail tab (no nested noise).
  if (!expandInline) {
    return (
      <div
        className={`ak-work-subagent ak-work-subagent--${stepStatusClass(node.step.status)}`}
        data-subagent-id={subagentId}
      >
        <SubagentRunRow
          title={progressTitle}
          live={live}
          hasError={hasError}
          childrenSteps={visibleChildren}
          onOpen={() => onOpenSubagent?.(subagentId, progressTitle)}
        />
        {/* Completed changes stay one click away in the detail tab */}
      </div>
    );
  }

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

  // Detail tab: same progress surface as main chat — header + child steps.
  return (
    <div
      className={`ak-work-subagent ak-work-subagent--detail ak-work-subagent--${stepStatusClass(node.step.status)}`}
      data-subagent-id={subagentId}
    >
      <SubagentRunRow
        title={progressTitle}
        live={live}
        hasError={hasError}
        childrenSteps={visibleChildren}
        interactive={false}
        onOpen={() => {
          /* Already in detail — row is informational */
        }}
      />
      {agentBody}
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
              node.subagent.compactFileEdits,
              true,
              onOpenSubagent
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
  compactFileEdit?: boolean,
  expandSubagentInline?: boolean,
  onOpenSubagent?: (subagentId: string, title: string) => void
): React.ReactNode {
  if (node.kind === 'group') {
    return (
      <SubagentTimelineGroup
        key={node.step.id}
        node={node}
        activeStepId={activeStepId}
        expandInline={expandSubagentInline}
        onOpenSubagent={onOpenSubagent}
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
  subagentDetail = false,
  onOpenSubagent,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onWorktreeReview,
  onWorktreeApply,
  onWorktreeReject
}: WorkTimelineProps) {
  if (!items.length) return null;
  const presentation = buildTimelinePresentation(
    items,
    { fileEdits, terminalRuns },
    { sequential: subagentDetail }
  );
  const { summary: timelineSummary } = presentation;
  const pendingInline = fileEdits.some(isPendingInlineEdit);
  const live = timelineSummary.hasActive || isStreaming;
  const settled = !timelineSummary.hasActive && !isStreaming;
  const [workedOpen, setWorkedOpen] = useState(defaultOpen || timelineSummary.hasActive || pendingInline);

  useEffect(() => {
    if (isStreaming || timelineSummary.hasActive || pendingInline) {
      setWorkedOpen(true);
    } else if (settled && !subagentDetail) {
      setWorkedOpen(false);
    }
  }, [isStreaming, timelineSummary.hasActive, pendingInline, settled, subagentDetail]);

  // Idle between tool rounds — same tail as legacy MessageSteps
  const showPlanningTail = isStreaming && !timelineSummary.hasActive;
  const planGenRunning = items.some(
    (e) => e.id === PLAN_V2_GENERATE_STEP_ID && e.status === 'running'
  );
  const planningTailTitle = planGenRunning ? 'Creating plan' : 'Planning next moves';

  const workedLabel = title || formatWorkedLabel(resolveWorkedMs(items, workedDurationMs));

  // Live + settled share one item column; settled only adds the "Worked for Xs" header.
  // Subagent detail stays open — no Worked collapse (tab title is the chrome).
  const showItems = subagentDetail || !settled || workedOpen;

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
          onWorktreeReject,
          undefined,
          subagentDetail,
          onOpenSubagent
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
        timelineSummary.hasError ? 'ak-work-timeline--error' : '',
        subagentDetail ? 'ak-work-timeline--subagent-detail' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {settled && !subagentDetail ? (
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
