import { execSync } from 'child_process';
import { WorktreeManager } from '../worktree/WorktreeManager';

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

export function bindWorktreeManager(
  manager: WorktreeManager,
  repoRoot: string
): SubagentWorktreeBindings {
  return {
    create: async (taskId) => {
      let base = 'HEAD';
      try {
        base = execSync('git rev-parse HEAD', {
          cwd: repoRoot,
          stdio: 'pipe'
        })
          .toString()
          .trim();
      } catch {
        /* create() still uses HEAD */
      }
      const info = await manager.create(`subagent/${taskId}`, base);
      return {
        path: info.path,
        branch: info.branch,
        base: info.hash || base
      };
    },
    capture: async (worktree) => {
      const status = manager.status(worktree.path);
      manager.diff(worktree.path);
      return {
        filesChanged: status.files.length,
        files: status.files
      };
    }
  };
}
