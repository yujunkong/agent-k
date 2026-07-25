/**
 * SelectionDiffApply — 선택 영역 → Diff Apply (C7-T28)
 *
 * Ctrl+K 대체: Commands + WorkspaceEdit + DiffEditor
 */
import * as vscode from 'vscode';

export interface SelectionDiffResult {
  original: string;
  modified: string;
  applied: boolean;
}

export class SelectionDiffApply {
  /**
   * Apply a diff to the current selection
   */
  async apply(
    editor: vscode.TextEditor,
    editBuilder: (edit: vscode.TextEditorEdit) => void
  ): Promise<boolean> {
    return new Promise(resolve => {
      editor.edit(editBuilder).then(success => {
        resolve(success);
      });
    });
  }

  /**
   * Replace selection with new text
   */
  async replaceSelection(
    editor: vscode.TextEditor,
    newText: string
  ): Promise<SelectionDiffResult> {
    const selection = editor.selection;
    const original = editor.document.getText(selection);

    const success = await editor.edit(editBuilder => {
      editBuilder.replace(selection, newText);
    });

    return { original, modified: newText, applied: success };
  }

  /**
   * Show diff between original and modified in DiffEditor
   */
  async showDiff(
    document: vscode.TextDocument,
    originalText: string,
    modifiedText: string,
    title: string = 'Selection Diff'
  ): Promise<void> {
    const originalUri = vscode.Uri.parse(`untitled:${title} (original)`);
    const modifiedUri = vscode.Uri.parse(`untitled:${title} (modified)`);

    const originalDoc = await vscode.workspace.openTextDocument(originalUri);
    const modifiedDoc = await vscode.workspace.openTextDocument(modifiedUri);

    // Set content via TextEdit
    const originalEdit = new vscode.WorkspaceEdit();
    originalEdit.insert(originalUri, new vscode.Position(0, 0), originalText);
    await vscode.workspace.applyEdit(originalEdit);

    const modifiedEdit = new vscode.WorkspaceEdit();
    modifiedEdit.insert(modifiedUri, new vscode.Position(0, 0), modifiedText);
    await vscode.workspace.applyEdit(modifiedEdit);

    await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title);
  }

  /**
   * Register commands
   */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('agent-k.selectionDiff', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No active editor');
          return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
          vscode.window.showInformationMessage('Select text to apply diff');
          return;
        }

        const original = editor.document.getText(selection);
        // In practice, this would show a quick input or use clipboard
        const modified = await vscode.window.showInputBox({
          prompt: 'Enter replacement text',
          value: original
        });

        if (modified !== undefined) {
          await this.replaceSelection(editor, modified);
        }
      })
    );
  }
}
