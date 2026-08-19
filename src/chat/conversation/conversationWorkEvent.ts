/**
 * Conversation work-event model.
 *
 * Host tool lifecycle (HostToolLoop / AgentLoop timeline) maps onto this
 * explicit type — WorkTimeline must not guess from label strings.
 */

export type ConversationWorkType =
  | 'read'
  | 'search'
  | 'edit'
  | 'terminal'
  | 'verify'
  | 'generic';

export type ConversationWorkStatus = 'pending' | 'running' | 'complete' | 'error';

export type ConversationWorkEvent = {
  id: string;
  type: ConversationWorkType;
  status: ConversationWorkStatus;
  label: string;
  detail?: string;
  startedAt?: number;
  completedAt?: number;
};

export const WORK_TYPE_LABEL: Record<ConversationWorkType, string> = {
  read: 'Read',
  search: 'Search',
  edit: 'Edit',
  terminal: 'Terminal',
  verify: 'Verify',
  generic: 'Work'
};

const CANONICAL_TYPES = new Set<string>([
  'read',
  'search',
  'edit',
  'terminal',
  'verify',
  'generic'
]);

const NON_WORK_KINDS = new Set([
  'thinking',
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

  const name = String(toolName || '').toLowerCase();
  if (NON_WORK_TOOLS.has(name)) return null;

  if (VERIFY_TOOLS.has(name)) return 'verify';
  if (READ_TOOLS.has(name)) return 'read';
  if (SEARCH_TOOLS.has(name) || name.startsWith('mcp_searxng') || name.includes('web_search')) {
    return 'search';
  }
  if (EDIT_TOOLS.has(name)) return 'edit';
  if (TERMINAL_TOOLS.has(name)) return 'terminal';

  if (kind === 'searching') return 'search';
  if (kind === 'reading') return 'read';
  if (kind === 'editing') return 'edit';
  if (kind === 'running') return 'terminal';
  if (kind === 'browsing' || kind === 'task') return 'generic';
  if (name.startsWith('browser_')) return 'generic';
  if (name.startsWith('mcp_')) return 'search';
  if (name === 'task_run' || name === 'skill_run') return 'generic';

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
  if (value === 'error' || value === 'fail' || value === 'failed') return 'error';
  if (value === 'complete' || value === 'done' || value === 'success') return 'complete';
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
    completedAt: incoming.completedAt ?? prev.completedAt
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
};

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
  return {
    id,
    type,
    status,
    label: WORK_TYPE_LABEL[type],
    detail: data.detail != null ? String(data.detail) : data.error ? String(data.error) : undefined,
    startedAt: status === 'complete' || status === 'error' ? undefined : now,
    completedAt: status === 'complete' || status === 'error' ? now : undefined
  };
}

const LEGACY_WORK_KINDS = new Set([
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
      detail: step.detail
    });
  }
  return out;
}
