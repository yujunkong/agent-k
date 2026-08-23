/**
 * Conversation work-event model.
 *
 * Host tool lifecycle (HostToolLoop / AgentLoop timeline) maps onto this
 * explicit type — WorkTimeline must not guess from label strings.
 */
import type { SubagentResult } from './subagentResult';
import {
  mergeSubagentResult,
  parseSubagentResult
} from './subagentResult';
import { PLAN_GENERATE_STEP_ID } from '../planGenerateStep';
import { shortDetail } from '../../host/timelineLabels';

export type { SubagentResult } from './subagentResult';
export { clipSubagentSummary } from './subagentResult';

export type ConversationWorkType =
  | 'thinking'
  | 'read'
  | 'search'
  | 'edit'
  | 'terminal'
  | 'verify'
  | 'generic'
  | 'subagent'
  | 'plan';

export type ConversationWorkStatus = 'pending' | 'running' | 'complete' | 'error';

export type ConversationWorkEvent = {
  id: string;
  type: ConversationWorkType;
  status: ConversationWorkStatus;
  label: string;
  /** Host tool name — Grepped vs Searched, line-range read detail, etc. */
  toolName?: string;
  detail?: string;
  /** Workspace path for clickable Read / Grepped detail */
  openPath?: string;
  startedAt?: number;
  completedAt?: number;
  /** Child preview: FileEditCard or TerminalRunCard under this row. */
  ref?: { kind: 'fileEdit' | 'terminal'; id: string };
  /** Host subagent id — WorkTimeline groups child rows under this parent. */
  subagentId?: string;
  parentTurnId?: string;
  /** Short Cursor-style progress title from task_run.description (3–5 words). */
  description?: string;
  /** SUB-008 — research/coding/… for RunRow badge */
  role?: string;
  /** Completion stats from subagent.event — not a child transcript. */
  result?: SubagentResult;
  /** Plan execution correlation — connects this event to the DAG run. */
  executionId?: string;
  taskId?: string;
};

export const WORK_TYPE_LABEL: Record<ConversationWorkType, string> = {
  thinking: 'Thinking',
  read: 'Read',
  search: 'Search',
  edit: 'Edit',
  terminal: 'Terminal',
  verify: 'Verify',
  generic: 'Work',
  subagent: 'Subagent',
  plan: 'Plan'
};

const CANONICAL_TYPES = new Set<string>([
  'thinking',
  'read',
  'search',
  'edit',
  'terminal',
  'verify',
  'generic',
  'subagent',
  'plan'
]);

/** Chrome that must not become a timeline row. Thinking is a first-class row. */
const NON_WORK_KINDS = new Set([
  'planning',
  'asking',
  'done',
  'session',
  'error'
]);

const NON_WORK_TOOLS = new Set([
  'ask_question',
  'todo_write',
  'switch_mode',
  'checkpoint_create',
  'checkpoint_restore'
]);

const READ_TOOLS = new Set(['read_file', 'read_files', 'list_dir']);
const SEARCH_TOOLS = new Set([
  'grep',
  'glob',
  'file_search',
  'codebase_search',
  'web_search',
  'web_fetch'
]);
const EDIT_TOOLS = new Set(['edit_file', 'write_file', 'delete_file']);
const TERMINAL_TOOLS = new Set(['run_terminal_cmd', 'terminal_output']);
const VERIFY_TOOLS = new Set(['read_lints']);

export function isCanonicalWorkType(value: unknown): value is ConversationWorkType {
  return typeof value === 'string' && CANONICAL_TYPES.has(value);
}

