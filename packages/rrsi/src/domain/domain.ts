/**
 * The Domain interface — ported from rrsi/domain.py.
 *
 * RRSI itself never runs an agent, grades a deliverable or reads a
 * trajectory. A domain adapter supplies those plus the texts that make the
 * search roles speak the task family's language. Agent-K instantiates the
 * coding domain over its own verification infra (tests/lints/git evidence).
 */

import type { EvalResult, TaskResult } from '../types';

export interface TaskSpec {
  id: string;
  /** Prompt sent to the worker. */
  prompt: string;
  /** Working tree / repo for the task (absolute path). */
  repoRoot: string;
  /** Optional timeout override (ms). */
  timeoutMs?: number;
}

export interface TaskRunOutput {
  taskId: string;
  /** Whether the run completed at all (false = missing trial -> reward 0). */
  completed: boolean;
  /** Evidence the evaluator turns into a reward. */
  testsPassed?: number;
  testsFailed?: number;
  lintErrors?: number;
  requirementsVerified?: boolean;
  /** Policy cost. */
  tokens?: number;
  toolCalls?: number;
  stopReason?: string;
  /** Rendered trajectory for the analyst (plain text, capped by caller). */
  transcript?: string;
}

export interface DomainGuardsInput {
  incumbent: EvalResult;
  candidate: EvalResult;
}

/**
 * Everything the evolution loop needs from a task family. The default
 * `score` derives rewards from verification evidence; `guards` is empty.
 */
export abstract class Domain {
  abstract get name(): string;

  /** Task ids in the evolve set. */
  abstract evolveIds(): string[];
  /** Optional held-out ids for an OOD check after acceptance. */
  heldoutIds(): string[] {
    return [];
  }

  /** Run one task with the harness checked out under `policyDir`. */
  abstract run(
    task: TaskSpec,
    ctx: { policyDir: string; worktreePath?: string; k: number }
  ): Promise<TaskRunOutput>;

  /**
   * Reward in [0,1] from a run output. Default: verification-weighted —
   * failed tests and lint errors are hard zero; otherwise the fraction of
   * requirements verified, falling back to tests-passed ratio.
   */
  reward(out: TaskRunOutput): number {
    if (!out.completed) return 0;
    const passed = out.testsPassed ?? 0;
    const failed = out.testsFailed ?? 0;
    // Tests + lint evidence dominate; a partial pass is a partial reward.
    const total = passed + failed;
    if (total > 0) return passed / total;
    if ((out.lintErrors ?? 0) > 0) return 0;
    if (out.requirementsVerified != null) return out.requirementsVerified ? 1 : 0;
    return 0;
  }

  /** Cost in policy tokens. */
  cost(out: TaskRunOutput): number | null {
    return out.tokens ?? null;
  }

  /** Non-compensatory checks; return violation descriptions. */
  guards(_input: DomainGuardsInput): string[] {
    return [];
  }
}

/** Aggregate per-task outputs into an EvalResult (rrsi/evaluate.py). */
export function scoreRuns(
  domain: Domain,
  job: string,
  k: number,
  perTask: Record<string, TaskRunOutput[]>
): EvalResult {
  const results: Record<string, TaskResult> = {};
  let missing = 0;
  for (const [id, outs] of Object.entries(perTask)) {
    const rewards: number[] = [];
    const tokens: Array<number | null> = [];
    for (let j = 0; j < k; j++) {
      const out = outs[j];
      if (!out || !out.completed) {
        rewards.push(0);
        tokens.push(null);
        missing++;
        continue;
      }
      rewards.push(domain.reward(out));
      tokens.push(domain.cost(out));
    }
    results[id] = { rewards, weights: rewards.map(() => 1.0), tokens };
  }
  let sum = 0;
  let weightSum = 0;
  let tokenSum = 0;
  let tokenTrials = 0;
  for (const tr of Object.values(results)) {
    for (let j = 0; j < k; j++) {
      const w = tr.weights[j] ?? 1.0;
      sum += (tr.rewards[j] ?? 0) * w;
      weightSum += w;
      const tok = tr.tokens[j];
      if (tok != null) {
        tokenSum += tok;
        tokenTrials++;
      }
    }
  }
  return {
    job,
    k,
    perTask: results,
    S: weightSum > 0 ? sum / weightSum : 0,
    C: tokenTrials > 0 ? tokenSum / tokenTrials : null,
    nExpected: Object.keys(perTask).length,
    missing,
  };
}
