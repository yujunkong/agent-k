import React, { useEffect, useMemo, useState } from 'react';
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
import { ExploreRunRow, ThoughtRow } from './ExploreChrome';
import { SubagentRunRow } from './SubagentRunRow';
import { isPlanGenerateStep, PLAN_GENERATE_STEP_ID } from '../planGenerateStep';
import { isPendingInlineEdit } from '../inlineEditReview';
import { FileEditPreviewView } from './FileEditPreviewView';
import { TerminalRunCard } from './TerminalRunCard';
import {
  MessageSteps,
  type MessageStep
} from './MessageSteps';
import { workEventsToMessageSteps } from '../conversation/workEventsToMessageSteps';
import { isSubagentHeaderEvent } from '../conversation/conversationWorkEvent';
import { logTimelineInputOrder } from '../conversation/timelineOrderLog';

export type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';
import type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';

/** @deprecated Use ConversationWorkEvent — stored on message.workItems before presentation mapping. */
export type WorkItem = ConversationWorkEvent;
export type WorkItemKind = ConversationWorkEvent['type'];
export type WorkItemStatus = ConversationWorkEvent['status'];

export interface WorkTimelineProps {
  items: ConversationWorkEvent[];
  /**
   * Parallel host timeline rows (message.steps). Preferred for MessageSteps chrome
   * when present — same sequential Curiosity phases as pre-WorkTimeline.
   */
  steps?: MessageStep[];
  fileEdits?: FileEditPreview[];
  terminalRuns?: TerminalRunPreview[];
  /** Mid-turn sealed prose — MessageSteps folds into Thought / lead / after. */
  turnProse?: Array<{ id: string; turn: number; content: string; afterStepId?: string }>;
  /**
   * Live dig / answer body — MessageSteps slot under Explored (avoids bubble gap jump).
   */
  liveProse?: string;
  defaultOpen?: boolean;
  title?: string;
  /** Turn still streaming — show Planning tail when idle between tools */
  isStreaming?: boolean;
  /** Answer body tokens flowing — hide Planning / settle Exploring */
  hasLiveAnswer?: boolean;
  /** Elapsed work ms for settled "Worked for Xs" label */
  workedDurationMs?: number;
  /**
   * Subagent detail tab: expand group children inline (full progress),
   * do not offer "open in tab" on the progress row.
   */
  subagentDetail?: boolean;
  /** Parent timeline: open a Cursor-style subagent progress tab (no composer). */
  onOpenSubagent?: (subagentId: string, title: string) => void;
  /** SUB-010 — rolling line from child ChatSession (taskId or sess-sub-*) */
  getSubagentRolling?: (subagentId: string) => string | undefined;
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
  getSubagentRolling,
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
  getSubagentRolling?: (subagentId: string) => string | undefined;
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
  const rollingOverride = getSubagentRolling?.(subagentId);

