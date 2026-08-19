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

export type TimelineStepKind =
  | 'reasoning'
  | 'tool'
  | 'file'
  | 'terminal'
  | 'subagent'
  | 'verify'
  | 'generic';

export type TimelineStepStatus = 'running' | 'completed' | 'failed';

export type TimelineStepRef = { kind: 'fileEdit' | 'terminal'; id: string };

export type TimelineStep = {
  id: string;
  kind: TimelineStepKind;
  status: TimelineStepStatus;
  title: string;
  /** Primary context line — file path, search query, command snippet */
  subtitle?: string;
  /** Expandable secondary body — reasoning text, error detail */
  body?: string;
  ref?: TimelineStepRef;
  subagentId?: string;
  result?: SubagentResult;
  /** Resolved previews — populated by the builder for render convenience */
  fileEdit?: FileEditPreview;
  terminalRun?: TerminalRunPreview;
};

export type TimelineNode =
  | { kind: 'step'; step: TimelineStep }
  | { kind: 'group'; step: TimelineStep; children: TimelineStep[] };

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
    return label === 'Thinking' ? 'Thought' : label || 'Thought';
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
    return { title: event.label };
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
  const step: TimelineStep = {
    id: event.id,
    kind: mapWorkTypeToStepKind(event.type),
    status: mapWorkStatusToStepStatus(event.status),
    title: fields.title,
    subtitle: fields.subtitle,
    body: fields.body,
    ref: event.ref,
    subagentId: event.subagentId,
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
    const group = {
      kind: 'group' as const,
      step: eventToTimelineStep(headerEvent),
      headerEvent,
      children: [] as TimelineStep[]
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

  return nodes;
}

export function findActiveStepId(nodes: TimelineNode[]): string | undefined {
  // Prefer the deepest running child so progress emphasizes live tool work,
  // not just a long-running subagent header.
  let fallback: string | undefined;
  for (const node of nodes) {
    if (node.kind === 'group') {
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
    if (node.kind === 'group') {
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
    const label = String(step.title || '')
      .replace(/\s+·\s+(running|completed|failed|queued)$/i, '')
      .trim();
    return label || 'Working…';
  }
  const action =
    step.kind === 'file'
      ? 'Editing'
      : step.kind === 'terminal'
        ? 'Running'
        : step.title || 'Working';
  const target = step.subtitle || step.fileEdit?.path || step.terminalRun?.command;
  if (target) return `${action} ${target}`;
  return `${action}…`;
}

export function countTimelineSteps(nodes: TimelineNode[]): number {
  return nodes.reduce((total, node) => {
    if (node.kind === 'group') {
      return total + 1 + node.children.length;
    }
    return total + 1;
  }, 0);
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
    const group = {
      kind: 'group' as const,
      step: withPreviews(headerEvent),
      headerEvent,
      children: [] as TimelineStep[]
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

  const stepCount = countTimelineSteps(nodes);
  const hasActive = nodes.some((node) => {
    if (node.kind === 'group') {
      return (
        node.step.status === 'running' ||
        node.children.some((child) => child.status === 'running')
      );
    }
    return node.step.status === 'running';
  });
  const hasError = nodes.some((node) => {
    if (node.kind === 'group') {
      return (
        node.step.status === 'failed' ||
        node.children.some((child) => child.status === 'failed')
      );
    }
    return node.step.status === 'failed';
  });

  const activeStepId = findActiveStepId(nodes);

  return {
    nodes,
    activeStepId,
    progressLabel: formatProgressLabel(findStepById(nodes, activeStepId)),
    summary: { stepCount, hasActive, hasError }
  };
}
