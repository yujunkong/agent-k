/**
 * V31-CTX-05 — IDE workspace context for the agent loop.
 *
 * Collects the live VS Code surface and builds a core `WorkspaceContext` so
 * the assembler can inject it into the system sticky slot. The pure builder
 * lives in `workspaceContextPure.ts` (vscode-free, unit tested).
 */

import * as vscode from 'vscode';
import type { WorkspaceContext } from '@agent-k/core';
import {
  hasWorkspaceContent,
  workspaceContextFromSnapshot,
} from './workspaceContextPure';

/** Best-effort VS Code collector; returns undefined when there is no workspace. */
export function collectWorkspaceContext(): WorkspaceContext | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const roots = folders.map((f) => ({ name: f.name, path: f.uri.fsPath }));
  const openFiles = vscode.workspace.textDocuments
    .filter((d) => !d.isUntitled && d.uri.scheme === 'file')
    .map((d) => vscode.workspace.asRelativePath(d.uri));
  const active = vscode.window.activeTextEditor?.document;
  const activeFile =
    active?.uri?.scheme === 'file'
      ? vscode.workspace.asRelativePath(active.uri)
      : undefined;

  const snapshot = {
    roots,
    openFiles,
    activeFile,
    cwd: roots[0]?.path,
  };
  if (!hasWorkspaceContent(snapshot)) return undefined;
  return workspaceContextFromSnapshot(snapshot);
}
