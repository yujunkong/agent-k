/**
 * WT-002 Worktree creation — subagent-oriented create/capture bindings.
 * Ported from v2.1 `src/agent/subagentWorktree.ts` (domain only; no SubagentRunner).
 *
 * V31-SUB-01 — an opt-in `inheritParentChanges` carries the parent's
 * uncommitted work into the fresh worktree so the subagent does not review a
 * stale HEAD tree (ISSUE-11). Default is HEAD-only, preserving WT isolation.
 */
import type { WorktreeManager } from './WorktreeManager';
import { tryGit } from './gitExec';
import { applyParentBaseline } from './parentBaseline';

export type SubagentWorktree = {
  path: string;
  branch: string;
  base: string;
  /** V31-SUB-01 — non-fatal notes from the parent-baseline transfer. */
  warnings?: string[];
};

export type SubagentWorktreeSnapshot = {
  filesChanged: number;
  files: string[];
};

export type SubagentWorktreeBindings = {
  create: (taskId: string) => Promise<SubagentWorktree>;
  capture: (worktree: SubagentWorktree) => Promise<SubagentWorktreeSnapshot>;
};

export interface BindWorktreeOptions {
  /**
   * V31-SUB-01 — copy the parent's uncommitted changes (tracked patch +
   * untracked files) into the new worktree. Default false (HEAD-only).
   */
  inheritParentChanges?: boolean;
}

/**
 * Bind a WorktreeManager to subagent create/capture.
 * create() always isolates under `.agentk/worktrees` — never parent cwd.
 */
export function bindWorktreeManager(
  manager: WorktreeManager,
  repoRoot: string,
  options: BindWorktreeOptions = {}
): SubagentWorktreeBindings {
  const inheritParentChanges = options.inheritParentChanges === true;

  return {
    create: async (taskId) => {
      const head = tryGit(['rev-parse', 'HEAD'], { cwd: repoRoot });
      const base = head?.trim() || 'HEAD';
      const info = await manager.create(`subagent/${taskId}`, base);

      const worktree: SubagentWorktree = {
        path: info.path,
        branch: info.branch,
        base: info.hash || base,
      };

      if (inheritParentChanges) {
        const baseline = applyParentBaseline(repoRoot, info.path);
        if (baseline.warnings.length) {
          worktree.warnings = baseline.warnings;
        }
      }

      return worktree;
    },
    capture: async (worktree) => {
      const status = manager.status(worktree.path);
      manager.diff(worktree.path);
      return {
        filesChanged: status.files.length,
        files: status.files,
      };
    },
  };
}
