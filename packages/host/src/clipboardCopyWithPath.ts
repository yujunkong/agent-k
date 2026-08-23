/**
 * CHAT-005 — Cmd/Ctrl+C|X: default copy/cut + stash path/range for Chat paste.
 */

import * as vscode from 'vscode';
import { rememberEditorCopy } from './editorCopyStash';

function stashFromEditor(editor: vscode.TextEditor): void {
  const { document, selection } = editor;
  if (selection.isEmpty) return;
  if (document.uri.scheme !== 'file') return;
  const content = document.getText(selection);
  if (!content.trim()) return;
  rememberEditorCopy({
    path: document.uri.fsPath,
    content,
    startLine: selection.start.line + 1,
    endLine: selection.end.line + 1,
  });
}

/**
 * Run built-in copy/cut, then remember path+range from the selection.
 * Stash happens before cut so deleted text still has a path.
 */
export async function clipboardCopyWithPath(opts?: { cut?: boolean }): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  // Comment: capture path at copy time — paste must not use later active editor
  if (editor) stashFromEditor(editor);

  await vscode.commands.executeCommand(
    opts?.cut
      ? 'editor.action.clipboardCutAction'
      : 'editor.action.clipboardCopyAction',
  );
}
