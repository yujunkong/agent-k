/**
 * EXT-003 — read a plan markdown document from the editor.
 * v2.1 `PlanStorage.readPlanFromEditor` parity: plan drafts live under
 * `<workspace>/.agentk/plans/**` as `plan_<hash>.md` (or `PLAN-*.md`).
 */
import * as vscode from 'vscode';
import {
  isPlanDocumentPath,
  slugFromPlanPath,
  stripPlanFrontmatter,
  titleFromPlanContent,
} from './planEditorPure';

export interface PlanEditorPayload {
  content: string;
  slug: string;
  title: string;
  filePath: string;
}

/** True for Agent K plan drafts under `.agentk/plans/**`. */
export function isPlanDocumentUri(uri: vscode.Uri): boolean {
  return isPlanDocumentPath(uri.fsPath);
}

export function slugFromPlanUri(uri: vscode.Uri): string {
  return slugFromPlanPath(uri.fsPath);
}

/** Read active/URI plan doc (save dirty buffer first). */
export async function readPlanFromEditor(
  uri?: vscode.Uri,
): Promise<PlanEditorPayload | null> {
  let doc: vscode.TextDocument | undefined;
  if (uri) {
    doc = await vscode.workspace.openTextDocument(uri);
  } else {
    doc = vscode.window.activeTextEditor?.document;
  }
  if (!doc || !isPlanDocumentUri(doc.uri)) {
    return null;
  }
  if (doc.isDirty) {
    await doc.save();
  }
  const content = stripPlanFrontmatter(doc.getText()).trim();
  if (!content) return null;
  return {
    content,
    slug: slugFromPlanUri(doc.uri),
    title: titleFromPlanContent(content),
    filePath: doc.uri.fsPath,
  };
}
