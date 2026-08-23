/**
 * Best-of-N worktree fan-out (supports WT-014 adopt). Full AgentLoop → BON-* later.
 * Ported from v2.1 `BestOfN.ts` without core AgentLoop import.
 */
import * as fs from 'fs';
import * as path from 'path';
import { WorktreeManager, type WorktreeInfo } from './WorktreeManager';

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

export type BoNTrialRunner = (ctx: {
  trial: BoNTrial;
  task: string;
}) => Promise<{ output?: string; success: boolean; error?: string }>;

export class BestOfN {
  private manager: WorktreeManager;
  private trials: BoNTrial[] = [];
  private runTrial: BoNTrialRunner;

  constructor(
    manager: WorktreeManager,
    /** Injected runner — default writes task file only (no AgentLoop). */
    runTrial?: BoNTrialRunner
  ) {
    this.manager = manager;
    this.runTrial =
      runTrial ??
      (async ({ trial, task }) => {
        const taskFile = path.join(trial.worktree.path, '.agentk-task.md');
        fs.mkdirSync(path.dirname(taskFile), { recursive: true });
        fs.writeFileSync(taskFile, task, 'utf-8');
        return { success: true, output: `Task staged in ${trial.worktree.branch}` };
      });
  }

  async run(config: BoNConfig): Promise<BoNTrial[]> {
    const { n, models, prompts, task } = config;
    this.trials = [];

    const branches: string[] = [];
    for (let i = 0; i < n; i++) {
      branches.push(`bon/${Date.now()}/${i}`);
    }

    const worktrees = await Promise.all(
      branches.map((b) =>
        this.manager.create(b).catch((err) => {
          console.error(`Failed to create worktree ${b}:`, err);
          return null;
        })
      )
    );

    const trialPromises = worktrees.map(async (wt, i) => {
      if (!wt) return null;

      const startTime = Date.now();
      const trial: BoNTrial = {
        id: `trial-${i}`,
        worktree: wt,
        model: models[i % models.length],
        prompt: prompts[i % prompts.length],
        status: 'running',
      };
      this.trials.push(trial);

      try {
        const result = await this.runTrial({ trial, task });
        trial.output = result.output;
        trial.status = result.success ? 'success' : 'failure';
        trial.error = result.error;
        trial.duration = Date.now() - startTime;
        trial.tokenUsage = { input: 0, output: 0 };
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

  getResults(): BoNTrial[] {
    return [...this.trials];
  }

  getWinner(): BoNTrial | null {
    const successful = this.trials.filter((t) => t.status === 'success');
    if (successful.length === 0) return null;
    return successful.sort((a, b) => {
      const aTokens = (a.tokenUsage?.input ?? 0) + (a.tokenUsage?.output ?? 0);
      const bTokens = (b.tokenUsage?.input ?? 0) + (b.tokenUsage?.output ?? 0);
      return aTokens - bTokens;
    })[0];
  }

  async adoptWinner(): Promise<BoNTrial | null> {
    const winner = this.getWinner();
    if (!winner) return null;
    for (const trial of this.trials) {
      if (trial.id !== winner.id) {
        try {
          await this.manager.remove(trial.worktree.path);
        } catch {
          /* skip */
        }
      }
    }
    return winner;
  }

  async cleanup(): Promise<void> {
    for (const trial of this.trials) {
      try {
        await this.manager.remove(trial.worktree.path);
      } catch {
        /* skip */
      }
    }
  }
}
