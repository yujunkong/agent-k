/**
 * CTX-011 — ideContextInjector ported from v2.1 `src/prefetch/ideContextInjector.ts`.
 * ADDON-T05: IDE context bag (diagnostics / git / symbols). Never throws.
 *
 * Deferred to host: v2.1 `collectDiagnosticsSummary` / `collectActiveFileHint` /
 * `collectSymbolHint` used lazy `require('vscode')`. Core only accepts injected
 * collectors; default without deps is empty (plus optional sync git diff).
 */
import { execFileSync } from 'node:child_process';
import type { ContextItemKey } from './taskContextStrategy';
import { collectLspCursorContext } from './lspCursorContext';
import type { LspCursorContextDeps } from './lspCursorContext';

export type IdeContextBag = Partial<Record<ContextItemKey, string>>;

export interface IdeContextCollectorDeps {
  getDiagnosticsSummary?: () => Promise<string>;
  getGitDiff?: () => Promise<string>;
  getActiveFileHint?: () => Promise<string>;
  getSymbolHint?: () => Promise<string>;
  /** ADDON-T12: hover/definition/references — appended to symbols/type_definitions */
  getLspContext?: () => Promise<string>;
  /** Forwarded to collectLspCursorContext when getLspContext is not injected */
  lspDeps?: LspCursorContextDeps;
  cwd?: string;
}

function safeTruncate(text: string, max = 3000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n...(truncated)';
}

/** Default git diff HEAD (best-effort, no throw) — node-only, same as v2.1. */
export function collectGitDiffSync(cwd?: string, maxChars = 3000): string {
  try {
    const out = execFileSync('git', ['diff', 'HEAD', '--stat', '-U3'], {
      encoding: 'utf-8',
      cwd: cwd || process.cwd(),
      timeout: 5000,
      maxBuffer: 512 * 1024,
    });
    return safeTruncate(String(out || '').trim(), maxChars);
  } catch {
    return '';
  }
}

/**
 * Collect a bag of IDE context keys. Never throws.
 * Without injected deps, diagnostics/active/symbol stay empty; git falls back
 * to collectGitDiffSync unless getGitDiff is provided.
 */
export async function collectIdeContextBag(
  deps?: IdeContextCollectorDeps
): Promise<IdeContextBag> {
  const bag: IdeContextBag = {};
  try {
    const diagnostics = deps?.getDiagnosticsSummary
      ? await safeCall(deps.getDiagnosticsSummary)
      : '';
    if (diagnostics) {
      bag.diagnostics = diagnostics;
      bag.error_message = diagnostics;
    }

    const git = deps?.getGitDiff
      ? await safeCall(deps.getGitDiff)
      : collectGitDiffSync(deps?.cwd);
    if (git) {
      bag.git_diff = git;
      bag.recent_changes = git;
      bag.diff = git;
      bag.changed_files = git.split('\n').slice(0, 40).join('\n');
    }

    const active = deps?.getActiveFileHint ? await safeCall(deps.getActiveFileHint) : '';
    if (active) {
      bag.active_file = active;
      bag.target_files = active;
      bag.related_files = active;
    }

    const symbols = deps?.getSymbolHint ? await safeCall(deps.getSymbolHint) : '';
    const lsp = deps?.getLspContext
      ? await safeCall(deps.getLspContext)
      : await collectLspCursorContext(deps?.lspDeps);
    const mergedSymbols = [symbols, lsp].filter(Boolean).join('\n\n');
    if (mergedSymbols) {
      bag.symbols = mergedSymbols;
      bag.type_definitions = mergedSymbols;
    }
  } catch {
    /* never break the loop */
  }
  return bag;
}

/** Swallow collector throws so one bad IDE hook does not empty the whole bag. */
async function safeCall(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn();
  } catch {
    return '';
  }
}
