/**
 * WorkTimeline presentation model.
 *
 * Host events → ConversationWorkEvent (event store) → TimelinePresentation (UI).
 * WorkTimeline must not guess structure from label strings.
 */
import type { ConversationWorkEvent, ConversationWorkStatus } from './conversationWorkEvent';
import { isSubagentHeaderEvent } from './conversationWorkEvent';
import type { SubagentResult } from './subagentResult';
import type { FileEditPreview, TerminalRunPreview } from '../types';
import {
  resolveFileEditForEvent,
  resolveTerminalRunForEvent
} from './workEventDetails';
import { worktreeDiffTotals } from './worktreeDiff';

export type SubagentChangesPhase = 'none' | 'progress' | 'final';

export type SubagentGroupPresentation = {
  /** Completed worktree result — hide per-file edit rows (shown in Changes). */
  suppressFileEdits: boolean;
  /** Running subagent — file rows stay compact (path only, no diff panel). */
  compactFileEdits: boolean;
  changesPhase: SubagentChangesPhase;
  editPaths: string[];
  changesTotals?: {
    fileCount: number;
    additions: number;
    deletions: number;
  };
};

export type TimelineStepKind =
  | 'reasoning'
  | 'tool'
  | 'file'
  | 'terminal'
  | 'subagent'
  | 'verify'
  | 'plan'
  | 'generic';

export type TimelineStepStatus = 'running' | 'completed' | 'failed';

export type TimelineStepRef = { kind: 'fileEdit' | 'terminal'; id: string };

export type TimelineStep = {
  id: string;
  kind: TimelineStepKind;
  status: TimelineStepStatus;
  title: string;
  /** Host tool name — Grepped/Grepping vs Searched/Searching */
  toolName?: string;
  /** Elapsed ms when settled — Thought for 2s */
  durationMs?: number;
  /** Primary context line — file path, search query, command snippet */
  subtitle?: string;
  /** Expandable secondary body — reasoning text, error detail */
  body?: string;
  ref?: TimelineStepRef;
  subagentId?: string;
  /** Short Cursor-style progress title (task_run.description). */
  description?: string;
  result?: SubagentResult;
  /** Resolved previews — populated by the builder for render convenience */
  fileEdit?: FileEditPreview;
  terminalRun?: TerminalRunPreview;
};

export type TimelineNode =
  | { kind: 'step'; step: TimelineStep }
  | {
      kind: 'explore';
      step: TimelineStep;
      children: TimelineStep[];
    }
  | {
      kind: 'group';
      step: TimelineStep;
      children: TimelineStep[];
      subagent: SubagentGroupPresentation;
    };

export type TimelinePresentation = {
  nodes: TimelineNode[];
  activeStepId?: string;
  /** Short live label for the timeline summary — e.g. "Reading session.ts". */
  progressLabel?: string;
  summary: {
    stepCount: number;
    hasActive: boolean;
    hasError: boolean;
  };
};

function implicitSubagentHeader(subagentId: string): ConversationWorkEvent {
  return {
    id: `tl_subagent_${subagentId}`,
    type: 'subagent',
    status: 'running',
    label: 'Subagent · running',
    subagentId
  };
}

export function mapWorkStatusToStepStatus(
  status: ConversationWorkStatus = 'complete'
): TimelineStepStatus {
  if (status === 'error') return 'failed';
  if (status === 'complete') return 'completed';
  return 'running';
}

export function mapWorkTypeToStepKind(
  type: ConversationWorkEvent['type']
): TimelineStepKind {
  switch (type) {
    case 'thinking':
      return 'reasoning';
    case 'edit':
      return 'file';
    case 'terminal':
      return 'terminal';
    case 'subagent':
      return 'subagent';
    case 'verify':
      return 'verify';
    case 'plan':
      return 'plan';
    case 'read':
    case 'search':
      return 'tool';
    default:
      return 'generic';
  }
}