/** Map a host tool / timeline kind to an explicit work type. Meta chrome returns null. */
export function classifyWorkType(
  toolName?: string,
  timelineKind?: string
): ConversationWorkType | null {
  const kind = String(timelineKind || '').toLowerCase();
  if (NON_WORK_KINDS.has(kind)) return null;
  if (kind === 'thinking') return 'thinking';

  const name = String(toolName || '').toLowerCase();
  if (NON_WORK_TOOLS.has(name)) return null;

  if (VERIFY_TOOLS.has(name)) return 'verify';
  if (READ_TOOLS.has(name)) return 'read';
  if (SEARCH_TOOLS.has(name) || name.startsWith('mcp_searxng') || name.includes('web_search')) {
    return 'search';
  }
  if (EDIT_TOOLS.has(name)) return 'edit';
  if (TERMINAL_TOOLS.has(name)) return 'terminal';
  if (name === 'task_run' || name === 'task') return 'subagent';

  if (kind === 'searching') return 'search';
  if (kind === 'reading') return 'read';
  if (kind === 'editing') return 'edit';
  if (kind === 'running') return 'terminal';
  if (kind === 'browsing') return 'generic';
  if (kind === 'task' && name !== 'skill_run') return 'subagent';
  if (name.startsWith('browser_')) return 'generic';
  if (name.startsWith('mcp_')) return 'search';
  if (name === 'skill_run') return 'generic';

  if (!name && !kind) return null;
  return 'generic';
}

export function workStatusFromHost(
  status?: string,
  error?: string
): ConversationWorkStatus {
  if (error) return 'error';
  const value = String(status || '').toLowerCase();
  if (value === 'pending' || value === 'queued') return 'pending';
  if (value === 'running' || value === 'in_progress' || value === 'active') return 'running';
  if (value === 'error' || value === 'fail' || value === 'failed' || value === 'cancelled' || value === 'canceled') {
    return 'error';
  }
  if (value === 'complete' || value === 'completed' || value === 'done' || value === 'success') {
    return 'complete';
  }
  return 'running';
}

/** Cursor-style detail — line ranges (L10-50), "pattern in path" for grep, etc. */
export function detailFromToolArgs(
  toolName: string,
  args: Record<string, unknown> | undefined
): string | undefined {
  return shortDetail(toolName, args);
}

export function beginWorkEvent(input: {
  id: string;
  toolName?: string;
  timelineKind?: string;
  detail?: string;
  now?: number;
}): ConversationWorkEvent | null {
  const type = classifyWorkType(input.toolName, input.timelineKind);
  if (!type) return null;
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    type,
    status: 'running',
    label: WORK_TYPE_LABEL[type],
    toolName: input.toolName,
    detail: input.detail,
    startedAt: now
  };
}

export function completeWorkEvent(
  event: ConversationWorkEvent,
  input: { error?: string; detail?: string; now?: number } = {}
): ConversationWorkEvent {
  const now = input.now ?? Date.now();
  return {
    ...event,
    status: input.error ? 'error' : 'complete',
    detail: input.detail ?? event.detail,
    completedAt: now
  };
}

/** Patch subagent header result (worktree apply/reject/review UI state). */
export function patchSubagentResultInEvents(
  events: ConversationWorkEvent[] = [],
  subagentId: string,
  patch: (prev: SubagentResult) => SubagentResult
): ConversationWorkEvent[] {
  const id = `tl_subagent_${String(subagentId || '').trim()}`;
  if (!id || id === 'tl_subagent_') return events;
  const idx = events.findIndex((event) => event.id === id);
  if (idx < 0) return events;
  const prev = events[idx];
  const base: SubagentResult = prev.result ?? { subagentId };
  const nextResult = patch({ ...base, subagentId: base.subagentId ?? subagentId });
  return events.map((event, i) =>
    i === idx ? { ...event, result: nextResult } : event
  );
}

export function isTerminalWorkStatus(status: ConversationWorkStatus): boolean {
  return status === 'complete' || status === 'error';
}

export function belongsToSubagent(
  event: ConversationWorkEvent,
  subagentId: string
): boolean {
  const id = String(subagentId || '').trim();
  if (!id) return false;
  return event.subagentId === id || event.id === `tl_subagent_${id}`;
}

