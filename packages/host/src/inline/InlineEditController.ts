/**
 * INLINE-001/002 — Inline edit controller (v2.1 port).
 * Captures editor selection → webview inline.edit.request payload.
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

export type InlineEditHandler = (request: InlineEditRequest) => Promise<void> | void;

export class InlineEditController {
  private handler?: InlineEditHandler;

  register(context: vscode.ExtensionContext, commandId = 'agent-k.inlineEdit'): vscode.Disposable {
    const command = vscode.commands.registerCommand(commandId, async () => {
      await this.runFromActiveEditor();
    });
    context.subscriptions.push(command);
    return command;
  }

  setHandler(handler: InlineEditHandler | undefined): void {
    this.handler = handler;
  }

  toChatPayload(
    request: InlineEditRequest,
    requestId = `inline_${Date.now().toString(36)}`,
  ): InlineEditChatPayload {
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
        selectedText: request.selectedText,
      },
    };
  }

  async runFromActiveEditor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('Inline Edit: open a file and select code first.');
      return;
    }
    const { selection, document } = editor;
    if (selection.isEmpty) {
      void vscode.window.showWarningMessage('Inline Edit: select a code region first.');
      return;
    }

    const instruction = await vscode.window.showInputBox({
      title: 'Inline Edit',
      prompt: 'Describe the change for the selected code',
      placeHolder: 'e.g. Add null check, rename to fetchUser',
    });
    if (instruction == null || !instruction.trim()) return;

    const request: InlineEditRequest = {
      uri: document.uri.toString(),
      languageId: document.languageId,
      startLine: selection.start.line,
      startCharacter: selection.start.character,
      endLine: selection.end.line,
      endCharacter: selection.end.character,
      selectedText: document.getText(selection),
      instruction: instruction.trim(),
    };

    if (this.handler) {
      await this.handler(request);
      return;
    }
    void vscode.window.showInformationMessage('[Agent K] Inline Edit handler not wired.');
  }
}
