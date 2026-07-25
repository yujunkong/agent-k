/**
 * AdoptWinner — 승자 worktree를 메인 워킹트리에 병합 (C7-T10)
 */
import { execSync } from 'child_process';
import * as path from 'path';
import { WorktreeManager } from './WorktreeManager';
import type { BoNTrial } from './BestOfN';

export interface AdoptionResult {
  success: boolean;
  branch: string;
  filesChanged: number;
  diffSummary: string;
  error?: string;
}

export class AdoptWinner {
  private manager: WorktreeManager;
  private repoRoot: string;

  constructor(manager: WorktreeManager, repoRoot: string) {
    this.manager = manager;
    this.repoRoot = repoRoot;
  }

  /**
   * Adopt a winning trial's worktree into the main working tree
   */
  async adopt(trial: BoNTrial): Promise<AdoptionResult> {
    const { worktree } = trial;

    try {
      // Get diff summary
      const diffOutput = execSync(
        `git diff main..${worktree.branch} --stat`,
        { cwd: this.repoRoot, stdio: 'pipe' }
      ).toString().trim();

      const filesChanged = diffOutput.split('\n').filter(l => l.trim()).length;

      // Merge the branch into main
      execSync(`git merge ${worktree.branch} --no-ff -m "Adopt Best-of-N winner: ${trial.id}"`, {
        cwd: this.repoRoot, stdio: 'pipe'
      });

      // Get full diff summary
      const fullDiff = execSync(
        `git diff HEAD~1..HEAD --stat`,
        { cwd: this.repoRoot, stdio: 'pipe' }
      ).toString().trim();

      // Remove the worktree
      await this.manager.remove(worktree.path);

      return {
        success: true,
        branch: worktree.branch,
        filesChanged,
        diffSummary: fullDiff
      };
    } catch (err) {
      // Rollback if merge fails
      try {
        execSync('git merge --abort', { cwd: this.repoRoot, stdio: 'pipe' });
      } catch { /* nothing to abort */ }

      return {
        success: false,
        branch: worktree.branch,
        filesChanged: 0,
        diffSummary: '',
        error: String(err)
      };
    }
  }

  /**
   * Clean up all remaining worktrees without merging
   */
  async rejectAll(trials: BoNTrial[]): Promise<void> {
    for (const t of trials) {
      try {
        await this.manager.remove(t.worktree.path);
      } catch { /* skip */ }
    }
  }
}
