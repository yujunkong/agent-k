/**
 * V31-TOOL-04 — TodoStore tests.
 */

import { describe, expect, it } from 'vitest';
import { TodoStore } from './TodoStore';

describe('V31-TOOL-04 TodoStore', () => {
  it('ensure returns the same array reference on repeated calls', () => {
    const store = new TodoStore();
    const first = store.ensure('s1');
    const second = store.ensure('s1');
    expect(first).toBe(second);
    expect(first).toEqual([]);
  });

  it('set / get round-trips per session', () => {
    const store = new TodoStore();
    const todos = [
      { id: 't1', content: 'Fix X', status: 'in_progress' as const },
    ];
    store.set('s1', todos);
    expect(store.get('s1')).toBe(todos);
    expect(store.get('s2')).toEqual([]);
  });

  it('format returns empty string when no todos', () => {
    const store = new TodoStore();
    expect(store.format('missing')).toBe('');
    store.ensure('s1');
    expect(store.format('s1')).toBe('');
  });

  it('format renders statuses as a context block', () => {
    const store = new TodoStore();
    store.set('s1', [
      { id: 't1', content: 'Fix X', status: 'in_progress' },
      { id: 't2', content: 'Ship Y', status: 'pending' },
      { id: 't3', content: 'Done Z', status: 'completed' },
    ]);
    expect(store.format('s1')).toBe(
      '## Session todos\n- [in_progress] Fix X\n- [pending] Ship Y\n- [completed] Done Z',
    );
  });

  it('clear removes the session entry', () => {
    const store = new TodoStore();
    store.set('s1', [{ id: 't1', content: 'Fix X', status: 'pending' }]);
    store.clear('s1');
    expect(store.get('s1')).toEqual([]);
    expect(store.format('s1')).toBe('');
  });
});