  // Parent conversation: one progress row; click opens detail tab (no nested noise).
  if (!expandInline) {
    return (
      <div
        className={`ak-work-subagent ak-work-subagent--${stepStatusClass(node.step.status)}`}
        data-subagent-id={subagentId}
      >
        <SubagentRunRow
          title={progressTitle}
          role={node.step.role}
          live={live}
          hasError={hasError}
          childrenSteps={visibleChildren}
          rollingOverride={rollingOverride}
          onOpen={() => onOpenSubagent?.(subagentId, progressTitle)}
        />
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

  return (
    <div
      className={`ak-work-subagent ak-work-subagent--detail ak-work-subagent--${stepStatusClass(node.step.status)}`}
      data-subagent-id={subagentId}
    >
      <SubagentRunRow
        title={progressTitle}
        role={node.step.role}
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
  onOpenSubagent?: (subagentId: string, title: string) => void,
  preferCollapsedThought = false,
  getSubagentRolling?: (subagentId: string) => string | undefined
): React.ReactNode {
  if (node.kind === 'group') {
    return (
      <SubagentTimelineGroup
        key={node.step.id}
        node={node}
        activeStepId={activeStepId}
        expandInline={expandSubagentInline}
        onOpenSubagent={onOpenSubagent}
        getSubagentRolling={getSubagentRolling}
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
    return (
      <ThoughtRow
        key={node.step.id}
        step={node.step}
        preferCollapsed={preferCollapsedThought}
      />
    );
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

/**
 * WorkTimeline = mount + workItems store.
 * Main chat chrome = MessageSteps (sequential Curiosity phases + FileEdit/Terminal cards).
 * Subagent detail tab keeps ExploreChrome / TimelineStepCard presentation.
 */
export function WorkTimeline({
  items,
  steps: stepsProp,
  fileEdits = [],
  terminalRuns = [],
  turnProse = [],
  liveProse,
  defaultOpen = false,
  title,
  isStreaming = false,
  hasLiveAnswer = false,
  workedDurationMs,
  subagentDetail = false,
  onOpenSubagent,
  getSubagentRolling,
  onOpenFile,
  onAcceptFile,
  onRejectFile,
  onWorktreeReview,
  onWorktreeApply,
  onWorktreeReject
}: WorkTimelineProps) {
  const hasAny =
    items.length > 0 ||
    (stepsProp?.length ?? 0) > 0 ||
    fileEdits.length > 0 ||
    terminalRuns.length > 0 ||
    Boolean(liveProse?.trim()) ||
    turnProse.length > 0;

  const presentation = useMemo(
    () =>
      buildTimelinePresentation(
        items,
        { fileEdits, terminalRuns },
        { sequential: subagentDetail }
      ),
    [items, fileEdits, terminalRuns, subagentDetail]
  );
  const { summary: timelineSummary } = presentation;
  const pendingInline = fileEdits.some(isPendingInlineEdit);
  // Prefer chronological workItems (includes subagent headers); enrich from host steps.
  const messageSteps = useMemo((): MessageStep[] => {
    const fromItems = workEventsToMessageSteps(items);
    if (!stepsProp?.length) return fromItems;
    const byId = new Map(stepsProp.map((s) => [s.id, s]));
    const seen = new Set<string>();
    const merged = fromItems.map((s) => {
      seen.add(s.id);
      if (s.kind === 'subagent') return s;
      const prev = byId.get(s.id);
      if (!prev) return s;
      return {
        ...prev,
        // Comment: keep workItems detail when step row blanked it
        detail: (prev.detail && prev.detail.trim()) || s.detail,
        openPath: prev.openPath || s.openPath,
        durationMs: prev.durationMs ?? s.durationMs
      };
    });
    for (const s of stepsProp) {
      if (seen.has(s.id)) continue;
      if (s.kind === 'subagent' || s.kind === 'task') continue;
      merged.push(s);
    }
    return merged;
  }, [stepsProp, items]);

  const stepsLive = messageSteps.some((s) => s.itemStatus === 'running');
  const live = timelineSummary.hasActive || isStreaming || stepsLive;
  const settled = !timelineSummary.hasActive && !isStreaming && !stepsLive;
  const [workedOpen, setWorkedOpen] = useState(
    defaultOpen || timelineSummary.hasActive || pendingInline || stepsLive
  );

  useEffect(() => {
    if (isStreaming || timelineSummary.hasActive || pendingInline || stepsLive) {
      setWorkedOpen(true);
    } else if (settled && !subagentDetail) {
      setWorkedOpen(false);
    }
  }, [
    isStreaming,
    timelineSummary.hasActive,
    pendingInline,
    settled,
    subagentDetail,
    stepsLive
  ]);

  const workedLabel = title || formatWorkedLabel(resolveWorkedMs(items, workedDurationMs));
  const showItems = subagentDetail || !settled || workedOpen;

  const subagentGroupNodes = useMemo(
    () => presentation.nodes.filter((n) => n.kind === 'group'),
    [presentation.nodes]
  );

  const hasSubagentHeaders = items.some(isSubagentHeaderEvent);

  // Order diagnostics — Webview DevTools: filter `timeline-order`
  useEffect(() => {
    if (subagentDetail) return;
    const fromSteps = Boolean(stepsProp && stepsProp.length > 0);
    logTimelineInputOrder({
      source: fromSteps ? 'steps' : 'workItems-mapped',
      streaming: isStreaming,
      steps: messageSteps.map((s) => ({
        id: s.id,
        kind: s.kind,
        tool: s.toolName,
        status: s.itemStatus,
        turn: s.turn,
        thoughtRole: s.thoughtRole
      })),
      workItemIds: items.map((e) => `${e.id}:${e.type}:${e.status}${e.subagentId ? `@${e.subagentId}` : ''}`),
      fileEditIds: fileEdits.map((f) => `${f.id}|t${f.turn ?? '?'}|${f.path}`),
      terminalIds: terminalRuns.map((t) => `${t.id}|t${t.turn ?? '?'}`),
      turnProse: turnProse.map((p) => ({
        id: p.id,
        turn: p.turn,
        len: String(p.content || '').length
      }))
    });
  }, [
    subagentDetail,
    stepsProp,
    messageSteps,
    items,
    fileEdits,
    terminalRuns,
    turnProse,
    isStreaming
  ]);

  if (!hasAny) return null;

  const hasExploreToolSteps = messageSteps.some(
    (s) =>
      s.kind === 'reading' ||
      s.kind === 'searching' ||
      s.kind === 'browsing' ||
      s.toolName === 'read_file' ||
      s.toolName === 'read_files' ||
      s.toolName === 'grep' ||
      s.toolName === 'glob' ||
      s.toolName === 'file_search' ||
      s.toolName === 'codebase_search' ||
      s.toolName === 'list_dir'
  );

  // —— Main + subagent detail: same MessageSteps chrome (CONV-013/014) ——
  // Comment: subagent detail reuses MessageSteps; TimelineStepCard is not subagent-only
  const showPlanningTail = subagentDetail
    ? isStreaming && !hasLiveAnswer && !timelineSummary.hasActive
    : isStreaming &&
      !hasLiveAnswer &&
      !stepsLive &&
      !timelineSummary.hasActive &&
      !hasExploreToolSteps &&
      !hasSubagentHeaders;
  const planGenRunning = items.some(
    (e) => e.id === PLAN_GENERATE_STEP_ID && e.status === 'running'
  );
  const planningTailTitle = planGenRunning ? 'Creating plan' : 'Planning next moves';

  // Comment: show shell while streaming dig (no steps yet) so prose isn't in bubble below
  const showMessageSteps =
    messageSteps.length > 0 ||
    turnProse.length > 0 ||
    Boolean(isStreaming && liveProse?.trim()) ||
    showPlanningTail;

  const itemNodes = (
    <>
      {showMessageSteps ? (
        <MessageSteps
          steps={messageSteps}
          fileEdits={fileEdits}
          terminalRuns={terminalRuns}
          turnProse={turnProse}
          liveProse={liveProse}
          liveProseStreaming={Boolean(isStreaming && liveProse?.trim())}
          isStreaming={isStreaming}
          hasLiveAnswer={hasLiveAnswer}
          showPlanningTail={showPlanningTail}
          planningTailTitle={planningTailTitle}
          onOpenFile={onOpenFile}
          onAcceptFile={onAcceptFile}
          onRejectFile={onRejectFile}
          onOpenSubagent={onOpenSubagent}
          getSubagentRolling={getSubagentRolling}
        />
      ) : null}
      {/* Orphan previews when no steps/phases yet to attach MessageSteps cards */}
      {!showMessageSteps && fileEdits.length > 0 ? (
        <div className="ak-file-edits-inline ak-cards-under-action">
          {fileEdits.map((fe) => (
            <FileEditPreviewView
              key={fe.id}
              file={fe}
              onOpenFile={onOpenFile}
              onAccept={onAcceptFile}
              onReject={onRejectFile}
            />
          ))}
        </div>
      ) : null}
      {!showMessageSteps && terminalRuns.length > 0 ? (
        <div className="ak-terminal-runs-inline ak-cards-under-action">
          {terminalRuns.map((tr) => (
            <TerminalRunCard key={tr.id} {...tr} />
          ))}
        </div>
      ) : null}
      {/* Comment: SUB-010 — subagent rows live inside MessageSteps (chronological).
          Only expandInline detail still uses group nodes. */}
      {subagentDetail
        ? subagentGroupNodes.map((node) =>
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
              true,
              onOpenSubagent,
              true,
              getSubagentRolling
            )
          )
        : null}
    </>
  );

  return (
    <div
      className={[
        'ak-work-timeline',
        'ak-work-timeline--message-steps',
        settled ? 'ak-work-timeline--settled' : live ? 'ak-work-timeline--live' : '',
        timelineSummary.hasError ? 'ak-work-timeline--error' : '',
        subagentDetail ? 'ak-work-timeline--subagent-detail' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!subagentDetail && settled ? (
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
