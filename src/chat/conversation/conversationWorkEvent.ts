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
  | 'subagent';

export type ConversationWorkStatus = 'pending' | 'running' | 'complete' | 'error';

export type ConversationWorkEvent = {
  id: string;
  type: ConversationWorkType;
  status: ConversationWorkStatus;
  label: string;
  detail?: string;
  startedAt?: number;
  completedAt?: number;
  /** Child preview: FileEditCard or TerminalRunCard under this row. */
  ref?: { kind: 'fileEdit' | 'terminal'; id: string };
  /** Host subagent id — WorkTimeline groups child rows under this parent. */
  subagentId?: string;
  parentTurnId?: string;
  /** Completion stats from subagent.event — not a child transcript. */
  result?: SubagentResult;
};

export const WORK_TYPE_LABEL: Record<ConversationWorkType, string> = {
  thinking: 'Thinking',
  read: 'Read',
  search: 'Search',
  edit: 'Edit',
  terminal: 'Terminal',
  verify: 'Verify',
  generic: 'Work',
  subagent: 'Subagent'
};

const CANONICAL_TYPES = new Set<string>([
  'thinking',
  'read',
  'search',
  'edit',
  'terminal',
  'verify',
  'generic',
  'subagent'
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

export function detailFromToolArgs(
  toolName: string,
  args: Record<string, unknown> | undefined
): string | undefined {
  if (!args) return undefined;
  const name = toolName.toLowerCase();

  if (name === 'grep') {
    const pattern = String(args.pattern ?? args.query ?? '').trim();
    return pattern || undefined;
  }
  if (name === 'glob' || name === 'file_search') {
    const pattern = String(args.glob_pattern ?? args.pattern ?? args.query ?? '').trim();
    return pattern || undefined;
  }
  if (name === 'read_files' && Array.isArray(args.paths) && args.paths.length) {
    const first = String(args.paths[0] ?? '');
    const base = first.replace(/\\/g, '/').split('/').pop() || first;
    return args.paths.length === 1 ? base : `${args.paths.length} files · ${base}`;
  }
  if (name === 'run_terminal_cmd' || name === 'terminal_output') {
    const cmd = String(args.command ?? args.cmd ?? args.description ?? '').trim();
    return cmd ? (cmd.length > 80 ? `${cmd.slice(0, 77)}…` : cmd) : undefined;
  }

  const pick =
    args.path ??
    args.target_file ??
    args.file_path ??
    args.filepath ??
    args.file ??
    args.target ??
    args.glob_pattern ??
    args.pattern ??
    args.query ??
    args.command ??
    args.url;
  if (pick == null) return undefined;
  const s = String(pick).replace(/\\/g, '/');
  const base = s.split('/').filter(Boolean).pop() || s;
  return base.length > 80 ? `${base.slice(0, 77)}…` : base;
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

/** Upsert by id so one Agent turn keeps appending / updating the same row. */
export function upsertWorkEvents(
  events: ConversationWorkEvent[] = [],
  incoming: ConversationWorkEvent
): ConversationWorkEvent[] {
  const idx = events.findIndex((event) => event.id === incoming.id);
  if (idx < 0) return [...events, incoming];
  const prev = events[idx];
  const merged: ConversationWorkEvent = {
    ...prev,
    ...incoming,
    type: incoming.type || prev.type,
    label: incoming.label || prev.label,
    detail: incoming.detail ?? prev.detail,
    startedAt: prev.startedAt ?? incoming.startedAt,
    completedAt: incoming.completedAt ?? prev.completedAt,
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

export type HostWorkPayload = {
  id?: string;
  toolName?: string;
  kind?: string;
  detail?: string;
  status?: string;
  error?: string;
  turn?: number;
  subagentId?: string;
  parentTurnId?: string;
  role?: string;
  prompt?: string;
  summary?: string;
  filesChanged?: number;
  toolCount?: number;
  duration?: number;
  durationMs?: number;
};

export function subagentRoleTitle(role?: string): string {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'research') return 'Research';
  if (value === 'coding') return 'Coding';
  if (value === 'review') return 'Review';
  if (value === 'debug') return 'Debug';
  return 'Subagent';
}

export function formatSubagentGroupLabel(
  role?: string,
  prompt?: string,
  status?: ConversationWorkStatus
): string {
  const promptPart = String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  const statusPart =
    status === 'complete'
      ? 'completed'
      : status === 'error'
        ? 'failed'
        : status === 'pending'
          ? 'queued'
          : 'running';
  const head = [subagentRoleTitle(role), promptPart].filter(Boolean).join(' ');
  return `${head} · ${statusPart}`;
}

export function isSubagentHeaderEvent(item: ConversationWorkEvent): boolean {
  if (item.type === 'subagent') return true;
  return Boolean(item.subagentId && item.id === `tl_subagent_${item.subagentId}`);
}

/** Host chat.stream subagent.event → group header (summary only, never child transcript). */
export function workEventFromSubagentHostEvent(
  data: Record<string, unknown>
): ConversationWorkEvent | null {
  const taskId = String(data.taskId ?? data.subagentId ?? '').trim();
  if (!taskId) return null;
  const status = workStatusFromHost(String(data.status || ''));
  const prompt = String(data.prompt || '').trim();
  const terminal = status === 'complete' || status === 'error';
  return {
    id: `tl_subagent_${taskId}`,
    type: 'subagent',
    status,
    label: formatSubagentGroupLabel(
      data.role != null ? String(data.role) : undefined,
      prompt,
      status
    ),
    detail: undefined,
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
    return {
      id,
      type,
      status,
      label: formatSubagentGroupLabel(
        data.role,
        data.prompt || rawDetail,
        status
      ),
      detail: undefined,
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
    // Thinking stays a compact row — reasoning text lives on message.steps.
    detail: type === 'thinking' ? undefined : rawDetail,
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
    if (!LEGACY_WORK_KINDS.has(kind)) continue;
    const type = classifyWorkType(step.toolName, kind);
    if (!type) continue;
    const status = workStatusFromHost(step.status || step.itemStatus);
    out.push({
      id: step.id || `legacy_${type}_${index}`,
      type,
      status,
      label: WORK_TYPE_LABEL[type],
      detail: type === 'thinking' ? undefined : step.detail
    });
  }
  return out;
}
