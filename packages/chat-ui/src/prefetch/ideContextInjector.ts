/**
 * ADDON-T05: IDE context collection (diagnostics / git / symbols)
 * Never throws to the agent loop — failures become empty strings.
 */
import { execFileSync } from 'child_process';
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

function safeTruncate(text: string, max = 3000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n...(truncated)';
}

/** Default git diff HEAD (best-effort, no throw). */
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

/** VS Code diagnostics if available; else empty. */
export async function collectDiagnosticsSummary(): Promise<string> {
  try {
    // Lazy require — unit tests / non-extension hosts have no vscode
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    const editor = vscode.window.activeTextEditor;
    if (!editor) return '';
    const diags = vscode.languages.getDiagnostics(editor.document.uri);
    if (!diags.length) return '';
    const lines = diags.slice(0, 30).map((d) => {
      const sev =
        d.severity === vscode.DiagnosticSeverity.Error
          ? 'error'
          : d.severity === vscode.DiagnosticSeverity.Warning
            ? 'warn'
            : 'info';
      return `L${d.range.start.line + 1}: [${sev}] ${d.message}`;
    });
    return safeTruncate(
      `File: ${editor.document.uri.fsPath}\n${lines.join('\n')}`,
      4000
    );
  } catch {
    return '';
  }
}

export async function collectActiveFileHint(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    const editor = vscode.window.activeTextEditor;
    if (!editor) return '';
    const text = editor.document.getText();
    const path = editor.document.uri.fsPath;
    return safeTruncate(`Active file: ${path}\n${text}`, 6000);
  } catch {
    return '';
  }
}

export async function collectSymbolHint(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    const editor = vscode.window.activeTextEditor;
    if (!editor) return '';
    const pos = editor.selection.active;
    const hovers = (await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      editor.document.uri,
      pos
    )) as Array<{ contents: Array<string | { value?: string }> }> | undefined;
    if (!hovers?.length) return '';
    const parts: string[] = [];
    for (const h of hovers.slice(0, 3)) {
      for (const c of h.contents) {
        if (typeof c === 'string') parts.push(c);
        else if (c && typeof c.value === 'string') {
          parts.push(c.value);
        }
      }
    }
    return safeTruncate(parts.join('\n'), 2000);
  } catch {
    return '';
  }
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
