/**
 * WT-014 — adopt Best-of-N winner into main (merge + remove worktree).
 * Ported from v2.1; git via execFile argv (cross-platform).
 */
import type { WorktreeManager } from './WorktreeManager';
import type { WorktreeInfo } from './WorktreeManager';
import { runGit, tryGit } from './gitExec';

/** Minimal trial shape for adopt (BON-* runner can supply more fields). */
export type AdoptableTrial = {
  id: string;
  worktree: WorktreeInfo;
};

export interface AdoptionResult {
  success: boolean;
  branch: string;
  filesChanged: number;
  diffSummary: string;
  error?: string;
}

/** Prefer `main`, then `master`, then current HEAD branch name. */
function defaultTrunk(repoRoot: string): string {
  if (tryGit(['rev-parse', '--verify', 'refs/heads/main'], { cwd: repoRoot })) return 'main';
  if (tryGit(['rev-parse', '--verify', 'refs/heads/master'], { cwd: repoRoot })) return 'master';
  const sym = tryGit(['symbolic-ref', '--short', 'HEAD'], { cwd: repoRoot });
  return sym?.trim() || 'HEAD';
}

export class AdoptWinner {
  private manager: WorktreeManager;
  private repoRoot: string;

  constructor(manager: WorktreeManager, repoRoot: string) {
    this.manager = manager;
    this.repoRoot = repoRoot;
  }

  async adopt(trial: AdoptableTrial): Promise<AdoptionResult> {
    const { worktree } = trial;
    const trunk = defaultTrunk(this.repoRoot);

    try {
      const diffOutput = runGit(['diff', `${trunk}...${worktree.branch}`, '--stat'], {
        cwd: this.repoRoot,
      }).trim();

      const filesChanged = diffOutput.split(/\r?\n/).filter((l) => l.trim()).length;

      runGit(
        ['merge', worktree.branch, '--no-ff', '-m', `Adopt Best-of-N winner: ${trial.id}`],
        { cwd: this.repoRoot }
      );

      const fullDiff = runGit(['diff', 'HEAD~1..HEAD', '--stat'], {
        cwd: this.repoRoot,
      }).trim();

      await this.manager.remove(worktree.path);

      return {
        success: true,
        branch: worktree.branch,
        filesChanged,
        diffSummary: fullDiff,
      };
    } catch (err) {
      tryGit(['merge', '--abort'], { cwd: this.repoRoot });

      return {
        success: false,
        branch: worktree.branch,
        filesChanged: 0,
        diffSummary: '',
        error: String(err),
      };
    }
  }

  async rejectAll(trials: AdoptableTrial[]): Promise<void> {
    for (const t of trials) {
      try {
        await this.manager.remove(t.worktree.path);
      } catch {
        /* skip */
      }
    }
  }
}