/** Upsert by id so one Agent turn keeps appending / updating the same row. */
export function upsertWorkEvents(
  events: ConversationWorkEvent[] = [],
  incoming: ConversationWorkEvent
): ConversationWorkEvent[] {
  const idx = events.findIndex((event) => event.id === incoming.id);
  if (idx < 0) return [...events, incoming];
  const prev = events[idx];
  const prevTerminal = isTerminalWorkStatus(prev.status);
  const incomingLive = incoming.status === 'running' || incoming.status === 'pending';
  // Comment: explore soft-pause seals Thought then resumes same id — allow thinking reopen
  const thinkingResume =
    prev.type === 'thinking' &&
    incoming.type === 'thinking' &&
    prevTerminal &&
    incomingLive;
  // A late "running" ping must not resurrect a finished header/tool (except Thought resume).
  const status =
    prevTerminal && incomingLive && !thinkingResume ? prev.status : incoming.status;
  const merged: ConversationWorkEvent = {
    ...prev,
    ...incoming,
    status,
    type: incoming.type || prev.type,
    label: incoming.label || prev.label,
    toolName: incoming.toolName ?? prev.toolName,
    detail: incoming.detail ?? prev.detail,
    openPath: incoming.openPath ?? prev.openPath,
    description: incoming.description ?? prev.description,
    role: incoming.role ?? prev.role,
    startedAt: prev.startedAt ?? incoming.startedAt,
    completedAt: thinkingResume
      ? undefined
      : prevTerminal && incomingLive
        ? prev.completedAt ?? incoming.completedAt
        : incoming.completedAt ?? prev.completedAt,
    ref: incoming.ref ?? prev.ref,
    subagentId: incoming.subagentId ?? prev.subagentId,
    parentTurnId: incoming.parentTurnId ?? prev.parentTurnId,
    result: mergeSubagentResult(prev.result, incoming.result)
  };
  return events.map((event, i) => (i === idx ? merged : event));
}

export function settleWorkEvents(
  events: ConversationWorkEvent[] = [],
  status: 'complete' | 'error' = 'complete',
  now = Date.now()
): ConversationWorkEvent[] {
  return events.map((event) =>
    event.status === 'running' || event.status === 'pending'
      ? { ...event, status, completedAt: event.completedAt ?? now }
      : event
  );
}

/** Flip leftover running children when the subagent header finishes. */
export function settleSubagentWorkEvents(
  events: ConversationWorkEvent[] = [],
  subagentId: string,
  status: 'complete' | 'error' = 'complete',
  now = Date.now()
): ConversationWorkEvent[] {
  const id = String(subagentId || '').trim();
  if (!id) return events;
  return events.map((event) => {
    if (!belongsToSubagent(event, id)) return event;
    if (event.status !== 'running' && event.status !== 'pending') return event;
    return { ...event, status, completedAt: event.completedAt ?? now };
  });
}

/** Upsert, then settle that subagent's children if the header just finished. */
export function applyWorkEvent(
  events: ConversationWorkEvent[] = [],
  incoming: ConversationWorkEvent
): ConversationWorkEvent[] {
  const merged = upsertWorkEvents(events, incoming);
  if (
    incoming.subagentId &&
    isSubagentHeaderEvent(incoming) &&
    isTerminalWorkStatus(incoming.status)
  ) {
    return settleSubagentWorkEvents(
      merged,
      incoming.subagentId,
      incoming.status === 'error' ? 'error' : 'complete'
    );
  }
  return merged;
}

export type HostWorkPayload = {
  id?: string;
  toolName?: string;
  kind?: string;
  detail?: string;
  openPath?: string;
  status?: string;
  error?: string;
  turn?: number;
  subagentId?: string;
  parentTurnId?: string;
  role?: string;
  prompt?: string;
  description?: string;
  summary?: string;
  filesChanged?: number;
  toolCount?: number;
  duration?: number;
  durationMs?: number;
};

export function subagentRoleTitle(role?: string): string {
  const value = String(role || '').trim().toLowerCase();
  // Comment: Cursor main-row badge — research/explore → Explorer
  if (
    value === 'research' ||
    value === 'explore' ||
    value === 'explorer' ||
    value === 'search'
  ) {
    return 'Explorer';
  }
  if (value === 'coding') return 'Coding';
  if (value === 'review') return 'Review';
  if (value === 'debug') return 'Debug';
  if (value === 'general') return 'Agent';
  return 'Subagent';
}

