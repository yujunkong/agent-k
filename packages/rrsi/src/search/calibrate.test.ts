import { describe, expect, it } from 'vitest';
import { bootstrapSe, calibrate, pooledEvals } from './calibrate';
import { reviewDiff } from './criticLlm';
import type { EvalResult } from '../types';

function makeEval(job: string, k: number, rewardsPerTask: number[][]): EvalResult {
  const perTask: EvalResult['perTask'] = {};
  rewardsPerTask.forEach((rewards, i) => {
    perTask[`t${i}`] = { rewards, weights: rewards.map(() => 1), tokens: [] };
  });
  const nTrials = rewardsPerTask.reduce((a, r) => a + r.length, 0);
  const sum = rewardsPerTask.flat().reduce((a, b) => a + b, 0);
  return {
    job,
    k,
    perTask,
    S: nTrials ? sum / nTrials : 0,
    C: null,
    nExpected: rewardsPerTask.length,
    missing: 0,
  };
}

describe('RRSI calibrate', () => {
  it('bootstrap se of a deterministic harness is 0', () => {
    const ev = makeEval('j', 2, [[1, 1], [1, 1]]);
    expect(bootstrapSe(ev)).toBe(0);
  });

  it('bootstrap se grows with per-trial variance', () => {
    const stable = makeEval('j', 2, [[1, 1], [0, 0]]);
    const mixed = makeEval('j', 2, [[1, 0], [0, 1]]);
    expect(bootstrapSe(mixed)).toBeGreaterThan(bootstrapSe(stable));
  });

  it('repeated evaluations observe the null difference directly', () => {
    const a = makeEval('r1', 2, [[1, 1], [0.5, 0.5]]);
    const b = makeEval('r2', 2, [[0, 0], [1, 1]]);
    const cal = calibrate([a, b]);
    expect(cal.method).toBe('repeated base evaluations');
    expect(cal.delta).toBeGreaterThan(0);
  });

  it('single evaluation falls back to bootstrap', () => {
    const a = makeEval('r1', 2, [[1, 0], [0, 1]]);
    const cal = calibrate([a]);
    expect(cal.method).toBe('bootstrap over trials of one base evaluation');
    expect(cal.delta).toBeGreaterThan(0);
  });

  it('pooledEvals concatenates trials', () => {
    const a = makeEval('r1', 1, [[1], [0]]);
    const b = makeEval('r2', 1, [[0], [1]]);
    const p = pooledEvals([a, b]);
    expect(p.k).toBe(2);
    expect(p.perTask['t0']!.rewards).toEqual([1, 0]);
    expect(p.S).toBeCloseTo(0.5);
  });
});

describe('RRSI critic LLM layer', () => {
  it('hard precheck rejects credentials without a model call', async () => {
    let called = 0;
    const v = await reviewDiff({
      generate: async () => {
        called++;
        return '{"verdict":"accept","reasons":[],"risk_notes":[]}';
      },
      diff: '+ const key = "sk-abcdefghijklmnopqrstuv";',
      summary: 's',
      targetsMode: 'm',
      declaredEdits: [],
    });
    expect(called).toBe(0);
    expect(v.verdict).toBe('reject');
    expect(v.reasons[0]).toContain('precheck');
  });

  it('accepts a clean general-procedure diff', async () => {
    const v = await reviewDiff({
      generate: async () =>
        '{"verdict":"accept","reasons":[],"risk_notes":[]}',
      diff: '+ Verify each requirement before finalizing.',
      summary: 's',
      targetsMode: 'm',
      declaredEdits: [],
    });
    expect(v.verdict).toBe('accept');
  });

  it('rejects on the model verdict', async () => {
    const v = await reviewDiff({
      generate: async () =>
        '{"verdict":"reject","reasons":["task-id branching"],"risk_notes":[]}',
      diff: '+ if (task.name === "fix-git") skipVerification();',
      summary: 's',
      targetsMode: 'm',
      declaredEdits: [],
    });
    expect(v.verdict).toBe('reject');
    expect(v.reasons).toContain('task-id branching');
  });

  it('rejects after unparseable retries', async () => {
    let calls = 0;
    const v = await reviewDiff({
      generate: async () => {
        calls++;
        return 'not json';
      },
      diff: '+ step',
      summary: 's',
      targetsMode: 'm',
      declaredEdits: [],
      maxAttempts: 2,
    });
    expect(calls).toBe(2);
    expect(v.verdict).toBe('reject');
    expect(v.reasons[0]).toContain('unparseable');
  });
});
