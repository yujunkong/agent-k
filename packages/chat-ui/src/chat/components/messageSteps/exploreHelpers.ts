/**
 * Shared pure helpers for Cursor-style Exploring/Explored chrome (V31-UI-05).
 *
 * Extracted from MessageSteps.tsx + ExploreChrome.tsx. The two callers carry
 * different step shapes (MessageStep: label/detail/itemStatus,
 * TimelineStep: title/subtitle/status), so the fallback branches below keep
 * each caller's exact output — extraction must not change rendered labels.
 */
import { isPlanGenerateStep } from '../../planGenerateStep';

/**
 * UI display cap for Thought body (host may send more).
 * Comment: V31-THOUGHT — Cursor-short pane; model still streams full reasoning.
 */
export const THOUGHT_DISPLAY_MAX = 4000;
/** Exploring mid-Thought — keep the nested pane short */
export const MID_THOUGHT_DISPLAY_MAX = 600;

/**
 * Minimal structural input both callers satisfy.
 * `itemStatus` is MessageSteps' live flag; `status` is TimelineStep's.
 */
export interface ExploreStepLike {
  id?: string;
  kind?: string;
  title?: string;
  label?: string;
  toolName?: string;
  detail?: string;
  subtitle?: string;
  status?: 'running' | 'done' | 'error' | string;
  /** MessageSteps.MessageStep live flag */
  itemStatus?: 'running' | 'done' | 'error' | string;
  durationMs?: number;
}

export function fileBasename(detail?: string): string | undefined {
  if (!detail?.trim()) return undefined;
  const norm = detail.replace(/\\/g, '/').split('/').filter(Boolean);
  const base = norm[norm.length - 1] || detail.trim();
  if (!base || base === '.' || base === '..') return undefined;
  return base.length > 40 ? `${base.slice(0, 38)}…` : base;
}

export function shortPath(detail?: string): string {
  if (!detail) return '';
  const parts = detail.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return detail;
  return `…/${parts.slice(-2).join('/')}`;
}

export function formatExploreDetail(detail?: string): string {
  if (!detail) return '';
  // Already Cursor-formatted ("pattern in path", "file.ts L10-20")
  if (/\sin\s/.test(detail) || /\sL\d/.test(detail)) {
    return detail.length > 100 ? `${detail.slice(0, 97)}…` : detail;
  }
  return shortPath(detail);
}

/**
 * Cursor-style verb for explore/action rows (Read / Grepped / …).
 *
 * Common explore-tool names are shared. The fallback keeps each caller's
 * original output: TimelineStep is title-first (ExploreChrome), MessageStep
 * is tool-name/kind-first (MessageSteps).
 */
export function toolRowLabel(step: ExploreStepLike): string {
  const title = step.title;
  const raw = title ?? step.label ?? '';
  const name = (step.toolName || raw.replace(/\s*·.*$/, '') || '').toLowerCase();
  switch (name) {
    case 'read_file':
    case 'read_files':
      return 'Read';
    case 'grep':
      return 'Grepped';
    case 'glob':
    case 'file_search':
      return 'Searched';
    case 'list_dir':
      return 'Listed';
    case 'codebase_search':
      // Comment: V31-UI-19 — Cursor-short verb (was "Searched codebase").
      return 'Searched';
    case 'read_lints':
      return 'Linted';
    case 'web_search':
      return 'Searched';
    case 'web_fetch':
      return 'Fetched';
  }
  if (title != null) {
    // TimelineStep (ExploreChrome) — title-first fallback
    if (/^read/i.test(title)) return 'Read';
    if (/^grep/i.test(title)) return 'Grepped';
    if (/^search/i.test(title)) return 'Searched';
    if (/^list/i.test(title)) return 'Listed';
    if (step.kind === 'reasoning') return 'Thought';
    return title.split(' · ')[0]?.trim() || 'Tool';
  }
  // MessageStep (MessageSteps) — tool-name switch + kind fallback
  switch (name) {
    case 'edit_file':
      return 'Edited';
    case 'write_file':
      return 'Wrote';
    case 'delete_file':
      return 'Deleted';
    case 'run_terminal_cmd':
    case 'terminal_output':
      return 'Ran';
    case 'ask_question':
      return 'Asked';
    case 'todo_write':
      return 'Todos';
    case 'task':
    case 'task_run':
      return 'Agent';
    case 'skill_run':
      return 'Skill';
    case 'switch_mode':
      return 'Mode';
  }
  if (step.kind === 'reading') return 'Read';
  if (step.kind === 'searching') return 'Searched';
  if (step.kind === 'editing') return 'Edited';
  if (step.kind === 'running') return 'Ran';
  if (step.kind === 'task') return 'Agent';
  return step.toolName || name || 'Tool';
}

