/**
 * HARNESS-004 — Post-edit verification micro-loop helpers.
 * fail → inject into tool_result → model continues (not Plan FSM replan).
 */
import type { ExecuteToolResult } from '../types';

export const POST_EDIT_VERIFY_TOOLS = new Set(['edit_file', 'write_file']);

export interface LintDiagnostic {
  path: string;
  line?: number;
  column?: number;
  severity?: string;
  message: string;
  code?: string;
}

const DEFAULT_MAX_VERIFY_RETRIES = 2;

/** Resolve edited path from write tool args. */
export function extractEditedFilePath(
  toolName: string,
  args: Record<string, unknown>,
): string | undefined {
  if (!POST_EDIT_VERIFY_TOOLS.has(toolName)) return undefined;
  const raw = args.path ?? args.file_path;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

/** Parse read_lints tool payload into diagnostics. */
export function parseLintErrorsFromToolResult(
  result: ExecuteToolResult,
): LintDiagnostic[] {
  if (!result.success || !result.data || typeof result.data !== 'object') {
    return [];
  }
  const data = result.data as Record<string, unknown>;
  const errors = data.errors;
  if (!Array.isArray(errors)) return [];
  const out: LintDiagnostic[] = [];
  for (const row of errors) {
    if (!row || typeof row !== 'object') continue;
    const e = row as Record<string, unknown>;
    const message = String(e.message ?? '').trim();
    if (!message) continue;
    out.push({
      path: String(e.path ?? ''),
      line: typeof e.line === 'number' ? e.line : undefined,
      column: typeof e.column === 'number' ? e.column : undefined,
      severity: e.severity != null ? String(e.severity) : undefined,
      message,
      code: e.code != null ? String(e.code) : undefined,
    });
  }
  return out;
}

function formatLintBlock(errors: LintDiagnostic[]): string {
  const lines = errors.map((e) => {
    const loc = `${e.path}:${e.line ?? '?'}${e.column != null ? `:${e.column}` : ''}`;
    const code = e.code ? ` (${e.code})` : '';
    return `  - ${loc} ${e.severity ?? 'error'}: ${e.message}${code}`;
  });
  return ['<lint_errors>', ...lines, '</lint_errors>'].join('\n');
}

/** Model-facing verification failure appended to tool_result. */
export function formatPostEditVerificationFailure(
  errors: LintDiagnostic[],
  attempt: number,
  maxRetries: number,
): string {
  const attemptLabel = attempt + 1;
  if (attempt >= maxRetries) {
    return (
      `<system>Verification micro-loop: max retries (${maxRetries}) reached. ` +
      `${errors.length} lint issue(s) remain.\n` +
      `${formatLintBlock(errors)}\n` +
      'Fix remaining issues or ask the user how to proceed.</system>'
    );
  }
  return (
    `<system>Verification micro-loop failed (attempt ${attemptLabel}/${maxRetries}).\n` +
    `${formatLintBlock(errors)}\n` +
    'Fix the issues above and retry the edit.</system>'
  );
}

/** Per file retry tracker for micro-loop cap. */
export class PostEditVerificationTracker {
  private readonly retries = new Map<string, number>();

  constructor(private readonly maxRetries = DEFAULT_MAX_VERIFY_RETRIES) {}

  nextAttempt(key: string): number {
    const n = (this.retries.get(key) ?? 0) + 1;
    this.retries.set(key, n);
    return n;
  }

  getAttempts(key: string): number {
    return this.retries.get(key) ?? 0;
  }

  atMax(key: string): boolean {
    return this.getAttempts(key) >= this.maxRetries;
  }

  get maxAttempts(): number {
    return this.maxRetries;
  }
}
