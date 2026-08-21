/**
 * HOST-009 — Workspace file listing for Plan V2 context (vscode findFiles).
 */

import * as path from 'node:path';
import * as vscode from 'vscode';

const DEFAULT_MAX_FILES = 250;
const EXCLUDE = '**/{node_modules,.git,dist,out,.agentk,.vscode-test}/**';

/**
 * Sample workspace-relative file paths for planner context.
 * Keeps the list bounded so planner prompts stay usable.
 */
export async function listWorkspaceFilePaths(
  folder: vscode.WorkspaceFolder,
  options: { maxFiles?: number } = {},
): Promise<string[]> {
  const maxFiles = Math.max(1, options.maxFiles ?? DEFAULT_MAX_FILES);
  const pattern = new vscode.RelativePattern(folder, '**/*');
  const uris = await vscode.workspace.findFiles(pattern, EXCLUDE, maxFiles);
  const root = folder.uri.fsPath;
  return uris
    .map((uri) => path.relative(root, uri.fsPath).replace(/\\/g, '/'))
    .filter((relative) => relative.length > 0 && !relative.startsWith('..'))
    .sort((a, b) => a.localeCompare(b));
}

/** First workspace folder fsPath, if any. */
export function primaryWorkspaceRepoRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
