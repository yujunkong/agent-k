/**
 * HOST / HARNESS-003 — VS Code IDE collectors for PrefetchEngine.
 */
import * as vscode from 'vscode';
import type { IdeContextCollectorDeps } from '@agent-k/core';

/** Build prefetch IDE deps from the active workspace (best-effort). */
export function createPrefetchIdeDeps(cwd: string): IdeContextCollectorDeps {
  return {
    cwd,
    getDiagnosticsSummary: async () => {
      const diags = vscode.languages.getDiagnostics();
      const lines: string[] = [];
      for (const [uri, entries] of diags) {
        const errors = entries.filter(
          (d) => d.severity === vscode.DiagnosticSeverity.Error,
        );
        if (!errors.length) continue;
        const rel = vscode.workspace.asRelativePath(uri);
        for (const d of errors.slice(0, 8)) {
          lines.push(
            `${rel}:${d.range.start.line + 1}: ${d.message.slice(0, 120)}`,
          );
        }
      }
      return lines.slice(0, 20).join('\n');
    },
    getActiveFileHint: async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return '';
      const doc = editor.document;
      const rel = vscode.workspace.asRelativePath(doc.uri);
      const sel = editor.selection;
      if (sel.isEmpty) {
        return `Active file: ${rel} (cursor L${sel.active.line + 1})`;
      }
      return `Active file: ${rel} (selection L${sel.start.line + 1}-${sel.end.line + 1})`;
    },
  };
}
