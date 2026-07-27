/**
 * ADDON-T04: task-type context strategy unit tests
 */
import * as assert from 'assert';
import {
  inferTaskType,
  selectContextItems,
  CONTEXT_STRATEGIES,
  formatSelectedContext,
} from '../../../src/prefetch/taskContextStrategy';

suite('ADDON-T04 taskContextStrategy', () => {
  test('inferTaskType: debug mode → bug_fix', () => {
    assert.strictEqual(inferTaskType('look at this', 'debug'), 'bug_fix');
  });

  test('inferTaskType: bug keywords', () => {
    assert.strictEqual(inferTaskType('fix this TypeError please'), 'bug_fix');
  });

  test('inferTaskType: refactor', () => {
    assert.strictEqual(inferTaskType('refactor extract method'), 'refactor');
  });

  test('inferTaskType: review', () => {
    assert.strictEqual(inferTaskType('please code review this PR'), 'code_review');
  });

  test('inferTaskType: new feature', () => {
    assert.strictEqual(inferTaskType('implement a new feature for login'), 'new_feature');
  });

  test('bug_fix strategy requires failing_test/diagnostics/recent_changes', () => {
    const s = CONTEXT_STRATEGIES.bug_fix;
    assert.ok(s.required.includes('failing_test'));
    assert.ok(s.required.includes('diagnostics'));
    assert.ok(s.required.includes('recent_changes'));
  });

  test('refactor strategy requires target+tests+symbols', () => {
    const s = CONTEXT_STRATEGIES.refactor;
    assert.ok(s.required.includes('target_files'));
    assert.ok(s.required.includes('test_files'));
    assert.ok(s.required.includes('symbols'));
  });

  test('selectContextItems drops optional when over budget', () => {
    const bag = {
      failing_test: 'x'.repeat(400), // ~100 tokens
      error_message: 'err',
      diagnostics: 'diag',
      related_files: 'rel',
      recent_changes: 'chg',
      git_diff: 'y'.repeat(200_000), // huge optional
      symbols: 'sym',
    };
    const selected = selectContextItems('bug_fix', bag, (t) => Math.ceil(t.length / 4));
    const keys = selected.map((i) => i.key);
    assert.ok(keys.includes('failing_test'));
    assert.ok(keys.includes('diagnostics'));
    assert.ok(!keys.includes('git_diff'), 'optional git_diff should be dropped');
  });

  test('selectContextItems keeps required even if large', () => {
    const bag = {
      target_files: 'a'.repeat(40_000),
      test_files: 'tests',
      symbols: 'sym',
      type_definitions: 'types',
      usage_examples: 'usage',
    };
    const selected = selectContextItems('refactor', bag);
    assert.ok(selected.every((i) => i.required || i.key === 'usage_examples'));
    assert.ok(selected.some((i) => i.key === 'target_files' && i.required));
  });

  test('formatSelectedContext wraps task_context', () => {
    const items = selectContextItems('general', {
      active_file: 'Active file: foo.ts',
      diagnostics: 'L1: [error] x',
    });
    const text = formatSelectedContext(items, 'general');
    assert.ok(text.includes('<task_context type="general">'));
    assert.ok(text.includes('active_file'));
  });
});
