/**
 * Algorithm 2 (selection side) — port of rrsi/selection.py as pure functions.
 *
 *   ΔS = S' − S_t,   ΔC = (C' − C_t)/C_t
 *   c = [ΔC ≤ β0 + β1·ΔS]                 if ΔS > δ     (token budget)
 *       [w_s·ΔS − w_c·ΔC + w_n·ν > 0]     otherwise     (shaped)
 *   admissible iff S' ≥ S* − δ and c (and no domain guard violation)
 *
 *   H_{t+1} = argmax_{admissible} S', or H_t if none is admissible.
 *   S*     = max(S*, S_{t+1})
 */

import { K_STRUCTURAL, type Candidate, type Decision, type EvalResult, type RRSIConfig } from '../types';

/** ν — count of structural component types never in a winning edit. */
export function novelty(
  components: Array<string | undefined>,
  incumbentCounts: Record<string, number>
): number {
  const used = new Set(components.filter(Boolean) as string[]);
  return K_STRUCTURAL.filter((k) => !incumbentCounts[k] && used.has(k)).length;
}

export function costRule(
  deltaS: number,
  deltaC: number,
  nov: number,
  delta: number,
  cfg: RRSIConfig
): { ok: boolean; why: string } {
  if (deltaS > delta) {
    const budget = cfg.beta0 + cfg.beta1 * deltaS;
    const ok = deltaC <= budget;
    return {
      ok,
      why:
        `gain ${deltaS.toFixed(4)} > delta ${delta.toFixed(4)}; cost change ` +
        `${deltaC.toFixed(3)} ${ok ? '<=' : '>'} budget ${budget.toFixed(3)} ` +
        `(beta0 ${cfg.beta0} + beta1 ${cfg.beta1} * dS)`,
    };
  }
  const shaped = cfg.wS * deltaS - cfg.wC * deltaC + cfg.wN * nov;
  const ok = shaped > 0;
  return {
    ok,
    why:
      `gain ${deltaS.toFixed(4)} within delta ${delta.toFixed(4)}; shaped ` +
      `${cfg.wS}*dS - ${cfg.wC}*dC + ${cfg.wN}*nu = ${shaped.toFixed(4)} ` +
      `${ok ? '>' : '<='} 0 (nu=${nov})`,
  };
}

export function judge(
  cand: Candidate,
  incumbent: EvalResult,
  sStar: number,
  delta: number,
  cfg: RRSIConfig,
  incumbentCounts: Record<string, number>,
  guards: string[] = []
): Decision {
  const ev = cand.ev;
  if (!ev) {
    return {
      variant: cand.variant,
      admissible: false,
      reason: cand.gateFailure || 'not evaluated',
      S: null,
      C: null,
      deltaS: null,
      deltaC: null,
      novelty: 0,
      guards,
    };
  }
  const dS = ev.S - incumbent.S;
  const dC = (ev.C != null && incumbent.C) ? (ev.C - incumbent.C) / incumbent.C : 0;
  const nov = novelty(
    cand.edits.map((e) => e.component),
    incumbentCounts
  );
  const d: Decision = {
    variant: cand.variant,
    admissible: false,
    reason: '',
    S: ev.S,
    C: ev.C,
    deltaS: dS,
    deltaC: dC,
    novelty: nov,
    guards: [...guards],
  };
  const floor = sStar - delta;
  if (ev.S < floor) {
    d.reason =
      `below noise-adjusted floor: S' ${ev.S.toFixed(4)} < S* ${sStar.toFixed(4)} - delta ${delta.toFixed(4)}`;
    return d;
  }
  const { ok, why } = costRule(dS, dC, nov, delta, cfg);
  if (!ok) {
    d.reason = `cost rule failed: ${why}`;
    return d;
  }
  if (guards.length) {
    d.reason = 'domain guard violated: ' + guards.join('; ');
    return d;
  }
  d.admissible = true;
  d.reason = `admissible: ${why}`;
  return d;
}

export function selectRound(
  cands: Candidate[],
  incumbent: EvalResult,
  sStar: number,
  delta: number,
  cfg: RRSIConfig,
  incumbentCounts: Record<string, number>,
  guardFn?: (inc: EvalResult, cand: EvalResult) => string[]
): { winner: Candidate | null; decisions: Decision[] } {
  const decisions = cands.map((c) => {
    const g = guardFn && c.ev ? guardFn(incumbent, c.ev) : [];
    return judge(c, incumbent, sStar, delta, cfg, incumbentCounts, g);
  });
  const admissible = cands
    .map((c, i) => ({ c, d: decisions[i] }))
    .filter(({ d }) => d.admissible);
  if (!admissible.length) return { winner: null, decisions };
  const winner = admissible.reduce((a, b) => (b.d.S! > a.d.S! ? b : a)).c;
  return { winner, decisions };
}

/** σ_t — stall flag: last-w window of scores all within δ of each other. */
export function stallFlag(
  traj: number[],
  t: number,
  w: number,
  delta: number
): boolean {
  const recent = traj.slice(Math.max(0, t - w), t + 1);
  if (recent.length < Math.min(w + 1, 2)) return false;
  const mx = Math.max(...recent);
  const mn = Math.min(...recent);
  return mx - mn <= delta;
}
