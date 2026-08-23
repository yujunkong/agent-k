/**
 * WT-005 / WT-006 — isolation helpers + snapshot capture (no parent mutation).
 */
import type { WorktreeManager } from './WorktreeManager';
import type { SubagentWorktree, SubagentWorktreeSnapshot } from './subagentWorktree';
import { assertManagedWorktree } from './pathValidation';

/** Ensure path is managed + still registered — isolation gate before review/apply. */
export function assertIsolatedWorktree(
  repoRoot: string,
  worktree: SubagentWorktree,
  manager: WorktreeManager
): void {
  assertManagedWorktree(repoRoot, worktree.path);
  if (!manager.exists(worktree.path)) {
    throw new Error('Subagent worktree no longer exists');
  }
}

/** WT-006 — porcelain snapshot of an isolated checkout. */
export function captureWorktreeSnapshot(
  manager: WorktreeManager,
  worktree: SubagentWorktree
): SubagentWorktreeSnapshot {
  const status = manager.status(worktree.path);
  return { filesChanged: status.files.length, files: status.files };
}
