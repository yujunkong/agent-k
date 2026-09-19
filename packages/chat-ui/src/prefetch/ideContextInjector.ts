/**
 * ADDON-T05: IDE context collection (diagnostics / git / symbols).
 * B-2: the webview cannot touch vscode/child_process — collectors are
 * injected by the host. Without injected deps every collector degrades to ''.
 * Never throws to the agent loop.
 */
import type { ContextItemKey } from './taskContextStrategy';
import { collectLspCursorContext } from './lspCursorContext';
import type { LspCursorContextDeps } from './lspCursorContext';

export type IdeContextBag = Partial<Record<ContextItemKey, string>>;

export interface IdeContextCollectorDeps {
  getDiagnosticsSummary?: () => Promise<string>;
  getGitDiff?: () => Promise<string>;
  getActiveFileHint?: () => Promise<string>;
  getSymbolHint?: () => Promise<string>;
  /** ADDON-T12: hover/definition/references at the cursor — appended to symbols/type_definitions */
  getLspContext?: () => Promise<string>;
  /** Forwarded to the default collectLspCursorContext() when getLspContext is not injected */
  lspDeps?: LspCursorContextDeps;
  cwd?: string;
}

/** Default git diff — host-owned; webview returns '' (no child_process). */
export function collectGitDiffSync(_cwd?: string, _maxChars = 3000): string {
  return '';
}

/** VS Code diagnostics — host-owned; webview returns ''. */
export async function collectDiagnosticsSummary(): Promise<string> {
  return '';
}

export async function collectActiveFileHint(): Promise<string> {
  return '';
}

export async function collectSymbolHint(): Promise<string> {
  return '';
}

/**
 * Collect a bag of IDE context keys. Never throws.
 */
export async function collectIdeContextBag(
  deps?: IdeContextCollectorDeps
): Promise<IdeContextBag> {
  const bag: IdeContextBag = {};
  try {
    const diagnostics =
      (await deps?.getDiagnosticsSummary?.()) ??
      (await collectDiagnosticsSummary());
    if (diagnostics) {
      bag.diagnostics = diagnostics;
      bag.error_message = diagnostics;
    }

    const git =
      (await deps?.getGitDiff?.()) ??
      collectGitDiffSync(deps?.cwd);
    if (git) {
      bag.git_diff = git;
      bag.recent_changes = git;
      bag.diff = git;
      bag.changed_files = git.split('\n').slice(0, 40).join('\n');
    }

    const active =
      (await deps?.getActiveFileHint?.()) ?? (await collectActiveFileHint());
    if (active) {
      bag.active_file = active;
      bag.target_files = active;
      bag.related_files = active;
    }

    const symbols =
      (await deps?.getSymbolHint?.()) ?? (await collectSymbolHint());
    // ADDON-T12: LSP hover/definition/references — depth beyond the plain hover symbol hint
    const lsp =
      (await deps?.getLspContext?.()) ?? (await collectLspCursorContext(deps?.lspDeps));
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
