/**
 * WT-004 — managed worktree path validation (SAFE boundary for apply/reject).
 * Uses platform-aware path compare (Windows case / macOS realpath).
 */
import * as path from 'path';
import { pathIsInside } from './gitExec';

/** v2.1 / WT-001 path base under repoRoot. */
export const WORKTREE_BASE_SEGMENTS = ['.agentk', 'worktrees'] as const;

export function managedWorktreeBase(repoRoot: string): string {
  return path.join(path.resolve(repoRoot), ...WORKTREE_BASE_SEGMENTS);
}

/** @deprecated prefer pathIsInside from gitExec — kept for API stable name */
export function isInside(root: string, candidate: string): boolean {
  return pathIsInside(root, candidate);
}

/** Throw unless worktreePath is under repoRoot/.agentk/worktrees. */
export function assertManagedWorktree(repoRoot: string, worktreePath: string): void {
  const base = managedWorktreeBase(repoRoot);
  if (!pathIsInside(base, worktreePath)) {
    throw new Error('Refused: worktree is outside the Agent-K worktree root');
  }
}

export function isManagedWorktreePath(repoRoot: string, worktreePath: string): boolean {
  try {
    assertManagedWorktree(repoRoot, worktreePath);
    return true;
  } catch {
    return false;
  }
}
