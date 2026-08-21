/**
 * HOST-013 — Subagent worktree registry (Map + stubs until WT / SUB land).
 */

export type SubagentWorktree = {
  path: string;
  branch: string;
  [key: string]: unknown;
};

export type RegisteredSubagentWorktree = {
  subagentId: string;
  repoRoot: string;
  worktree: SubagentWorktree;
  registeredAt: number;
};

export type WorktreeReview = {
  worktree: SubagentWorktree;
  snapshot: { filesChanged: number; files: string[] };
  diff: string;
  untrackedFiles: string[];
};

export type WorktreeApplyResult = {
  applied: boolean;
  removed: boolean;
  filesChanged: number;
  error?: string;
};

const registry = new Map<string, RegisteredSubagentWorktree>();

export function registerSubagentWorktree(
  subagentId: string,
  repoRoot: string,
  worktree: SubagentWorktree,
): void {
  const id = String(subagentId || '').trim();
  if (!id) return;
  registry.set(id, {
    subagentId: id,
    repoRoot,
    worktree,
    registeredAt: Date.now(),
  });
}

export function getRegisteredSubagentWorktree(
  subagentId: string,
): RegisteredSubagentWorktree | undefined {
  return registry.get(String(subagentId || '').trim());
}

export function unregisterSubagentWorktree(subagentId: string): void {
  registry.delete(String(subagentId || '').trim());
}

export function reviewRegisteredSubagentWorktree(subagentId: string): WorktreeReview {
  const entry = getRegisteredSubagentWorktree(subagentId);
  if (!entry) throw new Error(`Unknown subagent task: ${subagentId}`);
  // Full review lives in packages/worktree / agent review modules (WT-*).
  return {
    worktree: entry.worktree,
    snapshot: { filesChanged: 0, files: [] },
    diff: '',
    untrackedFiles: [],
  };
}

export async function applyRegisteredSubagentWorktree(
  subagentId: string,
): Promise<WorktreeApplyResult> {
  const entry = getRegisteredSubagentWorktree(subagentId);
  if (!entry) {
    return {
      applied: false,
      removed: false,
      filesChanged: 0,
      error: `Unknown subagent task: ${subagentId}`,
    };
  }
  return {
    applied: false,
    removed: false,
    filesChanged: 0,
    error: 'Subagent worktree apply pending (WT-* / SUB-*).',
  };
}

export async function rejectRegisteredSubagentWorktree(
  subagentId: string,
): Promise<void> {
  const entry = getRegisteredSubagentWorktree(subagentId);
  if (!entry) throw new Error(`Unknown subagent task: ${subagentId}`);
  unregisterSubagentWorktree(subagentId);
}

/** Test-only */
export function clearSubagentWorktreeRegistry(): void {
  registry.clear();
}