/**
 * Prefer task_run.description for the progress title; fall back to role + prompt slice.
 */
export function formatSubagentProgressTitle(
  description?: string,
  role?: string,
  prompt?: string
): string {
  const desc = String(description || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (desc) return desc.length > 48 ? `${desc.slice(0, 47)}…` : desc;
  const promptPart = String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  const head = [subagentRoleTitle(role), promptPart].filter(Boolean).join(' ');
  return head || 'Agent';
}

export function formatSubagentGroupLabel(
  role?: string,
  prompt?: string,
  status?: ConversationWorkStatus,
  description?: string
): string {
  const title = formatSubagentProgressTitle(description, role, prompt);
  const statusPart =
    status === 'complete'
      ? 'completed'
      : status === 'error'
        ? 'failed'
        : status === 'pending'
          ? 'queued'
          : 'running';
  return `${title} · ${statusPart}`;
}

export function isSubagentHeaderEvent(item: ConversationWorkEvent): boolean {
  if (item.type === 'subagent') return true;
  return Boolean(item.subagentId && item.id === `tl_subagent_${item.subagentId}`);
}

/**
 * Detail-tab shape: drop the group header and clear subagentId so WorkTimeline
 * uses the same top-level Thought / Exploring / Edit chrome as the main turn.
 *
 * Also seal stale running thoughts that sit above later tool rows — otherwise
 * one Thought stays live at the top while Read/Edit cards pile up below
 * (Cursor expects Thought ▸ tools ▸ Thought ▸ tools).
 */
export function flattenSubagentWorkItems(
  items: ConversationWorkEvent[],
  subagentId: string
): { header?: ConversationWorkEvent; steps: ConversationWorkEvent[] } {
  const id = String(subagentId || '').trim();
  let header: ConversationWorkEvent | undefined;
  const steps: ConversationWorkEvent[] = [];
  for (const event of items) {
    if (
      event.id === `tl_subagent_${id}` ||
      (event.type === 'subagent' && event.subagentId === id)
    ) {
      header = event;
      continue;
    }
    steps.push({ ...event, subagentId: undefined });
  }
  return { header, steps: sealStaleThoughtsBeforeTools(steps) };
}

/**
 * If a thinking row is still "running" but non-thought work already follows it,
 * treat it as complete for display so the next Thought can appear mid-timeline.
 */
export function sealStaleThoughtsBeforeTools(
  events: ConversationWorkEvent[],
  now = Date.now()
): ConversationWorkEvent[] {
  let lastNonThought = -1;
  for (let i = 0; i < events.length; i++) {
    if (events[i].type !== 'thinking') lastNonThought = i;
  }
  if (lastNonThought < 0) return events;
  return events.map((event, index) => {
    if (event.type !== 'thinking') return event;
    if (event.status !== 'running' && event.status !== 'pending') return event;
    if (index >= lastNonThought) return event;
    return {
      ...event,
      status: 'complete' as const,
      completedAt: event.completedAt ?? now
    };
  });
}

/** Host chat.stream subagent.event → group header (summary only, never child transcript). */
export function workEventFromSubagentHostEvent(
  data: Record<string, unknown>
): ConversationWorkEvent | null {
  const taskId = String(data.taskId ?? data.subagentId ?? '').trim();
  if (!taskId) return null;
  const status = workStatusFromHost(String(data.status || ''));
  const prompt = String(data.prompt || '').trim();
  const description =
    data.description != null ? String(data.description).trim() || undefined : undefined;
  const terminal = status === 'complete' || status === 'error';
  return {
    id: `tl_subagent_${taskId}`,
    type: 'subagent',
    status,
    label: formatSubagentGroupLabel(
      data.role != null ? String(data.role) : undefined,
      prompt,
      status,
      description
    ),
    detail: undefined,
    description,
    role: data.role != null ? String(data.role) : undefined,
    result: terminal ? parseSubagentResult(data) : undefined,
    subagentId: taskId,
    parentTurnId:
      data.parentTurnId != null ? String(data.parentTurnId) : undefined,
    startedAt: status === 'complete' || status === 'error' ? undefined : Date.now(),
    completedAt: status === 'complete' || status === 'error' ? Date.now() : undefined
  };
}

/** Host chat.stream tool.start / tool.end / timeline → work event (or null if chrome). */
export function workEventFromHostPayload(
  data: HostWorkPayload,
  fallbackStatus?: ConversationWorkStatus
): ConversationWorkEvent | null {
  const toolName = data.toolName != null ? String(data.toolName) : undefined;
  const kind = data.kind != null ? String(data.kind) : undefined;
  const type = classifyWorkType(toolName, kind);
  if (!type) return null;

  const id =
    data.id != null && String(data.id).trim()
      ? String(data.id)
      : undefined;
  if (!id) return null;

  const status = workStatusFromHost(
    fallbackStatus || data.status,
    data.error
  );
  const now = Date.now();
  const rawDetail =
    data.detail != null
      ? String(data.detail)
      : data.error
        ? String(data.error)
        : undefined;
  const subagentId =
    data.subagentId != null && String(data.subagentId).trim()
      ? String(data.subagentId)
      : undefined;
  const parentTurnId =
    data.parentTurnId != null ? String(data.parentTurnId) : undefined;

  if (type === 'subagent') {
    const description =
      data.description != null
        ? String(data.description).trim() || undefined
        : undefined;
    return {
      id,
      type,
      status,
      label: formatSubagentGroupLabel(
        data.role,
        data.prompt || rawDetail,
        status,
        description
      ),
      detail: undefined,
      description,
      role: data.role != null ? String(data.role) : undefined,
      result:
        status === 'complete' || status === 'error'
          ? parseSubagentResult(data as Record<string, unknown>)
          : undefined,
      startedAt: status === 'complete' || status === 'error' ? undefined : now,
      completedAt: status === 'complete' || status === 'error' ? now : undefined,
      subagentId: subagentId || (id.startsWith('tl_subagent_') ? id.slice('tl_subagent_'.length) : undefined),
      parentTurnId
    };
  }

  return {
    id,
    type,
    status,
    label: WORK_TYPE_LABEL[type],
    toolName,
    detail: rawDetail,
    openPath:
      data.openPath != null && String(data.openPath).trim()
        ? String(data.openPath).trim()
        : undefined,
    startedAt: status === 'complete' || status === 'error' ? undefined : now,
    completedAt: status === 'complete' || status === 'error' ? now : undefined,
    subagentId,
    parentTurnId
  };
}

const LEGACY_WORK_KINDS = new Set([
  'thinking',
  'searching',
  'reading',
  'editing',
  'running',
  'browsing',
  'task'
]);

/** Older transcripts stored tools on `message.steps` — lift work rows only. */
export function workEventsFromLegacySteps(
  steps: Array<{
    id?: string;
    kind?: string;
    label?: string;
    detail?: string;
    toolName?: string;
    itemStatus?: string;
    status?: string;
  }> = []
): ConversationWorkEvent[] {
  const out: ConversationWorkEvent[] = [];
  for (const [index, step] of steps.entries()) {
    const kind = String(step.kind || '');
    if (step.id === PLAN_GENERATE_STEP_ID) {
      const status = workStatusFromHost(step.status || step.itemStatus);
      out.push({
        id: PLAN_GENERATE_STEP_ID,
        type: 'plan',
        status,
        label: step.label || WORK_TYPE_LABEL.plan
      });
      continue;
    }
    if (!LEGACY_WORK_KINDS.has(kind)) continue;
    const type = classifyWorkType(step.toolName, kind);
    if (!type) continue;
    const status = workStatusFromHost(step.status || step.itemStatus);
    out.push({
      id: step.id || `legacy_${type}_${index}`,
      type,
      status,
      label: WORK_TYPE_LABEL[type],
      toolName: step.toolName,
      detail: step.detail
    });
  }
  return out;
}
