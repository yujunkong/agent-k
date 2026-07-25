/**
 * BestOfN — N개 worktree에서 병렬 Agent 실행 (C7-T08)
 */
import { WorktreeManager, type WorktreeInfo } from './WorktreeManager';
import { execSync } from 'child_process';
import * as path from 'path';

export interface BoNTrial {
  id: string;
  worktree: WorktreeInfo;
  model: string;
  prompt: string;
  status: 'running' | 'success' | 'failure';
  output?: string;
  testResults?: string;
  tokenUsage?: { input: number; output: number };
  duration?: number;
  error?: string;
}

export interface BoNConfig {
  n: number;
  models: string[];
  prompts: string[];
  task: string;
}

export class BestOfN {
  private manager: WorktreeManager;
  private trials: BoNTrial[] = [];

  constructor(manager: WorktreeManager) {
    this.manager = manager;
  }

  /**
   * Run N parallel trials
   */
  async run(config: BoNConfig): Promise<BoNTrial[]> {
    const { n, models, prompts, task } = config;
    this.trials = [];

    const branches: string[] = [];
    for (let i = 0; i < n; i++) {
      branches.push(`bon/${Date.now()}/${i}`);
    }

    // Create worktrees in parallel
    const worktrees = await Promise.all(
      branches.map(b => this.manager.create(b).catch(err => {
        console.error(`Failed to create worktree ${b}:`, err);
        return null;
      }))
    );

    // Run trials
    const trialPromises = worktrees.map(async (wt, i) => {
      if (!wt) return null;

      const startTime = Date.now();
      const trial: BoNTrial = {
        id: `trial-${i}`,
        worktree: wt,
        model: models[i % models.length],
        prompt: prompts[i % prompts.length],
        status: 'running'
      };

      this.trials.push(trial);

      try {
        // Write task file to worktree
        const taskFile = path.join(wt.path, '.agentk-task.md');
        execSync(`mkdir -p ${path.dirname(taskFile)} && echo "${task}" > ${taskFile}`, { stdio: 'pipe' });

        // Simulate agent execution (real execution would be delegated)
        trial.output = `Trial ${i} completed for: ${task.slice(0, 50)}...`;
        trial.status = 'success';
        trial.duration = Date.now() - startTime;
        trial.tokenUsage = { input: 1000, output: 200 };
      } catch (err) {
        trial.status = 'failure';
        trial.error = String(err);
        trial.duration = Date.now() - startTime;
      }

      return trial;
    });

    const results = await Promise.all(trialPromises);
    this.trials = results.filter((t): t is BoNTrial => t !== null);

    return this.trials;
  }

  /**
   * Get all trial results
   */
  getResults(): BoNTrial[] {
    return [...this.trials];
  }

  /**
   * Get the best trial (by success + token efficiency)
   */
  getWinner(): BoNTrial | null {
    const successful = this.trials.filter(t => t.status === 'success');
    if (successful.length === 0) return null;

    // Pick the one with lowest token usage (most efficient)
    return successful.sort((a, b) => {
      const aTokens = (a.tokenUsage?.input ?? 0) + (a.tokenUsage?.output ?? 0);
      const bTokens = (b.tokenUsage?.input ?? 0) + (b.tokenUsage?.output ?? 0);
      return aTokens - bTokens;
    })[0];
  }

  /**
   * Clean up all worktrees used in BoN
   */
  async cleanup(): Promise<void> {
    for (const trial of this.trials) {
      try {
        await this.manager.remove(trial.worktree.path);
      } catch { /* skip */ }
    }
  }
}
