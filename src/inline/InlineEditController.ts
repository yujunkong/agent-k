/**
 * InlineEditController — Cursor-style selection edit foundation.
 *
 * Captures the active editor selection and exposes a normalized request payload
 * for the Agent K chat/host bridge. The controller deliberately does not mutate
 * the document itself; edits remain reviewable through the existing diff flow.
 */
import * as vscode from 'vscode';

export interface InlineEditRequest {
  uri: string;
  languageId: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  selectedText: string;
  instruction: string;
}

/** Payload consumed by the chat bridge. Keep this separate from VS Code Range. */
export interface InlineEditChatPayload {
  type: 'inline.edit.request';
  requestId: string;
  instruction: string;
  selection: {
    uri: string;
    languageId: string;
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
    selectedText: string;
  };
}

export interface InlineEditSelection {
  uri: string;
  languageId: string;
  range: vscode.Range;
  selectedText: string;
}

export type InlineEditHandler = (request: InlineEditRequest) => Promise<void> | void;

export class InlineEditController {
  private readonly disposables: vscode.Disposable[] = [];
  private handler?: InlineEditHandler;

  constructor(private readonly commandId = 'agent-k.inlineEdit') {}

  /** Register Cmd/Ctrl+K-compatible command wiring through VS Code's command system. */
  register(context: vscode.ExtensionContext): vscode.Disposable {
    const command = vscode.commands.registerCommand(this.commandId, async () => {
      await this.runFromActiveEditor();
    });
    this.disposables.push(command);
    context.subscriptions.push(command);
    return command;
  }

  setHandler(handler: InlineEditHandler | undefined): void {
    this.handler = handler;
  }

  /** Read the current editor selection without changing the document. */
  getSelection(editor = vscode.window.activeTextEditor): InlineEditSelection | undefined {
    if (!editor) return undefined;
    const { selection, document } = editor;
    if (selection.isEmpty) return undefined;

    return {
      uri: document.uri.toString(),
      languageId: document.languageId,
      range: selection,
      selectedText: document.getText(selection)
    };
  }

  /** Convert a request to the stable host → webview chat payload. */
  toChatPayload(request: InlineEditRequest, requestId = `inline_${Date.now().toString(36)}`): InlineEditChatPayload {
    return {
      type: 'inline.edit.request',
      requestId,
      instruction: request.instruction,
      selection: {
        uri: request.uri,
        languageId: request.languageId,
        startLine: request.startLine,
        startCharacter: request.startCharacter,
        endLine: request.endLine,
        endCharacter: request.endCharacter,
        selectedText: request.selectedText
      }
    };
  }

  /** Build a deterministic composer seed for the inline-edit bridge. */
  toComposerSeed(request: InlineEditRequest): string {
    const file = request.uri.replace(/^file:\/\//, '');
    const range = `${request.startLine + 1}:${request.startCharacter + 1}-${request.endLine + 1}:${request.endCharacter + 1}`;
    const language = request.languageId || 'text';
    return [
      `Edit ${file} (${range})`,
      '',
      `Instruction: ${request.instruction}`,
      '',
      'Selected code:',
      `\`\`\`${language}`,
      request.selectedText,
      '\`\`\`'
    ].join('\n');
  }

  /** Run inline edit from the current selection and request an instruction. */
  async runFromActiveEditor(): Promise<void> {
    const selection = this.getSelection();
    if (!selection) {
      void vscode.window.showInformationMessage('Agent K: select code to edit first.');
      return;
    }

    const instruction = await vscode.window.showInputBox({
      prompt: 'Agent K: describe the change',
      placeHolder: 'e.g. Refactor this function to async/await',
      ignoreFocusOut: true
    });
    if (instruction == null || !instruction.trim()) return;

    const request: InlineEditRequest = {
      uri: selection.uri,
      languageId: selection.languageId,
      startLine: selection.range.start.line,
      startCharacter: selection.range.start.character,
      endLine: selection.range.end.line,
      endCharacter: selection.range.end.character,
      selectedText: selection.selectedText,
      instruction: instruction.trim()
    };

    await this.handler?.(request);
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }
}
