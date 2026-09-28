/**
 * V31-INTENT-01 — ToolRegistry intent filter tests.
 */

import { describe, expect, it } from 'vitest';
import { ToolRegistry } from './ToolRegistry';
import { registerBuiltinTools } from './registerBuiltinTools';

const WRITE_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'delete_file',
  'todo_write',
]);

function names(registry: ToolRegistry, opts?: Parameters<ToolRegistry['getSchemas']>[1]) {
  return registry
    .getSchemas('agent', opts)
    .map((s) => s.function.name);
}

describe('V31-INTENT-01 ToolRegistry intent filter', () => {
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);

  it('conversation intent exposes zero tool schemas', () => {
    expect(names(registry, { intentKind: 'conversation' })).toHaveLength(0);
    expect(registry.listForMode('agent', { intentKind: 'conversation' })).toHaveLength(0);
  });

  it('question intent keeps read tools but hides edit/terminal/write/debug', () => {
    const questionNames = names(registry, { intentKind: 'question' });

    expect(questionNames).toContain('read_file');
    expect(questionNames).toContain('read_files');
    expect(questionNames).toContain('list_dir');
    expect(questionNames).toContain('grep');
    expect(questionNames).toContain('glob');
    expect(questionNames).toContain('codebase_search');

    expect(questionNames).not.toContain('write_file');
    expect(questionNames).not.toContain('edit_file');
    expect(questionNames).not.toContain('delete_file');
    expect(questionNames).not.toContain('todo_write');
    expect(questionNames).not.toContain('run_terminal_cmd');
    expect(questionNames).not.toContain('terminal_output');
    expect(questionNames).not.toContain('process_list');
    expect(questionNames).not.toContain('add_instrumentation');
    expect(questionNames).not.toContain('request_reproduce');

    for (const tool of registry.listForMode('agent', { intentKind: 'question' })) {
      expect(tool.category).not.toBe('edit');
      expect(tool.category).not.toBe('terminal');
      expect(tool.category).not.toBe('debug');
      expect(WRITE_TOOL_NAMES.has(tool.name)).toBe(false);
    }
  });

  it('task / undefined intent leaves the mode filter unchanged', () => {
    const baseline = names(registry);
    expect(names(registry, { intentKind: 'task' })).toEqual(baseline);
    expect(names(registry, { intentKind: undefined })).toEqual(baseline);
    expect(baseline).toContain('write_file');
    expect(baseline).toContain('run_terminal_cmd');
  });
});
