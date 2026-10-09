/**
 * V31-MODEL-01 — core tier temperatures match ISSUE-07 (A 0.1 / B 0.2 / C 0.0).
 */

import { describe, expect, it } from 'vitest';
import { getPolicyForTier } from '@agent-k/core';

describe('V31-MODEL-01 tier temperature parity', () => {
  it('A/B/C temperatures', () => {
    expect(getPolicyForTier('A').modelParams.temperature).toBe(0.1);
    expect(getPolicyForTier('B').modelParams.temperature).toBe(0.2);
    expect(getPolicyForTier('C').modelParams.temperature).toBe(0.0);
  });
});
