/**
 * V31-CTX-05 — vscode-free workspace context builder (testable).
 */

import { WorkspaceContext, type WorkspaceContextSnapshot } from '@agent-k/core';

/** Build a WorkspaceContext from a snapshot (no vscode dependency). */
export function workspaceContextFromSnapshot(
  snapshot: WorkspaceContextSnapshot,
): WorkspaceContext {
  const ctx = new WorkspaceContext();
  ctx.setRoots(snapshot.roots ?? []);
  ctx.setOpenFiles(snapshot.openFiles ?? []);
  ctx.setActiveFile(snapshot.activeFile);
  ctx.setCwd(snapshot.cwd);
  return ctx;
}

/** True when the snapshot carries anything worth injecting. */
export function hasWorkspaceContent(snapshot: WorkspaceContextSnapshot): boolean {
  return (
    (snapshot.roots?.length ?? 0) > 0 ||
    (snapshot.openFiles?.length ?? 0) > 0 ||
    snapshot.activeFile != null
  );
}
