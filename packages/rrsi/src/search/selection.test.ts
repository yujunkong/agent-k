import { describe, expect, it } from 'vitest';
import { costRule, judge, novelty, selectRound, stallFlag } from './selection';
import { DEFAULT_CONFIG, type Candidate, type EvalResult } from '../types';

const cfg = { ...DEFAULT_CONFIG, delta: 0.017 };

function ev(S: number, C: number, job = 'j'): EvalResult {
  return { job, k: 2, perTask: {}, S, C, nExpected: 2, missing: 0 };
}

const incCounts = { skill: 2, memory: 1 };

function cand(variant: string, S: number, C: number, components: string[] = []): Candidate {
  return {
    variant,
    edits: components.map((c, i) => ({
      id: `C${i + 1}`,
      component: c as never,
      hypothesis: 'h',
    })),
    ev: ev(S, C, variant),
    diffPath: null,
    gateFailure: null,
    detail: '',
  };
}

describe('RRSI selection (Algorithm 2)', () => {
  it('gain above delta passes the token-budget rule when cost is paid for', () => {
    // dS=+0.05 > delta; budget = 0.1 + 40*0.05 = 2.1; dC=0.05 ok
    const d = judge(cand('A', 0.85, 105), ev(0.8, 100), 0.8, 0.017, cfg, incCounts);
    expect(d.admissible).toBe(true);
    expect(d.reason).toContain('token' === '' ? '' : 'budget');
  });

  it('cost rule rejects unpaid token growth', () => {
    // dS=+0.01 within band -> shaped rule; wS*dS - wC*dC = 1 - 0.45 > 0 (ok)
    // Instead test the budget path: dS=0.02 > delta, dC=2.0 > 0.1+40*0.02=0.9
    const d = judge(cand('A', 0.82, 300), ev(0.8, 100), 0.8, 0.017, cfg, incCounts);
    expect(d.admissible).toBe(false);
    expect(d.reason).toContain('cost rule failed');
  });

  it('below the noise-adjusted floor is inadmissible', () => {
    const d = judge(cand('A', 0.75, 100), ev(0.8, 100), 0.8, 0.017, cfg, incCounts);
    expect(d.admissible).toBe(false);
    expect(d.reason).toContain('floor');
  });

  it('novelty counts structural components absent from the incumbent', () => {
    const nov = novelty(['subagent', 'skill'], { skill: 1 });
    expect(nov).toBe(1); // subagent is new, skill already used
  });

  it('selectRound returns the argmax admissible candidate', () => {
    const { winner, decisions } = selectRound(
      [cand('A', 0.86, 105, ['prompt']), cand('B', 0.84, 95)],
      ev(0.8, 100),
      0.8,
      0.017,
      cfg,
      incCounts
    );
    expect(winner?.variant).toBe('A');
    expect(decisions).toHaveLength(2);
    expect(decisions[0]!.admissible).toBe(true);
    expect(decisions[1]!.admissible).toBe(true);
  });

  it('selectRound keeps the incumbent when nothing is admissible', () => {
    const { winner } = selectRound(
      [cand('A', 0.5, 100)],
      ev(0.8, 100),
      0.8,
      0.017,
      cfg,
      incCounts
    );
    expect(winner).toBeNull();
  });

  it('shaped rule admits within-band token savers', () => {
    // dS=0 within band: shaped = 0 - 15*(-0.1) + 0 = 1.5 > 0
    const r = costRule(0, -0.1, 0, 0.017, cfg);
    expect(r.ok).toBe(true);
  });

  it('stallFlag fires when the last w scores are within delta', () => {
    expect(stallFlag([0.8, 0.805, 0.81, 0.81], 3, 3, 0.017)).toBe(true);
    expect(stallFlag([0.7, 0.805, 0.81, 0.81], 3, 3, 0.017)).toBe(false);
  });
});
