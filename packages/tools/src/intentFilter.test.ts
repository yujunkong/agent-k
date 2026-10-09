/**
 * V31-INTENT-01 — ToolRegistry schema filter by intentKind.
 */

import { describe, expect, it } from 'vitest';
import { ToolRegistry } from './ToolRegistry';
import { registerBuiltinTools } from './registerBuiltinTools';

function names(registry: ToolRegistry, intentKind?: 'conversation' | 'question' | 'task') {
  return registry
    .getSchemas('agent', { intentKind, harnessEnabled: false })
    .map((s) => s.function.name);
}

describe('V31-INTENT-01 intentKind schema filter', () => {
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);

  it('conversation → zero tool schemas', () => {
    expect(names(registry, 'conversation')).toEqual([]);
  });

  it('question → hides edit/terminal/write tools', () => {
    const list = names(registry, 'question');
    expect(list.length).toBeGreaterThan(0);
    expect(list).not.toContain('edit_file');
    expect(list).not.toContain('write_file');
    expect(list).not.toContain('run_terminal_cmd');
    expect(list).toContain('read_file');
  });

  it('task / undefined → write tools remain available', () => {
    expect(names(registry, 'task')).toContain('edit_file');
    expect(names(registry)).toContain('edit_file');
  });
});
