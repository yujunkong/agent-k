/** Pure timeline label helpers used by runHostChatSend. */

/** Matches executor default window (ContextRules TIER_A defaultReadLines). */
const DEFAULT_READ_LINES = 250;

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function fileBasename(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path;
  return base.length > 80 ? `${base.slice(0, 77)}…` : base;
}

/**
 * Cursor-style read window: "WorkTimeline.tsx L1-80".
 * Args (offset/limit) or result (startLine/endLine). Offset omitted → L1 + default window.
 */
export function formatReadLineWindow(
  filePath: string,
  src: Record<string, unknown> | undefined,
  fallbackLimit = DEFAULT_READ_LINES
): string {
  const base = fileBasename(filePath || 'file');
  const start =
    asFiniteNumber(src?.startLine) ??
    asFiniteNumber(src?.start_line) ??
    asFiniteNumber(src?.offset) ??
    1;
  const endFromResult =
    asFiniteNumber(src?.endLine) ?? asFiniteNumber(src?.end_line);
  const limit = asFiniteNumber(src?.limit);
  const end =
    endFromResult != null
      ? endFromResult
      : limit != null && limit > 0
        ? start + Math.floor(limit) - 1
        : start + fallbackLimit - 1;
  const lo = Math.max(1, Math.floor(start));
  const hi = Math.max(lo, Math.floor(end));
  return `${base} L${lo}-${hi}`;
}

// PRD-C0 §5.3: map tool name → timeline kind
export const toolKind = (name: string): string => {
  if (
    name === 'grep' ||
    name === 'glob' ||
    name === 'file_search' ||
    name === 'codebase_search' ||
    name === 'web_search' ||
    name === 'web_fetch' ||
    name.startsWith('mcp_searxng') ||
    name.includes('web_search')
  ) {
    return 'searching';
  }
  if (name === 'read_file' || name === 'read_files' || name === 'list_dir' || name === 'read_lints') {
    return 'reading';
  }
  if (
    name === 'edit_file' ||
    name === 'write_file' ||
    name === 'delete_file'
  ) {
    return 'editing';
  }
  // Only real shell tools are "running" — else UI says "Ran a command" wrongly
  if (name === 'run_terminal_cmd' || name === 'terminal_output') {
    return 'running';
  }
  if (name.startsWith('browser_')) return 'browsing';
  if (name === 'ask_question') return 'asking';
  // Session chrome — not a shell command
  if (
    name === 'todo_write' ||
    name === 'switch_mode' ||
    name === 'checkpoint_create' ||
    name === 'checkpoint_restore'
  ) {
    return 'session';
  }
  if (name === 'task_run' || name === 'skill_run') return 'task';
  // Other MCP tools still count as explore/search surface
  if (name.startsWith('mcp_')) return 'searching';
  return 'task';
};

export const kindVerb = (kind: string): string => {
  switch (kind) {
    case 'searching':
      return 'Searching';
    case 'reading':
      return 'Reading';
    case 'editing':
      return 'Editing';
    case 'running':
      return 'Running';
    case 'browsing':
      return 'Browsing';
    case 'asking':
      return 'Asking';
    case 'session':
      return 'Updating';
    case 'task':
      return 'Working';
    default:
      return 'Working';
  }
};

