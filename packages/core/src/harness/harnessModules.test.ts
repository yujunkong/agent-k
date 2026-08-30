/**
 * HARNESS-001/006 harness module tests.
 */
import { describe, expect, it } from 'vitest';
import { isToolAllowedForTier } from './AWhitelist';
import { inferTierFromModelId, getPolicyForTier } from './ModelTiers';
import { routeByHeuristics } from './RoutingHeuristics';
import { formatPrefetchBlock } from './HarnessBridge';

describe('ModelTiers (HARNESS-001)', () => {
  it('infers tier B for strong models', () => {
    expect(inferTierFromModelId('claude-sonnet-4')).toBe('B');
  });

  it('defaults to tier A', () => {
    expect(inferTierFromModelId('flash-lite')).toBe('A');
  });

  it('tier A policy has bounded tool whitelist', () => {
    expect(getPolicyForTier('A').toolWhitelist.length).toBeGreaterThan(5);
  });
});

describe('AWhitelist (HARNESS-001)', () => {
  it('blocks browser tools on tier A', () => {
    expect(isToolAllowedForTier('browser_navigate', 'A')).toBe(false);
    expect(isToolAllowedForTier('grep', 'A')).toBe(true);
  });
});

describe('RoutingHeuristics (HARNESS-006)', () => {
  it('escalates on security keywords', () => {
    const d = routeByHeuristics({
      userMessage: 'fix SQL injection vulnerability',
      currentTier: 'A',
    });
    expect(d.tier).toBe('B');
    expect(d.reason).toBe('security_keywords');
  });
});

describe('HarnessBridge (HARNESS-003)', () => {
  it('wraps prefetch text', () => {
    expect(formatPrefetchBlock('hello')).toContain('<prefetch>');
  });
});
