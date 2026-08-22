/**
 * HARNESS-007 — Search-before-read nudge (model size independent).
 * Does NOT fail reads — hy3-class models still skip grep; we remind once per run
 * after a blind read batch so the next tool round prefers locate-first.
 */

/** Locate-first tools — satisfy the gate for subsequent reads. */
export const SEARCH_TOOL_NAMES = new Set([
  'grep',
  'glob',
  'file_search',
  'codebase_search',
  'list_dir',
]);

/** Windowed file opens that should preferably follow a search. */
export const READ_TOOL_NAMES = new Set(['read_file', 'read_files']);

export function isSearchTool(name: string): boolean {
  return SEARCH_TOOL_NAMES.has(String(name || '').toLowerCase());
}

export function isReadTool(name: string): boolean {
  return READ_TOOL_NAMES.has(String(name || '').toLowerCase());
}

export function batchHasSearchTool(
  calls: Array<{ name: string }>
): boolean {
  return calls.some((c) => isSearchTool(c.name));
}

/** Pull path-like strings from read_file / read_files args. */
export function readPathsFromArgs(
  name: string,
  args: Record<string, unknown>
): string[] {
  const n = String(name || '').toLowerCase();
  const out: string[] = [];
  if (n === 'read_file') {
    const p = args.path ?? args.file_path ?? args.target_file;
    if (typeof p === 'string' && p.trim()) out.push(p.trim());
    return out;
  }
  if (n === 'read_files') {
    const files = args.files ?? args.paths;
    if (Array.isArray(files)) {
      for (const f of files) {
        if (typeof f === 'string' && f.trim()) out.push(f.trim());
        else if (
          f &&
          typeof f === 'object' &&
          typeof (f as { path?: string }).path === 'string'
        ) {
          out.push(String((f as { path: string }).path).trim());
        }
      }
    }
  }
  return out;
}

/**
 * True when the user message already names this path (exact or basename).
 * No nudge when the user asked to open that file.
 */
export function userMessageHintsPath(
  userText: string,
  filePath: string
): boolean {
  const text = String(userText || '');
  const path = String(filePath || '').replace(/\\/g, '/').trim();
  if (!text.trim() || !path) return false;
  if (text.includes(path)) return true;
  const base = path.split('/').filter(Boolean).pop() || '';
  if (base.length >= 3 && text.includes(base)) return true;
  return false;
}

export function allReadPathsHintedByUser(
  name: string,
  args: Record<string, unknown>,
  userText: string
): boolean {
  const paths = readPathsFromArgs(name, args);
  if (!paths.length) return false;
  return paths.every((p) => userMessageHintsPath(userText, p));
}

/** One-shot system nudge after a blind read batch (reads still succeed). */
export const SEARCH_BEFORE_READ_NUDGE =
  'Harness note: you opened files without a prior locate tool this run. For the next exploration step prefer grep (or codebase_search / glob) before more read_file calls, then read only hit windows. Same-batch search+read is fine.';

/** @deprecated alias — kept for older imports */
export const SEARCH_BEFORE_READ_MESSAGE = SEARCH_BEFORE_READ_NUDGE;

/**
 * True when this read is "blind" (nudge candidate) — never used to fail the tool.
 */
export function isBlindReadWithoutSearch(opts: {
  toolName: string;
  args: Record<string, unknown>;
  batch: Array<{ name: string }>;
  searchSatisfied: boolean;
  userText: string;
}): boolean {
  if (!isReadTool(opts.toolName)) return false;
  if (opts.searchSatisfied) return false;
  if (batchHasSearchTool(opts.batch)) return false;
  if (allReadPathsHintedByUser(opts.toolName, opts.args, opts.userText)) {
    return false;
  }
  return true;
}

/** @deprecated use isBlindReadWithoutSearch */
export const shouldBlockBlindRead = isBlindReadWithoutSearch;

/** True if any call in the batch is a blind read (batch-level nudge). */
export function batchHasBlindRead(opts: {
  batch: Array<{ name: string; arguments?: Record<string, unknown> }>;
  searchSatisfied: boolean;
  userText: string;
}): boolean {
  return opts.batch.some((c) =>
    isBlindReadWithoutSearch({
      toolName: c.name,
      args: c.arguments ?? {},
      batch: opts.batch,
      searchSatisfied: opts.searchSatisfied,
      userText: opts.userText,
    })
  );
}
