/**
 * Plan stage advance — optional tool after the plan document is ready.
 */
import * as assert from 'assert';
import { resolvePlanAdvance } from '../../../src/plan/planStageFsm';

suite('planStageFsm (planning → review only)', () => {
  test('allows planning → review', () => {
    const r = resolvePlanAdvance('planning', 'review');
    assert.deepStrictEqual(r, { ok: true, stage: 'review' });
  });

  test('defaults planning → review when to omitted', () => {
    const r = resolvePlanAdvance('planning');
    assert.deepStrictEqual(r, { ok: true, stage: 'review' });
  });

  test('rejects research → questions', () => {
    const r = resolvePlanAdvance('research', 'review');
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.match(r.error, /only for after the plan/i);
  });

  test('rejects questions → review', () => {
    const r = resolvePlanAdvance('questions');
    assert.strictEqual(r.ok, false);
  });

  test('rejects from review', () => {
    const r = resolvePlanAdvance('review');
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.match(r.error, /Confirm/);
  });
});
