/**
 * WT-002 Worktree creation — subagent-oriented create/capture bindings.
 * Ported from v2.1 `src/agent/subagentWorktree.ts` (domain only; no SubagentRunner).
 */
import type { WorktreeManager } from './WorktreeManager';
import { tryGit } from './gitExec';

export type SubagentWorktree = {
  path: string;
  branch: string;
  base: string;
};

export type SubagentWorktreeSnapshot = {
  filesChanged: number;
  files: string[];
};

export type SubagentWorktreeBindings = {
  create: (taskId: string) => Promise<SubagentWorktree>;
  capture: (worktree: SubagentWorktree) => Promise<SubagentWorktreeSnapshot>;
};

/**
 * Bind a WorktreeManager to subagent create/capture.
 * create() always isolates under `.agentk/worktrees` — never parent cwd.
 */
export function bindWorktreeManager(
  manager: WorktreeManager,
  repoRoot: string
): SubagentWorktreeBindings {
  return {
    create: async (taskId) => {
      const head = tryGit(['rev-parse', 'HEAD'], { cwd: repoRoot });
      const base = head?.trim() || 'HEAD';
      const info = await manager.create(`subagent/${taskId}`, base);
      return {
        path: info.path,
        branch: info.branch,
        base: info.hash || base,
      };
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
