/**
 * Debug write gate — product edits hard-blocked until Confirm & Fix
 */
import * as assert from 'assert';
import {
  debugWriteGate,
  isDebugToolAllowedForStage,
} from '../../../src/debug/writeGate';

suite('debugWriteGate', () => {
  test('analyze blocks edit_file', () => {
    const g = debugWriteGate('analyze', 'edit_file');
    assert.strictEqual(g.allowed, false);
    assert.ok(g.error?.includes('Confirm & Fix'));
  });

  test('hypothesis blocks write_file and delete_file', () => {
    assert.strictEqual(debugWriteGate('hypothesis', 'write_file').allowed, false);
    assert.strictEqual(debugWriteGate('hypothesis', 'delete_file').allowed, false);
  });

  test('fix allows edit_file', () => {
    assert.strictEqual(debugWriteGate('fix', 'edit_file').allowed, true);
  });

  test('cleanup allows remove_instrumentation', () => {
    assert.strictEqual(debugWriteGate('cleanup', 'remove_instrumentation').allowed, true);
  });

  test('fix allows remove_instrumentation', () => {
    assert.strictEqual(debugWriteGate('fix', 'remove_instrumentation').allowed, true);
  });

  test('hypothesis blocks remove_instrumentation', () => {
    const g = debugWriteGate('hypothesis', 'remove_instrumentation');
    assert.strictEqual(g.allowed, false);
    assert.ok(g.error?.includes('fix/cleanup'));
  });

  test('hypothesis allows ask_question and add_instrumentation', () => {
    assert.strictEqual(debugWriteGate('hypothesis', 'ask_question').allowed, true);
    assert.strictEqual(debugWriteGate('hypothesis', 'add_instrumentation').allowed, true);
  });

  test('analyze allows collect_runtime_logs, terminal, mcp', () => {
    assert.strictEqual(debugWriteGate('analyze', 'collect_runtime_logs').allowed, true);
    assert.strictEqual(debugWriteGate('analyze', 'run_terminal_cmd').allowed, true);
    assert.strictEqual(debugWriteGate('analyze', 'mcp_searxng_web_search').allowed, true);
  });

  test('instrument allows request_reproduce and reads', () => {
    assert.strictEqual(debugWriteGate('instrument', 'request_reproduce').allowed, true);
    assert.strictEqual(debugWriteGate('instrument', 'read_file').allowed, true);
    assert.strictEqual(debugWriteGate('instrument', 'read_files').allowed, true);
  });

  test('isDebugToolAllowedForStage mirrors gate', () => {
    assert.strictEqual(isDebugToolAllowedForStage('analyze', 'edit_file'), false);
    assert.strictEqual(isDebugToolAllowedForStage('fix', 'edit_file'), true);
    assert.strictEqual(isDebugToolAllowedForStage('hypothesis', 'ask_question'), true);
  });
});
