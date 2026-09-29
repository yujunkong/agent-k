/**
 * V31-MODEL-01 — core↔providers tier temperature drift guard.
 *
 * core cannot import providers (package boundary), so the tier temperature
 * table is duplicated. Host depends on both packages and asserts parity here:
 * any drift in either copy fails this test.
 */
import { describe, expect, it } from 'vitest';
import { TIER_POLICIES } from '@agent-k/core';
import { TIER_TURN_POLICIES } from '@agent-k/providers';

const TIERS = ['A', 'B', 'C'] as const;

describe('V31-MODEL-01 core↔providers tier temperature parity', () => {
  it('core TIER_POLICIES temperatures match providers TIER_TURN_POLICIES', () => {
    for (const tier of TIERS) {
      expect(TIER_TURN_POLICIES[tier].modelParams.temperature).toBe(
        TIER_POLICIES[tier].modelParams.temperature,
      );
    }
  });

  it('values are exactly 0.1 / 0.2 / 0.0 and none is 0.7', () => {
    expect(TIER_TURN_POLICIES.A.modelParams.temperature).toBe(0.1);
    expect(TIER_TURN_POLICIES.B.modelParams.temperature).toBe(0.2);
    expect(TIER_TURN_POLICIES.C.modelParams.temperature).toBe(0.0);

    for (const tier of TIERS) {
      expect(TIER_TURN_POLICIES[tier].modelParams.temperature).not.toBe(0.7);
      expect(TIER_POLICIES[tier].modelParams.temperature).not.toBe(0.7);
    }
  });
});
