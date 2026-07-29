/**
 * Plan write gate + ask_question schema visibility
 */
import * as assert from 'assert';
import {
  planWriteGate,
  planPostQuestionsGate,
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

suite('planPostQuestionsGate', () => {
  test('planning blocks explore and ask_question', () => {
    assert.strictEqual(
      planPostQuestionsGate('plan', 'planning', 'read_file').allowed,
      false
    );
    assert.strictEqual(
      planPostQuestionsGate('plan', 'planning', 'ask_question').allowed,
      false
    );
    assert.strictEqual(
      planPostQuestionsGate('plan', 'planning', 'todo_write').allowed,
      true
    );
  });

  test('questions stage blocks re-explore and re-ask', () => {
    assert.strictEqual(
      planPostQuestionsGate('plan', 'questions', 'grep').allowed,
      false
    );
    assert.strictEqual(
      planPostQuestionsGate('plan', 'questions', 'ask_question').allowed,
      false
    );
  });

  test('research allows explore until ask_question fired', () => {
    assert.strictEqual(
      planPostQuestionsGate('plan', 'research', 'read_file').allowed,
      true
    );
    assert.strictEqual(
      planPostQuestionsGate('plan', 'research', 'read_file', {
        askedQuestionThisRun: true
      }).allowed,
      false
    );
  });
});

suite('Plan tool schemas after questions', () => {
  test('planning hides explore + ask_question; research keeps them', () => {
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
    const todo: ToolDefinition = {
      name: 'todo_write',
      description: 'Todo',
      parameters: { type: 'object', properties: {} },
      modeAllowlist: ['plan', 'agent', 'ask', 'debug'],
      category: 'session'
    };
    reg.registerTool(ask);
    reg.registerTool(read);
    reg.registerTool(todo);

    const research = reg.getSchemas('plan', 'B', { planStage: 'research' });
    assert.ok(research.some((s) => s?.function?.name === 'ask_question'));
    assert.ok(research.some((s) => s?.function?.name === 'read_file'));

    const planning = reg.getSchemas('plan', 'B', { planStage: 'planning' });
    assert.ok(!planning.some((s) => s?.function?.name === 'ask_question'));
    assert.ok(!planning.some((s) => s?.function?.name === 'read_file'));
    assert.ok(planning.some((s) => s?.function?.name === 'todo_write'));
  });
});
