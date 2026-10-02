/**
 * RRSI core types — ported from google-research/rrsi (Apache-2.0).
 *
 * S is a fraction in [0,1] (per-trial weighted mean reward), C is mean policy
 * tokens per trial, Delta C is RELATIVE. A missing trial contributes r = 0
 * with the full denominator (rrsi/evaluate.py) — a candidate cannot look
 * better by destroying the trials it finds hard.
 */

export type Component =
  | 'prompt'
  | 'control_flow'
  | 'config'
  | 'output_plumbing'
  | 'context_mgmt'
  | 'client_tool'
  | 'skill'
  | 'memory'
  | 'subagent';

/** Structural subset K_str (components that add machinery). */
export const K_STRUCTURAL: Component[] = [
  'client_tool',
  'skill',
  'memory',
  'subagent',
];

/** Fixed vocabulary of component tags (rrsi/components.py K). */
export const K: Component[] = [
  'prompt',
  'control_flow',
  'config',
  'output_plumbing',
  'context_mgmt',
  'client_tool',
  'skill',
  'memory',
  'subagent',
];

/** One trial of the policy harness on one task. */
export interface TaskResult {
  /** One reward per trial; missing trials are 0.0 with full denominator. */
  rewards: number[];
  /** Default 1.0 each. */
  weights: number[];
  /** Policy tokens per trial, or null when unmeasured. */
  tokens: Array<number | null>;
  extra?: Record<string, unknown>;
}

export interface EvalResult {
  job: string;
  k: number;
  /** task_id -> TaskResult */
  perTask: Record<string, TaskResult>;
  /** S_hat — weighted per-trial mean reward. */
  S: number;
  /** C_hat — mean policy tokens, null when no token counts exist. */
  C: number | null;
  nExpected: number;
  missing: number;
  extra?: Record<string, unknown>;
}

export interface Edit {
  id: string;
  component: Component;
  hypothesis: string;
  targetsMode?: string;
  predictedAffected?: string[];
  triggerCondition?: string;
}

export type MeasuredOutcome = 'ACCEPTED' | 'REJECTED' | 'LOST';

export interface Candidate {
  variant: string;
  edits: Edit[];
  ev: EvalResult | null;
  diffPath: string | null;
  /** critic_reject / smoke_fail / eval_invalid */
  gateFailure: string | null;
  detail: string;
}

export interface Decision {
  variant: string;
  admissible: boolean;
  reason: string;
  S: number | null;
  C: number | null;
  deltaS: number | null;
  deltaC: number | null;
  novelty: number;
  guards: string[];
}

export interface RRSIConfig {
  /** Rounds t = 0..T-1. */
  T: number;
  /** Trials per task. */
  k: number;
  /** Candidates drawn per round. */
  m: number;
  /** Annealed edit-budget bounds. */
  bMin: number;
  bMax: number;
  /** Stall window. */
  w: number;
  /** Reserved exploratory candidate slots when stalled. */
  mDraft: number;
  /** Noise band; null requires calibration. */
  delta: number | null;
  beta0: number;
  beta1: number;
  wS: number;
  wC: number;
  wN: number;
  /** Prune window. */
  nPrune: number;
}

export const DEFAULT_CONFIG: RRSIConfig = {
  T: 20,
  k: 2,
  m: 2,
  bMin: 1,
  bMax: 4,
  w: 3,
  mDraft: 1,
  delta: null,
  beta0: 0.1,
  beta1: 40,
  wS: 100,
  wC: 15,
  wN: 0.5,
  nPrune: 4,
};