function stepTitle(event: ConversationWorkEvent): string {
  if (event.type === 'thinking') {
    const label = String(event.label || '').trim();
    return label === 'Thinking' ? 'Thinking' : label || 'Thinking';
  }
  if (event.type === 'read') {
    return event.status === 'complete' ? 'Read' : 'Reading';
  }
  if (event.type === 'search') {
    if (event.toolName === 'grep') {
      return event.status === 'complete' ? 'Grepped' : 'Grepping';
    }
    return event.status === 'complete' ? 'Searched' : 'Searching';
  }
  if (event.type === 'edit') {
    return event.status === 'complete' ? 'Edited' : 'Editing';
  }
  return event.label;
}

function buildStepFields(
  event: ConversationWorkEvent
): Pick<TimelineStep, 'title' | 'subtitle' | 'body'> {
  const detail = event.detail?.trim();
  if (event.type === 'thinking') {
    return {
      title: stepTitle(event),
      body: detail || undefined
    };
  }
  if (event.type === 'subagent') {
    // Title prefers description so parent progress row matches Cursor task names.
    const title =
      String(event.description || '').trim() ||
      String(event.label || '').replace(/\s*·\s*(running|completed|failed|queued)$/i, '').trim() ||
      'Agent';
    return { title };
  }
  return {
    title: stepTitle(event),
    subtitle: detail || undefined
  };
}

export function eventToTimelineStep(
  event: ConversationWorkEvent,
  previews?: {
    fileEdits?: FileEditPreview[];
    terminalRuns?: TerminalRunPreview[];
  }
): TimelineStep {
  const fields = buildStepFields(event);
  const durationMs =
    event.startedAt != null && event.completedAt != null
      ? Math.max(0, event.completedAt - event.startedAt)
      : undefined;
  const step: TimelineStep = {
    id: event.id,
    kind: mapWorkTypeToStepKind(event.type),
    status: mapWorkStatusToStepStatus(event.status),
    title: fields.title,
    toolName: event.toolName,
    subtitle: fields.subtitle,
    body: fields.body,
    durationMs,
    ref: event.ref,
    subagentId: event.subagentId,
    description: event.description,
    result: event.result
  };
  if (previews?.fileEdits?.length) {
    step.fileEdit = resolveFileEditForEvent(event, previews.fileEdits);
  }
  if (previews?.terminalRuns?.length) {
    step.terminalRun = resolveTerminalRunForEvent(event, previews.terminalRuns);
  }
  return step;
}

/** Nest subagent child rows under their header — same order as groupWorkTimelineItems. */
export function groupTimelineSteps(events: ConversationWorkEvent[] = []): TimelineNode[] {
  const nodes: TimelineNode[] = [];
  const groups = new Map<
    string,
    Extract<TimelineNode, { kind: 'group' }> & { headerEvent: ConversationWorkEvent }
  >();

  const ensureGroup = (
    subagentId: string,
    header?: ConversationWorkEvent
  ): Extract<TimelineNode, { kind: 'group' }> & { headerEvent: ConversationWorkEvent } => {
    const existing = groups.get(subagentId);
    if (existing) {
      if (header && isSubagentHeaderEvent(header)) {
        existing.headerEvent = header;
        existing.step = eventToTimelineStep(header);
      }
      return existing;
    }
    const headerEvent =
      header && isSubagentHeaderEvent(header)
        ? header
        : implicitSubagentHeader(subagentId);
    const headerStep = eventToTimelineStep(headerEvent);
    const group = {
      kind: 'group' as const,
      step: headerStep,
      headerEvent,
      children: [] as TimelineStep[],
      subagent: buildSubagentGroupPresentation(headerStep, [])
    };
    groups.set(subagentId, group);
    nodes.push(group);
    return group;
  };

  for (const event of events) {
    const subagentId = event.subagentId;
    if (!subagentId) {
      nodes.push({ kind: 'step', step: eventToTimelineStep(event) });
      continue;
    }
    if (isSubagentHeaderEvent(event)) {
      ensureGroup(subagentId, event);
      continue;
    }
    ensureGroup(subagentId).children.push(eventToTimelineStep(event));
  }

  return collapseExploreRuns(
    nodes.map((node) => {
      if (node.kind !== 'group') return node;
      return {
        ...node,
        subagent: buildSubagentGroupPresentation(node.step, node.children)
      };
    })
  );
}

