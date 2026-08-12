import * as assert from 'assert';
import {
  isLegalPhaseTransition,
  assertLegalPhaseTransition,
  validatePhaseTransition,
  validateEventPhaseTransition,
  phaseForEvent,
  IllegalPhaseTransitionError,
  PLAN_PHASE_TRANSITIONS
} from '../../../../src/plan/v2/PlanPhaseTransitions';
import type { PlanPhase } from '../../../../src/plan/v2/PlanSession';

suite('Plan V2 — PlanPhaseTransitions (FSM table)', () => {
  test('self-transitions are always legal', () => {
    for (const phase of Object.keys(PLAN_PHASE_TRANSITIONS) as PlanPhase[]) {
      assert.strictEqual(isLegalPhaseTransition(phase, phase), true, `${phase} -> ${phase}`);
      const r = validatePhaseTransition(phase, phase);
      assert.strictEqual(r.ok, true);
      if (r.ok) assert.strictEqual(r.self, true);
    }
  });

  test('the normal happy path is fully legal', () => {
    const path: PlanPhase[] = ['idle', 'research', 'planning', 'review', 'executing', 'completed'];
    for (let i = 0; i < path.length - 1; i++) {
      assert.strictEqual(
        isLegalPhaseTransition(path[i], path[i + 1]),
        true,
        `${path[i]} -> ${path[i + 1]}`
      );
    }
  });

  test('review -> planning (reject) is legal', () => {
    assert.strictEqual(isLegalPhaseTransition('review', 'planning'), true);
  });

  test('planning -> failed (generation exhausted) is legal', () => {
    assert.strictEqual(isLegalPhaseTransition('planning', 'failed'), true);
  });

  test('executing -> review (reopen for replan) is legal', () => {
    assert.strictEqual(isLegalPhaseTransition('executing', 'review'), true);
  });

  test('idle -> executing is illegal', () => {
    assert.strictEqual(isLegalPhaseTransition('idle', 'executing'), false);
    const r = validatePhaseTransition('idle', 'executing');
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.strictEqual(r.code, 'ILLEGAL_TRANSITION');
      assert.ok(r.hint.includes('idle'));
      assert.deepStrictEqual(r.allowed, PLAN_PHASE_TRANSITIONS.idle);
    }
  });

  test('research -> executing is illegal', () => {
    assert.strictEqual(isLegalPhaseTransition('research', 'executing'), false);
  });

  test('completed -> executing is illegal', () => {
    assert.strictEqual(isLegalPhaseTransition('completed', 'executing'), false);
  });

  test('assertLegalPhaseTransition throws with from/to/code/hint', () => {
    assert.throws(
      () => assertLegalPhaseTransition('idle', 'executing'),
      (err: unknown) => {
        assert.ok(err instanceof IllegalPhaseTransitionError);
        assert.strictEqual(err.from, 'idle');
        assert.strictEqual(err.to, 'executing');
        assert.strictEqual(err.code, 'ILLEGAL_TRANSITION');
        assert.ok(err.hint.length > 0);
        return true;
      }
    );
  });

  test('assertLegalPhaseTransition does not throw on legal jumps', () => {
    assert.doesNotThrow(() => assertLegalPhaseTransition('review', 'executing'));
  });

  test('GUARD_NO_PLAN when entering executing without structured plan', () => {
    const r = validatePhaseTransition('review', 'executing', { hasStructuredPlan: false });
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.strictEqual(r.code, 'GUARD_NO_PLAN');
  });

  test('review -> executing with hasStructuredPlan true is ok', () => {
    const r = validatePhaseTransition('review', 'executing', { hasStructuredPlan: true });
    assert.strictEqual(r.ok, true);
  });
});

suite('Plan V2 — event → phase mapping', () => {
  test('phaseForEvent covers the lifecycle', () => {
    assert.strictEqual(phaseForEvent('plan.started'), 'research');
    assert.strictEqual(phaseForEvent('research.completed'), 'planning');
    assert.strictEqual(phaseForEvent('plan.generation.attempt'), 'planning');
    assert.strictEqual(phaseForEvent('plan.generation.failed'), undefined);
    assert.strictEqual(phaseForEvent('plan.generated'), 'review');
    assert.strictEqual(phaseForEvent('plan.approved'), 'executing');
    assert.strictEqual(phaseForEvent('plan.rejected'), 'planning');
    assert.strictEqual(phaseForEvent('plan.completed'), 'completed');
    assert.strictEqual(phaseForEvent('plan.failed'), 'failed');
    assert.strictEqual(phaseForEvent('task.status.changed'), undefined);
  });

  test('validateEventPhaseTransition rejects plan.approved from idle', () => {
    const r = validateEventPhaseTransition('idle', 'plan.approved');
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.strictEqual(r.code, 'ILLEGAL_TRANSITION');
  });

  test('validateEventPhaseTransition allows plan.approved from review with plan', () => {
    const r = validateEventPhaseTransition('review', 'plan.approved', {
      hasStructuredPlan: true
    });
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.strictEqual(r.to, 'executing');
  });

  test('validateEventPhaseTransition allows task.status.changed anywhere', () => {
    for (const phase of Object.keys(PLAN_PHASE_TRANSITIONS) as PlanPhase[]) {
      const r = validateEventPhaseTransition(phase, 'task.status.changed');
      assert.strictEqual(r.ok, true, phase);
    }
  });
});
