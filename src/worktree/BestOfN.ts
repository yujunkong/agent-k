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

        // ─── Real AgentLoop execution (RW-C7-02: simulate 제거) ──
        const { AgentLoopController } = await import('../loop/AgentLoopController');
        const loop = new AgentLoopController({
          mode: 'agent',
          maxTurns: 10,
          modelId: models[i % models.length],
          systemPrompt: `You are Agent K in the BestOfN worktree "${wt.branch}". Task: ${task}`,
          onStatus: (status) => { trial.status = status === 'completed' ? 'success' : 'running'; },
          onError: (err) => { trial.error = err.message; }
        });

        try {
          await loop.start(task);
          trial.output = `Trial ${i} completed. Agent executed ${loop.state.currentTurn} turns.`;
          trial.status = loop.state.status === 'completed' ? 'success' : 'failure';
          trial.duration = Date.now() - startTime;
          trial.tokenUsage = { input: 0, output: 0 }; // Tracked by provider
        } catch (loopErr) {
          // If provider isn't configured, fall back gracefully
          trial.output = `Trial ${i} agent loop error: ${loopErr instanceof Error ? loopErr.message : String(loopErr)}`;
          trial.status = 'failure';
          trial.duration = Date.now() - startTime;
        }
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
   * Adopt the winner worktree and clean up losers (RW-C7-02: 승자 adopt/패자 cleanup)
   */
  async adoptWinner(): Promise<BoNTrial | null> {
    const winner = this.getWinner();
    if (!winner) return null;

    // Keep winner's worktree; remove all others
    for (const trial of this.trials) {
      if (trial.id !== winner.id) {
        try {
          await this.manager.remove(trial.worktree.path);
        } catch { /* skip */ }
      }
    }
    return winner;
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
