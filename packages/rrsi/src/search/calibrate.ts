/**
 * Noise-band calibration — port of rrsi/calibrate.py.
 *
 * δ bounds |S_hat(H) − S_hat(H)| between two independent evaluations of the
 * SAME harness. With R ≥ 2 base evaluations the null difference is observed
 * directly (sd·√2); with a single k-trial evaluation se(S_hat) is
 * bootstrapped over trials within each task and sd = √2·se.
 *
 *   delta = z · sd(null ΔS),  z = 2.0 by default
 *
 * so an unchanged harness clears the floor S* − δ about 97.5% of the time.
 */

import type { EvalResult, TaskResult } from '../types';

/** Deterministic PRNG (mulberry32) so calibration is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** se(S_hat) by resampling trials within each task (weights respected). */
export function bootstrapSe(
  ev: EvalResult,
  reps = 2000,
  seed = 7
): number {
  const rng = mulberry32(seed);
  const tasks = Object.values(ev.perTask).filter((tr) => tr.rewards.length);
  const vals: number[] = [];
  for (let r = 0; r < reps; r++) {
    let num = 0;
    let den = 0;
    for (const tr of tasks) {
      const n = tr.rewards.length;
      for (let j = 0; j < n; j++) {
        const i = Math.floor(rng() * n);
        num += tr.rewards[i]! * (tr.weights[i] ?? 1.0);
        den += tr.weights[i] ?? 1.0;
      }
    }
    vals.push(den > 0 ? num / den : 0);
  }
  return pstdev(vals);
}

function pstdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Concatenate trials of several evaluations of the same harness. */
export function pooledEvals(evals: EvalResult[]): EvalResult {
  const per: Record<string, TaskResult> = {};
  let k = 0;
  for (const ev of evals) {
    k += ev.k;
    for (const [t, tr] of Object.entries(ev.perTask)) {
      const p = (per[t] ??= { rewards: [], weights: [], tokens: [] });
      p.rewards.push(...tr.rewards);
      p.weights.push(...(tr.weights.length ? tr.weights : tr.rewards.map(() => 1.0)));
      p.tokens.push(...(tr.tokens ?? []));
    }
  }
  let sum = 0;
  let wsum = 0;
  let tokSum = 0;
  let tokTrials = 0;
  for (const tr of Object.values(per)) {
    for (let j = 0; j < tr.rewards.length; j++) {
      const w = tr.weights[j] ?? 1.0;
      sum += (tr.rewards[j] ?? 0) * w;
      wsum += w;
      const tok = tr.tokens?.[j];
      if (tok != null) {
        tokSum += tok;
        tokTrials++;
      }
    }
  }
  return {
    job: 'pooled',
    k,
    perTask: per,
    S: wsum > 0 ? sum / wsum : 0,
    C: tokTrials > 0 ? tokSum / tokTrials : null,
    nExpected: Object.keys(per).length,
    missing: 0,
  };
}

export interface Calibration {
  delta: number;
  z: number;
  sdNull: number;
  sdNullBootstrap: number;
  seBootstrap: number;
  method: 'repeated base evaluations' | 'bootstrap over trials of one base evaluation';
  nEvals: number;
  k: number;
  nTasks: number;
  SBase: number;
  CBase: number | null;
}

/** δ from one or more base-harness evaluations. */
export function calibrate(
  evals: EvalResult[],
  z = 2.0,
  reps = 2000
): Calibration {
  if (!evals.length) throw new Error('no base evaluations');
  let sdNull = 0;
  let method: Calibration['method'] =
    'bootstrap over trials of one base evaluation';
  if (evals.length >= 2) {
    const scores = evals.map((e) => e.S);
    sdNull = stdev(scores) * Math.SQRT2;
    method = 'repeated base evaluations';
  }
  const pooled = pooledEvals(evals);
  const se = bootstrapSe(pooled, reps);
  const sdBoot = Math.SQRT2 * se * Math.sqrt(pooled.k / evals[0]!.k);
  const sdUse = evals.length >= 2 && sdNull > 0 ? sdNull : sdBoot;
  return {
    delta: round6(z * sdUse),
    z,
    sdNull: round6(sdUse),
    sdNullBootstrap: round6(sdBoot),
    seBootstrap: round6(se),
    method,
    nEvals: evals.length,
    k: evals[0]!.k,
    nTasks: Object.keys(pooled.perTask).length,
    SBase: round6(evals[0]!.S),
    CBase: evals[0]!.C,
  };
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
