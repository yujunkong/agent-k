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

/**
 * Backs the `agent-k-selectiondiff:` scheme used by showDiff() below.
 *
 * Why not `untitled:` (what this used to use): VS Code/Cursor's built-in
 * Git/SCM extension treats `untitled:` as a real, potentially-saveable
 * document and tries to decorate the diff editor by running
 * `git diff --no-index <path> <path>` against the untitled URIs' resolved
 * paths -- which are never inside a git working tree, so it logs
 * "Not a git repository. Use --no-index..." to the Extension Host console
 * on every single showDiff() call. `untitled:` docs also prompt "Save?"
 * when the tab closes, which is wrong for a one-shot read-only comparison.
 * A custom scheme backed by a TextDocumentContentProvider is read-only,
 * isn't picked up by the Git extension's decoration logic (it only
 * recognizes file:/untitled: scoped resources), and never prompts to save.
 */
class SelectionDiffContentProvider implements vscode.TextDocumentContentProvider {
  private readonly content = new Map<string, string>();

  set(uri: vscode.Uri, text: string): void {
    this.content.set(uri.toString(), text);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.content.get(uri.toString()) ?? '';
  }
}

export class SelectionDiffApply {
  private static readonly scheme = 'agent-k-selectiondiff';
  private static contentProvider: SelectionDiffContentProvider | undefined;
  private static nextDiffId = 0;

  /** Call once (from register()) before the first showDiff(). */
  private static ensureContentProvider(context: vscode.ExtensionContext): SelectionDiffContentProvider {
    if (!SelectionDiffApply.contentProvider) {
      SelectionDiffApply.contentProvider = new SelectionDiffContentProvider();
      context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
          SelectionDiffApply.scheme,
          SelectionDiffApply.contentProvider
        )
      );
    }
    return SelectionDiffApply.contentProvider;
  }

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
    const provider = SelectionDiffApply.contentProvider;
    if (!provider) {
      throw new Error('SelectionDiffApply.register() must run before showDiff() (needed to back the diff content provider).');
    }
    const id = SelectionDiffApply.nextDiffId++;
    const scheme = SelectionDiffApply.scheme;
    // Unique path per call -- a fixed path would mean a second showDiff()
    // reuses (or races) the previous call's provider entry.
    const originalUri = vscode.Uri.parse(`${scheme}:/${id}/${encodeURIComponent(title)} (original)`);
    const modifiedUri = vscode.Uri.parse(`${scheme}:/${id}/${encodeURIComponent(title)} (modified)`);

    provider.set(originalUri, originalText);
    provider.set(modifiedUri, modifiedText);

    await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title);
  }

  /**
   * Register commands
   */
  register(context: vscode.ExtensionContext): void {
    SelectionDiffApply.ensureContentProvider(context);
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
