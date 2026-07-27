/**
 * ADDON-T03: plan/write gate unit tests
 */
import * as assert from 'assert';
import {
  planWriteGate,
  agentComplexWriteGate,
} from '../../../src/plan/writeGate';

suite('ADDON-T03 writeGate', () => {
  test('plan research blocks edit_file', () => {
    const g = planWriteGate('plan', 'research', 'edit_file');
    assert.strictEqual(g.allowed, false);
    assert.ok(g.error?.includes('build'));
  });

  test('plan build allows write_file', () => {
    const g = planWriteGate('plan', 'build', 'write_file');
    assert.strictEqual(g.allowed, true);
  });

  test('agent mode not blocked by planWriteGate', () => {
    const g = planWriteGate('agent', undefined, 'edit_file');
    assert.strictEqual(g.allowed, true);
  });

  test('ask mode read not affected', () => {
    const g = planWriteGate('ask', undefined, 'read_file');
    assert.strictEqual(g.allowed, true);
  });

  test('agentComplexWriteGate soft-blocks when enabled', () => {
    const g = agentComplexWriteGate({
      mode: 'agent',
      forceOnComplex: true,
      shouldSuggestPlan: true,
      toolName: 'edit_file',
      alreadyWarned: false,
    });
    assert.strictEqual(g.allowed, false);
    assert.strictEqual(g.softBlock, true);
  });

  test('agentComplexWriteGate off when setting false', () => {
    const g = agentComplexWriteGate({
      mode: 'agent',
      forceOnComplex: false,
      shouldSuggestPlan: true,
      toolName: 'edit_file',
      alreadyWarned: false,
    });
    assert.strictEqual(g.allowed, true);
  });
});
