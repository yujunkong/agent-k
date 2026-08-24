/**
 * CTX-011 / ADDON-T04 — task context strategy (ported from
 * v2.1 tests/unit/prefetch/task-context-strategy.test.ts; mocha→vitest).
 */
import { describe, expect, it } from 'vitest';
import {
  inferTaskType,
  selectContextItems,
  CONTEXT_STRATEGIES,
  formatSelectedContext,
} from './taskContextStrategy';

describe('CTX-011 taskContextStrategy', () => {
  it('inferTaskType: debug mode → bug_fix', () => {
    expect(inferTaskType('look at this', 'debug')).toBe('bug_fix');
  });

  it('inferTaskType: bug keywords', () => {
    expect(inferTaskType('fix this TypeError please')).toBe('bug_fix');
  });

  it('inferTaskType: refactor', () => {
    expect(inferTaskType('refactor extract method')).toBe('refactor');
  });

  it('inferTaskType: review', () => {
    expect(inferTaskType('please code review this PR')).toBe('code_review');
  });

  it('inferTaskType: new feature', () => {
    expect(inferTaskType('implement a new feature for login')).toBe('new_feature');
  });

  it('bug_fix strategy requires failing_test/diagnostics/recent_changes', () => {
    const s = CONTEXT_STRATEGIES.bug_fix;
    expect(s.required).toContain('failing_test');
    expect(s.required).toContain('diagnostics');
    expect(s.required).toContain('recent_changes');
  });

  it('refactor strategy requires target+tests+symbols', () => {
    const s = CONTEXT_STRATEGIES.refactor;
    expect(s.required).toContain('target_files');
    expect(s.required).toContain('test_files');
    expect(s.required).toContain('symbols');
  });

  it('selectContextItems drops optional when over budget', () => {
    const bag = {
      failing_test: 'x'.repeat(400),
      error_message: 'err',
      diagnostics: 'diag',
      related_files: 'rel',
      recent_changes: 'chg',
      git_diff: 'y'.repeat(200_000),
      symbols: 'sym',
    };
    const selected = selectContextItems('bug_fix', bag, (t) => Math.ceil(t.length / 4));
    const keys = selected.map((i) => i.key);
    expect(keys).toContain('failing_test');
    expect(keys).toContain('diagnostics');
    expect(keys.includes('git_diff')).toBe(false);
  });

  it('selectContextItems keeps required even if large', () => {
    const bag = {
      target_files: 'a'.repeat(40_000),
      test_files: 'tests',
      symbols: 'sym',
      type_definitions: 'types',
      usage_examples: 'usage',
    };
    const selected = selectContextItems('refactor', bag);
    expect(selected.every((i) => i.required || i.key === 'usage_examples')).toBe(true);
    expect(selected.some((i) => i.key === 'target_files' && i.required)).toBe(true);
  });

  it('formatSelectedContext wraps task_context', () => {
    const items = selectContextItems('general', {
      active_file: 'Active file: foo.ts',
      diagnostics: 'L1: [error] x',
    });
    const text = formatSelectedContext(items, 'general');
    expect(text).toContain('<task_context type="general">');
    expect(text).toContain('active_file');
  });
});
