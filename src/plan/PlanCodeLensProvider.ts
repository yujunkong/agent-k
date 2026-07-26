/**
 * CodeLens on Agent K plan markdown — Cursor-style Build / Open Review.
 */
import * as vscode from 'vscode';
import { PlanStorage } from './PlanStorage';

export class PlanCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  refresh(): void {
    this._onDidChange.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    if (!PlanStorage.isPlanDocumentUri(document.uri)) return [];

    const range = new vscode.Range(0, 0, 0, 0);
    return [
      new vscode.CodeLens(range, {
        title: '$(play) Build',
        tooltip: 'Approve this plan and start implementation (Agent mode)',
        command: 'agent-k.plan.build',
        arguments: [document.uri]
      }),
      new vscode.CodeLens(range, {
        title: 'Open Review',
        tooltip: 'Open the Plan Review panel in Agent K chat',
        command: 'agent-k.plan.openReview',
        arguments: [document.uri]
      })
    ];
  }
}

/** Sync `agent-k.isPlanDocument` for editor/title menus */
export function updatePlanDocumentContext(
  editor: vscode.TextEditor | undefined
): void {
  const isPlan = Boolean(
    editor && PlanStorage.isPlanDocumentUri(editor.document.uri)
  );
  void vscode.commands.executeCommand(
    'setContext',
    'agent-k.isPlanDocument',
    isPlan
  );
}

export interface PlanEditorPayload {
  content: string;
  slug: string;
  title: string;
  filePath: string;
}

/** Read active/URI plan doc (save dirty buffer first) */
export async function readPlanFromEditor(
  uri?: vscode.Uri
): Promise<PlanEditorPayload | null> {
  let doc: vscode.TextDocument | undefined;
  if (uri) {
    doc = await vscode.workspace.openTextDocument(uri);
  } else {
    doc = vscode.window.activeTextEditor?.document;
  }
  if (!doc || !PlanStorage.isPlanDocumentUri(doc.uri)) {
    return null;
  }
  if (doc.isDirty) {
    await doc.save();
  }
  const content = PlanStorage.stripFrontmatter(doc.getText()).trim();
  if (!content) return null;
  const slug = PlanStorage.slugFromUri(doc.uri);
  return {
    content,
    slug,
    title: PlanStorage.titleFromContent(content),
    filePath: doc.uri.fsPath
  };
}
