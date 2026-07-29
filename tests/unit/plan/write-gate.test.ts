/**
 * Plan write gate + ask_question schema visibility
 */
import * as assert from 'assert';
import {
  planWriteGate,
  agentComplexWriteGate,
} from '../../../src/plan/writeGate';
import { ToolRegistry } from '../../../src/tools/registry';
import type { ToolDefinition } from '../../../src/agent/types';

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

suite('Plan ask_question available across stages', () => {
  test('getSchemas keeps ask_question in planning/review', () => {
    const reg = new ToolRegistry();
    const ask: ToolDefinition = {
      name: 'ask_question',
      description: 'Ask',
      parameters: { type: 'object', properties: {} },
      modeAllowlist: ['plan', 'agent', 'ask', 'debug'],
      category: 'session'
    };
    const read: ToolDefinition = {
      name: 'read_file',
      description: 'Read',
      parameters: { type: 'object', properties: {} },
      modeAllowlist: ['plan', 'agent', 'ask', 'debug'],
      category: 'search'
    };
    reg.registerTool(ask);
    reg.registerTool(read);

    for (const stage of ['research', 'questions', 'planning', 'review'] as const) {
      const schemas = reg.getSchemas('plan', 'B', { planStage: stage });
      assert.ok(
        schemas.some((s) => s?.function?.name === 'ask_question'),
        `ask_question missing for stage=${stage}`
      );
    }
  });
});