/**
 * Live rolling status verb (Reading / Grepping / …) with detail.
 *
 * Keeps each caller's original verb mapping — MessageSteps has extra live
 * verbs (Checking lints / Searching web / Fetching / Working) that
 * ExploreChrome never produced.
 */
export function formatRollingTool(step: ExploreStepLike): string {
  const live = step.itemStatus === 'running' || step.status === 'running';
  // Keep "dir/file L10-50" / "pattern in path" — do not strip parent via basename.
  const detailSource = step.subtitle ?? step.detail;
  let detail = '';
  if (detailSource) {
    if (/\sL\d/.test(detailSource) || /\sin\s/.test(detailSource)) {
      detail = formatExploreDetail(detailSource);
    } else {
      detail = fileBasename(detailSource) || shortPath(detailSource);
    }
  }
  const name = (step.toolName || '').toLowerCase();
  if (step.title != null) {
    // TimelineStep (ExploreChrome)
    let verb = toolRowLabel(step);
    if (live) {
      if (name === 'read_file' || name === 'read_files' || verb === 'Read') verb = 'Reading';
      else if (name === 'grep' || verb === 'Grepped') verb = 'Grepping';
      else if (verb === 'Searched') verb = 'Searching';
      else if (verb === 'Listed') verb = 'Listing';
      else if (verb === 'Linted') verb = 'Linting';
    }
    return detail ? `${verb} ${detail}` : verb;
  }
  // MessageStep (MessageSteps)
  let verb: string;
  switch (name) {
    case 'read_file':
    case 'read_files':
      verb = live ? 'Reading' : 'Read';
      break;
    case 'grep':
      verb = live ? 'Grepping' : 'Grepped';
      break;
    case 'glob':
    case 'file_search':
      verb = live ? 'Searching' : 'Searched';
      break;
    case 'list_dir':
      verb = live ? 'Listing' : 'Listed';
      break;
    case 'codebase_search':
      verb = live ? 'Searching' : 'Searched';
      break;
    case 'read_lints':
      verb = live ? 'Linting' : 'Linted';
      break;
    case 'web_search':
      verb = live ? 'Searching' : 'Searched';
      break;
    case 'web_fetch':
      verb = live ? 'Fetching' : 'Fetched';
      break;
    default:
      if (step.kind === 'reading') verb = live ? 'Reading' : 'Read';
      else if (step.kind === 'searching') verb = live ? 'Searching' : 'Searched';
      else verb = live ? 'Working' : toolRowLabel(step);
  }
  return detail ? `${verb} ${detail}` : verb;
}

/** Cursor-style Thought title: brief stays "briefly"; longer → "Thought 3s". */
export function formatThoughtTitle(step: ExploreStepLike, live: boolean): string {
  const status = step.itemStatus ?? step.status;
  if (isPlanGenerateStep(step)) {
    if (live && status === 'running') return 'Creating plan';
    if (status === 'error' || status === 'failed') return 'Failed to create plan';
    return 'Created plan';
  }
  if (live && status === 'running') return 'Thinking';
  const ms = step.durationMs;
  // Comment: sub-second / short digests stay "briefly"; only material waits show clock
  if (ms != null && Number.isFinite(ms) && ms >= 1000) {
    return `Thought ${Math.max(1, Math.round(ms / 1000))}s`;
  }
  return 'Thought briefly';
}
