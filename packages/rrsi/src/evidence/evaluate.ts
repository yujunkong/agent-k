/**
 * Empirical score and cost — port of rrsi/evaluate.py `aggregate`.
 *
 *   S_hat(H) = 1/(k|D|) Σ_x Σ_j w_j r(x, τ_x^(j))
 *   C_hat(H) = 1/(k|D|) Σ_x Σ_j c(τ_x^(j))
 *
 * A missing trial (crash/timeout/infra) contributes r = 0 with the full
 * denominator, never an absent slot.
 */

import type { EvalResult, TaskResult } from '../types';

export function taskMean(tr: TaskResult): number {
  const w = tr.weights.length
    ? tr.weights.reduce((a, b) => a + b, 0)
    : tr.rewards.length;
  if (!w) return 0;
  const weights = tr.weights.length
    ? tr.weights
    : tr.rewards.map(() => 1.0);
  return (
    tr.rewards.reduce((acc, r, i) => acc + r * (weights[i] ?? 1.0), 0) / w
  );
}

export function relativeCostChange(candC: number | null, incC: number | null): number {
  if (candC == null || incC == null || incC === 0) return 0;
  return (candC - incC) / incC;
}

export function aggregate(
  job: string,
  k: number,
  perTask: Record<string, TaskResult>,
  nExpected: number,
  extra?: Record<string, unknown>
): EvalResult {
  let sum = 0;
  let weightSum = 0;
  let tokenSum = 0;
  let tokenTrials = 0;
  let missing = 0;
  const ids = Object.keys(perTask);
  void nExpected;
  for (const id of ids) {
    const tr = perTask[id];
    const rewards = tr.rewards.length ? tr.rewards : [0];
    const weights = tr.weights.length
      ? tr.weights
      : rewards.map(() => 1.0);
    for (let j = 0; j < k; j++) {
      const present = j < tr.rewards.length;
      const r = present ? rewards[j]! : 0; // missing trial -> 0, full denominator
      const w = weights[j] ?? 1.0;
      sum += r * w;
      weightSum += w;
      const tok = tr.tokens?.[j];
      if (tok != null) {
        tokenSum += tok;
        tokenTrials++;
      }
    }
    missing += Math.max(0, k - tr.rewards.length);
  }
  const S = weightSum > 0 ? sum / weightSum : 0;
  const C = tokenTrials > 0 ? tokenSum / tokenTrials : null;
  void missing;
  return {
    job,
    k,
    perTask,
    S,
    C,
    nExpected,
    missing,
    ...(extra ? { extra } : {}),
  };
}
