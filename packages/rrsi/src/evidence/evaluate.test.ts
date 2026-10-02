import { describe, expect, it } from 'vitest';
import { aggregate, relativeCostChange } from './evaluate';
import type { TaskResult } from './types';

describe('RRSI evaluate.aggregate', () => {
  it('S_hat is the weighted per-trial mean over k|D| slots', () => {
    const ev = aggregate('job', 2, {
      t1: { rewards: [1, 0], weights: [1, 1], tokens: [100, 200] },
      t2: { rewards: [1, 1], weights: [1, 1], tokens: [50, 50] },
    }, 2);
    expect(ev.S).toBeCloseTo(0.75);
    expect(ev.C).toBe(100);
  });

  it('a missing trial counts 0 with the full denominator', () => {
    const ev = aggregate('job', 2, {
      t1: { rewards: [1], weights: [1], tokens: [100] },
      t2: { rewards: [], weights: [], tokens: [] },
    }, 2);
    // 4 slots: 1 + 0 + 0 + 0 = 0.25
    expect(ev.S).toBeCloseTo(0.25);
    expect(ev.missing).toBe(3);
  });

  it('weights scale rewards (Harvey-style criteria)', () => {
    const ev = aggregate('job', 1, {
      t1: { rewards: [0.5], weights: [4], tokens: [null] } as unknown as TaskResult,
    }, 1);
    expect(ev.S).toBeCloseTo(0.5);
    expect(ev.C).toBeNull();
  });

  it('relative cost change is relative', () => {
    expect(relativeCostChange(110, 100)).toBeCloseTo(0.1);
    expect(relativeCostChange(90, 100)).toBeCloseTo(-0.1);
    expect(relativeCostChange(null, 100)).toBe(0);
  });
});
