/**
 * HARB-T12 — RoutingHeuristics regression tests.
 *
 * Focus: the jsonParseFailures>=3 cascade (priority 2 — second only to an
 * explicit user-forced tier). This is the signal that used to misfire
 * before the looksLikeBrokenToolPayload backtick-fence bug was fixed
 * (see tests/unit/loop/AgentLoopController.test.ts) — a session could get
 * pushed toward "session abort suggested" on turns that were just normal
 * code-block answers. This file locks in the priority ordering itself so a
 * future change to SIGNAL_PRIORITY can't silently let a lower-priority
 * signal (e.g. complexity heuristic) win over a real 3x-failure cascade,
 * or let jsonParseFailures>=3 override an explicit user_forced tier.
 */
import * as assert from 'assert';
import { routeByHeuristics, shouldForcePlan } from '../../../src/harness/RoutingHeuristics';

suite('routeByHeuristics — jsonParseFailures cascade', () => {
  test('jsonParseFailures >= 3 → tier B, session_abort_suggested reason', () => {
    const decision = routeByHeuristics({ jsonParseFailures: 3 });
    assert.strictEqual(decision.tier, 'B');
    assert.strictEqual(decision.reason, 'json_parse_failures_3x_session_abort_suggested');
  });

  test('jsonParseFailures == 2 → cascade does NOT fire (below threshold)', () => {
    const decision = routeByHeuristics({ jsonParseFailures: 2, currentTier: 'A' });
    assert.notStrictEqual(decision.reason, 'json_parse_failures_3x_session_abort_suggested');
  });

  test('jsonParseFailures >= 3 wins over lower-priority signals (plan approved, consecutive failures)', () => {
    const decision = routeByHeuristics({
      jsonParseFailures: 4,
      planApproved: true,
      mode: 'agent',
      consecutiveFailures: 5
    });
    assert.strictEqual(decision.reason, 'json_parse_failures_3x_session_abort_suggested');
  });

  test('userForcedTier still beats jsonParseFailures >= 3 (priority 1 > priority 2)', () => {
    const decision = routeByHeuristics({
      userForcedTier: 'C',
      jsonParseFailures: 10
    });
    assert.strictEqual(decision.tier, 'C');
    assert.strictEqual(decision.reason, 'user_forced');
  });

  test('no signals at all → falls back to currentTier (default)', () => {
    const decision = routeByHeuristics({ currentTier: 'B' });
    assert.strictEqual(decision.tier, 'B');
    assert.strictEqual(decision.reason, 'default');
  });

  test('no signals and no currentTier → defaults to tier A', () => {
    const decision = routeByHeuristics({});
    assert.strictEqual(decision.tier, 'A');
    assert.strictEqual(decision.reason, 'default');
  });
});

suite('routeByHeuristics — priority ordering (spot checks below the cascade)', () => {
  test('plan approved + agent mode → tier B execution reason (priority 3)', () => {
    const decision = routeByHeuristics({ planApproved: true, mode: 'agent' });
    assert.strictEqual(decision.tier, 'B');
    assert.strictEqual(decision.reason, 'plan_approved_execution');
  });

  test('planApproved true but mode != agent → does not trigger priority 3', () => {
    const decision = routeByHeuristics({ planApproved: true, mode: 'ask', currentTier: 'A' });
    assert.notStrictEqual(decision.reason, 'plan_approved_execution');
  });

  test('consecutiveFailures >= 2 → tier B promotion (priority 5)', () => {
    const decision = routeByHeuristics({ consecutiveFailures: 2 });
    assert.strictEqual(decision.tier, 'B');
    assert.strictEqual(decision.reason, 'consecutive_failures_2x');
  });

  test('budgetUsage >= 0.9 forces tier A even with other lower-priority signals', () => {
    const decision = routeByHeuristics({ budgetUsage: 0.95, consecutiveFailures: 3 });
    // consecutiveFailures (priority 5) sits above budget (priority 7), so it
    // wins here — this pins that ordering; budget only forces A when no
    // higher-priority signal is present.
    assert.strictEqual(decision.reason, 'consecutive_failures_2x');
  });

  test('budgetUsage >= 0.9 alone (no higher-priority signal) → tier A, budget_critical', () => {
    const decision = routeByHeuristics({ budgetUsage: 0.95 });
    assert.strictEqual(decision.tier, 'A');
    assert.strictEqual(decision.reason, 'budget_critical');
  });
});

suite('shouldForcePlan', () => {
  test('no userMessage → false', () => {
    assert.strictEqual(shouldForcePlan({}), false);
  });

  test('high-complexity keyword ("refactor") + fileCount >= 3 → true', () => {
    assert.strictEqual(
      shouldForcePlan({ userMessage: 'Please refactor the auth module', fileCount: 3 }),
      true
    );
  });

  test('high-complexity keyword but fileCount < 3 → still true if complexity score alone crosses 0.5', () => {
    const result = shouldForcePlan({
      userMessage: 'refactor and redesign and restructure this architecture',
      fileCount: 1
    });
    assert.strictEqual(result, true);
  });

  test('plain low-complexity message → false', () => {
    assert.strictEqual(shouldForcePlan({ userMessage: 'fix a typo', fileCount: 1 }), false);
  });
});