// Short path/pattern only — never dump full tool JSON (PRD-C0 §5.3)
// Cursor-style: "Grepped pattern in path", "Read file.ts L10-50"
export const shortDetail = (
  name: string,
  args: Record<string, unknown> | undefined
): string | undefined => {
  if (!args) return undefined;

  if (name === 'grep') {
    const pattern = String(args.pattern ?? args.query ?? '').trim();
    const path = String(
      args.path ?? args.target ?? args.glob ?? args.glob_pattern ?? ''
    ).trim();
    const scope =
      !path || path === '.' || path === './'
        ? 'workspace'
        : path.replace(/\\/g, '/');
    if (pattern && scope) {
      const p = pattern.length > 48 ? `${pattern.slice(0, 45)}…` : pattern;
      const s = scope.length > 40 ? `${scope.slice(0, 37)}…` : scope;
      return `${p} in ${s}`;
    }
    if (pattern) return pattern.length > 80 ? `${pattern.slice(0, 77)}…` : pattern;
    if (scope) return scope;
  }

  if (name === 'glob' || name === 'file_search') {
    const pattern = String(
      args.glob_pattern ?? args.pattern ?? args.query ?? ''
    ).trim();
    const path = String(args.path ?? '').trim();
    if (pattern && path && path !== '.' && path !== './') {
      return `${pattern} in ${path}`;
    }
    if (pattern) return pattern.length > 80 ? `${pattern.slice(0, 77)}…` : pattern;
  }

  if (name === 'read_file' || name === 'read_files') {
    if (name === 'read_files' && Array.isArray(args.paths) && args.paths.length) {
      const n = args.paths.length;
      const first = String(args.paths[0] ?? '');
      const window = formatReadLineWindow(first, args);
      return n === 1 ? window : `${n} files · ${window}`;
    }
    const file = String(
      args.path ??
        args.target_file ??
        args.file_path ??
        args.filepath ??
        args.file ??
        ''
    ).trim();
    if (!file) return undefined;
    // Always show the window — executor defaults to ~250 lines even without offset.
    return formatReadLineWindow(file, args);
  }

  if (name === 'run_terminal_cmd' || name === 'terminal_output') {
    const cmd = String(
      args.command ?? args.cmd ?? args.shell ?? args.description ?? ''
    ).trim();
    if (!cmd) return undefined;
    return cmd.length > 80 ? `${cmd.slice(0, 77)}…` : cmd;
  }

  if (name === 'todo_write') {
    if (Array.isArray(args.todos)) return `${args.todos.length} todo(s)`;
    const text = String(args.text ?? args.content ?? '').trim();
    if (text) return text.length > 60 ? `${text.slice(0, 57)}…` : text;
    return 'todos';
  }

  // ADDON-T09: task_run running badge — show the sub-agent's task description
  if (name === 'task_run') {
    const label = String(args.description ?? args.task ?? '').trim();
    return label ? (label.length > 60 ? `${label.slice(0, 57)}…` : label) : 'running';
  }

  if (Array.isArray(args.paths) && args.paths.length) {
    const n = args.paths.length;
    const first = String(args.paths[0] ?? '');
    const base = first.replace(/\\/g, '/').split('/').pop() || first;
    return n === 1 ? base.slice(0, 80) : `${n} files · ${base.slice(0, 40)}`;
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
    args.url ??
    args.uri;
  if (pick == null) return undefined;
  const s = String(pick);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
};

export const resultDetail = (
  kind: string,
  result: { success: boolean; data?: unknown; error?: string },
  toolName?: string
): string | undefined => {
  if (!result.success) {
    const err = String(result.error || 'failed');
    // Prefer command stderr/stdout snippet for terminal failures in the timeline
    if (
      toolName === 'run_terminal_cmd' &&
      result.data &&
      typeof result.data === 'object'
    ) {
      const d = result.data as Record<string, unknown>;
      const snippet = String(d.stderr || d.stdout || err).trim();
      return snippet.length > 60 ? `${snippet.slice(0, 57)}…` : snippet || err;
    }
    return err.length > 60 ? `${err.slice(0, 57)}…` : err;
  }
  const data = result.data;
  if (Array.isArray(data)) return `${data.length} result(s)`;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // ADDON-T09: task_run completed/timeout/cancelled badge (SubAgentResult status)
    if (toolName === 'task_run' && typeof obj.status === 'string') {
      return String(obj.status);
    }
    if (Array.isArray(obj.files)) return `${obj.files.length} file(s)`;
    if (typeof obj.count === 'number' && toolName === 'read_files') {
      return `${obj.count} file(s)`;
    }
    if (Array.isArray(obj.matches)) return `${obj.matches.length} match(es)`;
    // read_file result: actual window, never the whole abs path
    if (
      (toolName === 'read_file' || toolName === 'read_files') &&
      (typeof obj.path === 'string' || obj.startLine != null)
    ) {
      return formatReadLineWindow(String(obj.path || ''), obj);
    }
    if (typeof obj.path === 'string') return fileBasename(String(obj.path));
    if (typeof obj.command === 'string') {
      const cmd = String(obj.command);
      return cmd.length > 60 ? `${cmd.slice(0, 57)}…` : cmd;
    }
    if (typeof obj.count === 'number') return `${obj.count}`;
  }
  if (kind === 'reading') return 'ok';
  if (kind === 'searching') return 'done';
  return undefined;
};

/** Grep keeps "pattern in path"; reads upgrade to the executed L-window. */
export function pickExploreDetail(input: {
  name: string;
  kind: string;
  success: boolean;
  startDetail?: string;
  endDetail?: string;
}): string | undefined {
  const { name, kind, success, startDetail, endDetail } = input;
  if (!success) return endDetail || startDetail;
  if (
    (name === 'read_file' || name === 'read_files') &&
    endDetail &&
    /\sL\d/.test(endDetail)
  ) {
    return endDetail;
  }
  const keepStart =
    kind === 'searching' ||
    kind === 'reading' ||
    kind === 'browsing' ||
    name === 'grep' ||
    name === 'read_file' ||
    name === 'read_files' ||
    name === 'glob' ||
    name === 'file_search' ||
    name === 'codebase_search' ||
    name === 'list_dir';
  if (keepStart && startDetail) return startDetail;
  return endDetail || startDetail;
}