export function findActiveStepId(nodes: TimelineNode[]): string | undefined {
  // Prefer the deepest running child so progress emphasizes live tool work,
  // not just a long-running subagent header.
  let fallback: string | undefined;
  for (const node of nodes) {
    if (node.kind === 'group' || node.kind === 'explore') {
      for (const child of node.children) {
        if (child.status === 'running') return child.id;
      }
      if (node.step.status === 'running' && !fallback) fallback = node.step.id;
      continue;
    }
    if (node.step.status === 'running') return node.step.id;
  }
  return fallback;
}

function findStepById(
  nodes: TimelineNode[],
  id: string | undefined
): TimelineStep | undefined {
  if (!id) return undefined;
  for (const node of nodes) {
    if (node.step.id === id) return node.step;
    if (node.kind === 'group' || node.kind === 'explore') {
      const child = node.children.find((entry) => entry.id === id);
      if (child) return child;
    }
  }
  return undefined;
}

export function formatProgressLabel(step: TimelineStep | undefined): string | undefined {
  if (!step || step.status !== 'running') return undefined;
  if (step.kind === 'reasoning') {
    const preview = String(step.body || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (preview) {
      return preview.length > 64 ? `${preview.slice(0, 63)}…` : preview;
    }
    return 'Thinking…';
  }
  if (step.kind === 'subagent') {
    const label = String(step.description || step.title || '')
      .replace(/\s+·\s+(running|completed|failed|queued)$/i, '')
      .trim();
    return label || 'Working…';
  }
  const ACTION_MAP: Partial<Record<TimelineStepKind, string>> = {
    file: 'Editing',
    terminal: 'Running',
    tool: 'Exploring',
    verify: 'Verifying',
    generic: 'Working',
    plan: 'Creating'
  };
  const action = ACTION_MAP[step.kind] || step.title || 'Working';
  const target = step.subtitle || step.fileEdit?.path || step.terminalRun?.command;
  if (target) return `${action} ${target}`;
  return `${action}…`;
}

export function subagentHasAggregatedChanges(result?: SubagentResult): boolean {
  if (!result) return false;
  return (result.filesChanged ?? 0) > 0 || Boolean(result.worktreeReview);
}

function fileEditPath(step: TimelineStep): string | undefined {
  return step.fileEdit?.path || step.subtitle || undefined;
}

/** Presentation rules for subagent groups — dedupe file edits vs worktree Changes. */
export function buildSubagentGroupPresentation(
  step: TimelineStep,
  children: TimelineStep[]
): SubagentGroupPresentation {
  const result = step.result;
  const fileChildren = children.filter((child) => child.kind === 'file');
  const editPaths = fileChildren
    .map(fileEditPath)
    .filter((path): path is string => Boolean(path));
  const hasAggregated = subagentHasAggregatedChanges(result);
  const completed = step.status === 'completed';
  const running = step.status === 'running';

  let changesPhase: SubagentChangesPhase = 'none';
  if (running && editPaths.length > 0) changesPhase = 'progress';
  if (completed && hasAggregated) changesPhase = 'final';

  const totals =
    completed && hasAggregated
      ? worktreeDiffTotals(result?.worktreeReview, result?.filesChanged)
      : undefined;

  return {
    suppressFileEdits: completed && hasAggregated && fileChildren.length > 0,
    compactFileEdits: running && fileChildren.length > 0,
    changesPhase,
    editPaths,
    changesTotals: totals
  };
}

export function visibleSubagentChildren(
  children: TimelineStep[],
  presentation: SubagentGroupPresentation
): TimelineStep[] {
  if (!presentation.suppressFileEdits) return children;
  return children.filter((child) => child.kind !== 'file');
}

/**
 * Explore-run grouping (ported from MessageSteps Exploring/Explored chrome).
 * Consecutive read/search/generic tools — and reasoning between them — collapse
 * into one expandable row. Opening Thought stays a standalone step. File edits,
 * terminal, verify, plan, and subagent groups flush the buffer.
 */
function isExploreBoundary(step: TimelineStep): boolean {
  return (
    step.kind === 'file' ||
    step.kind === 'terminal' ||
    step.kind === 'subagent' ||
    step.kind === 'verify' ||
    step.kind === 'plan'
  );
}

function isExploreTool(step: TimelineStep): boolean {
  if (isExploreBoundary(step) || step.kind === 'reasoning' || step.kind === 'subagent') {
    return false;
  }
  return step.kind === 'tool' || step.kind === 'generic';
}

function summarizeExploreRun(run: TimelineStep[]): TimelineStep {
  const tools = run.filter(isExploreTool);
  const counted = tools.length ? tools : run;
  const anyRunning = counted.some((s) => s.status === 'running');
  const anyDone = counted.some((s) => s.status === 'completed');
  const allFailed = counted.length > 0 && counted.every((s) => s.status === 'failed');
  const status: TimelineStepStatus = anyRunning ? 'running' : allFailed ? 'failed' : 'completed';
  const live = status === 'running';
  const prefix = live ? 'Exploring' : 'Explored';
  const first = run[0];

  if (status === 'failed' && !anyDone) {
    return {
      id: `tl_explore_${first.id}`,
      kind: 'tool',
      status,
      title: counted.length === 1 ? `Failed · ${counted[0].title}` : `Failed · ${counted.length} tools`
    };
  }

  let fileCount = 0;
  let searchCount = 0;
  let otherCount = 0;
  for (const s of tools) {
    if (s.title === 'Read' || s.title === 'Reading') fileCount += 1;
    else if (
      s.title === 'Searched' ||
      s.title === 'Searching' ||
      s.title === 'Grepped' ||
      s.title === 'Grepping'
    ) {
      searchCount += 1;
    } else otherCount += 1;
  }

  const parts: string[] = [];
  if (fileCount) parts.push(`${fileCount} ${fileCount === 1 ? 'file' : 'files'}`);
  if (searchCount) parts.push(`${searchCount} ${searchCount === 1 ? 'search' : 'searches'}`);
  if (otherCount) parts.push(`${otherCount} other ${otherCount === 1 ? 'tool' : 'tools'}`);
  const label = parts.length ? parts.join(', ') : `${tools.length} ${tools.length === 1 ? 'item' : 'items'}`;

  return {
    id: `tl_explore_${first.id}`,
    kind: 'tool',
    status,
    title: `${prefix} ${label}`
  };
}

/**
 * Collapse consecutive explore-class steps into one chrome row with children.
 * Running tools stay inside the group so Exploring N files can render live.
 */
export function collapseExploreRuns(nodes: TimelineNode[]): TimelineNode[] {
  const out: TimelineNode[] = [];
  let buffer: TimelineStep[] = [];

  const bufferHasTool = () => buffer.some(isExploreTool);

  const flush = () => {
    if (!buffer.length) return;
    const tools = buffer.filter(isExploreTool);
    if (!tools.length) {
      for (const step of buffer) out.push({ kind: 'step', step });
      buffer = [];
      return;
    }
    out.push({
      kind: 'explore',
      step: summarizeExploreRun(buffer),
      children: buffer
    });
    buffer = [];
  };

  for (const node of nodes) {
    if (node.kind === 'group') {
      flush();
      out.push(node);
      continue;
    }
    if (node.kind === 'explore') {
      flush();
      out.push(node);
      continue;
    }
    const step = node.step;
    if (isExploreTool(step)) {
      buffer.push(step);
      continue;
    }
    if (step.kind === 'reasoning' && bufferHasTool()) {
      buffer.push(step);
      continue;
    }
    flush();
    out.push(node);
  }
  flush();
  return out;
}

export function collapseExploreSteps(steps: TimelineStep[]): TimelineNode[] {
  return collapseExploreRuns(steps.map((step) => ({ kind: 'step' as const, step })));
}

export function countTimelineSteps(nodes: TimelineNode[]): number {
  return nodes.reduce((total, node) => {
    if (node.kind === 'group') {
      return total + 1 + visibleSubagentChildren(node.children, node.subagent).length;
    }
    // Explore chrome is one row even when it wraps many tool children.
    return total + 1;
  }, 0);
}

function nodeIsActive(node: TimelineNode): boolean {
  if (node.kind === 'group' || node.kind === 'explore') {
    return node.step.status === 'running' || node.children.some((child) => child.status === 'running');
  }
  return node.step.status === 'running';
}

function nodeHasError(node: TimelineNode): boolean {
  if (node.kind === 'group' || node.kind === 'explore') {
    return node.step.status === 'failed' || node.children.some((child) => child.status === 'failed');
  }
  return node.step.status === 'failed';
}

/** Event store + sidecar previews → render-ready presentation tree. */
export function buildTimelinePresentation(
  events: ConversationWorkEvent[] = [],
  previews: {
    fileEdits?: FileEditPreview[];
    terminalRuns?: TerminalRunPreview[];
  } = {}
): TimelinePresentation {
  const fileEdits = previews.fileEdits ?? [];
  const terminalRuns = previews.terminalRuns ?? [];
  const withPreviews = (event: ConversationWorkEvent) =>
    eventToTimelineStep(event, { fileEdits, terminalRuns });

  const nodes: TimelineNode[] = [];
  const groups = new Map<
    string,
    Extract<TimelineNode, { kind: 'group' }> & { headerEvent: ConversationWorkEvent }
  >();

  const ensureGroup = (
    subagentId: string,
    header?: ConversationWorkEvent
  ): Extract<TimelineNode, { kind: 'group' }> & { headerEvent: ConversationWorkEvent } => {
    const existing = groups.get(subagentId);
    if (existing) {
      if (header && isSubagentHeaderEvent(header)) {
        existing.headerEvent = header;
        existing.step = withPreviews(header);
      }
      return existing;
    }
    const headerEvent =
      header && isSubagentHeaderEvent(header)
        ? header
        : implicitSubagentHeader(subagentId);
    const headerStep = withPreviews(headerEvent);
    const group = {
      kind: 'group' as const,
      step: headerStep,
      headerEvent,
      children: [] as TimelineStep[],
      subagent: buildSubagentGroupPresentation(headerStep, [])
    };
    groups.set(subagentId, group);
    nodes.push(group);
    return group;
  };

  for (const event of events) {
    const subagentId = event.subagentId;
    if (!subagentId) {
      nodes.push({ kind: 'step', step: withPreviews(event) });
      continue;
    }
    if (isSubagentHeaderEvent(event)) {
      ensureGroup(subagentId, event);
      continue;
    }
    ensureGroup(subagentId).children.push(withPreviews(event));
  }

  const finalizedNodes: TimelineNode[] = collapseExploreRuns(
    nodes.map((node) => {
      if (node.kind !== 'group') return node;
      return {
        ...node,
        subagent: buildSubagentGroupPresentation(node.step, node.children)
      };
    })
  );

  const stepCount = countTimelineSteps(finalizedNodes);
  const hasActive = finalizedNodes.some(nodeIsActive);
  const hasError = finalizedNodes.some(nodeHasError);

  const activeStepId = findActiveStepId(finalizedNodes);

  return {
    nodes: finalizedNodes,
    activeStepId,
    progressLabel: formatProgressLabel(findStepById(finalizedNodes, activeStepId)),
    summary: { stepCount, hasActive, hasError }
  };
}
