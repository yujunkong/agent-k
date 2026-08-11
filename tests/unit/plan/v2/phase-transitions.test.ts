import * as assert from 'assert';
import {
  isLegalPhaseTransition,
  assertLegalPhaseTransition,
  IllegalPhaseTransitionError,
  PLAN_PHASE_TRANSITIONS
} from '../../../../src/plan/v2/PlanPhaseTransitions';
import type { PlanPhase } from '../../../../src/plan/v2/PlanSession';

suite('Plan V2 — PlanPhaseTransitions', () => {
  test('self-transitions are always legal', () => {
    for (const phase of Object.keys(PLAN_PHASE_TRANSITIONS) as PlanPhase[]) {
      assert.strictEqual(isLegalPhaseTransition(phase, phase), true, `${phase} -> ${phase}`);
    }
  });

  test('the normal happy path is fully legal', () => {
    const path: PlanPhase[] = ['idle', 'research', 'planning', 'review', 'executing', 'completed'];
    for (let i = 0; i < path.length - 1; i++) {
      assert.strictEqual(isLegalPhaseTransition(path[i], path[i + 1]), true, `${path[i]} -> ${path[i + 1]}`);
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
  });

  test('research -> executing (skipping planning/review) is illegal', () => {
    assert.strictEqual(isLegalPhaseTransition('research', 'executing'), false);
  });

  test('completed -> executing is illegal (must replan first)', () => {
    assert.strictEqual(isLegalPhaseTransition('completed', 'executing'), false);
  });

  test('assertLegalPhaseTransition throws IllegalPhaseTransitionError with from/to on illegal jumps', () => {
    assert.throws(
      () => assertLegalPhaseTransition('idle', 'executing'),
      (err: unknown) => {
        assert.ok(err instanceof IllegalPhaseTransitionError);
        assert.strictEqual(err.from, 'idle');
        assert.strictEqual(err.to, 'executing');
        return true;
      }
    );
  });

  test('assertLegalPhaseTransition does not throw on legal jumps', () => {
    assert.doesNotThrow(() => assertLegalPhaseTransition('review', 'executing'));
  });
});
