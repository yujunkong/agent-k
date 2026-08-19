/**
 * Session-scoped registry for finished subagent worktrees.
 *
 * SubagentHost inside a single chat.send is ephemeral; Apply/Reject must
 * resolve taskId → worktree after the parent loop completes.
 */
import type { SubagentWorktree } from '../agent/subagentWorktree';
import {
  applySubagentWorktree,
  rejectSubagentWorktree,
  reviewSubagentWorktree,
  type WorktreeApplyResult,
  type WorktreeReview
} from '../agent/subagentWorktreeReview';

export type RegisteredSubagentWorktree = {
  subagentId: string;
  repoRoot: string;
  worktree: SubagentWorktree;
  registeredAt: number;
};

const registry = new Map<string, RegisteredSubagentWorktree>();

export function registerSubagentWorktree(
  subagentId: string,
  repoRoot: string,
  worktree: SubagentWorktree
): void {
  const id = String(subagentId || '').trim();
  if (!id) return;
  registry.set(id, {
    subagentId: id,
    repoRoot,
    worktree,
    registeredAt: Date.now()
  });
}

export function getRegisteredSubagentWorktree(
  subagentId: string
): RegisteredSubagentWorktree | undefined {
  return registry.get(String(subagentId || '').trim());
}

export function unregisterSubagentWorktree(subagentId: string): void {
  registry.delete(String(subagentId || '').trim());
}

export function reviewRegisteredSubagentWorktree(subagentId: string): WorktreeReview {
  const entry = getRegisteredSubagentWorktree(subagentId);
  if (!entry) throw new Error(`Unknown subagent task: ${subagentId}`);
  return reviewSubagentWorktree(entry.repoRoot, entry.worktree);
}

export async function applyRegisteredSubagentWorktree(
  subagentId: string
): Promise<WorktreeApplyResult> {
  const entry = getRegisteredSubagentWorktree(subagentId);
  if (!entry) {
    return {
      applied: false,
      removed: false,
      filesChanged: 0,
      error: `Unknown subagent task: ${subagentId}`
    };
  }
  const result = await applySubagentWorktree(entry.repoRoot, entry.worktree);
  if (result.applied && result.removed) {
    unregisterSubagentWorktree(subagentId);
  }
  return result;
}

export async function rejectRegisteredSubagentWorktree(
  subagentId: string
): Promise<void> {
  const entry = getRegisteredSubagentWorktree(subagentId);
  if (!entry) throw new Error(`Unknown subagent task: ${subagentId}`);
  await rejectSubagentWorktree(entry.repoRoot, entry.worktree);
  unregisterSubagentWorktree(subagentId);
}

/** Test-only */
export function clearSubagentWorktreeRegistry(): void {
  registry.clear();
}
