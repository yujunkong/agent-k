/**
 * V31-TOOL-04 — workspaceState round-trip for session todos.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import type { Memento } from 'vscode';
import type { TodoItem } from '@agent-k/tools';
import { todoStore } from './TodoStore';
import { bindTodoPersistence, persistSessionTodos } from './todoPersistence';

function memoryMemento(initial?: Record<string, TodoItem[]>): Memento {
  const bag = new Map<string, unknown>();
  if (initial) bag.set('agent-k.sessionTodos', initial);
  return {
    keys: () => [...bag.keys()],
    get: <T>(key: string, defaultValue?: T) =>
      (bag.has(key) ? bag.get(key) : defaultValue) as T,
    update: async (key: string, value: unknown) => {
      bag.set(key, value);
    },
  };
}

describe('V31-TOOL-04 todoPersistence', () => {
  const sessionId = 'persist-test-session';

  beforeEach(() => {
    todoStore.clear(sessionId);
  });

  it('hydrates saved todos into the store on bind', () => {
    const saved: TodoItem[] = [
      { id: 't1', content: 'Fix X', status: 'pending' },
    ];
    bindTodoPersistence(memoryMemento({ [sessionId]: saved }));
    expect(todoStore.get(sessionId)).toEqual(saved);
  });

  it('writes the live session array back on persist', async () => {
    const state = memoryMemento();
    bindTodoPersistence(state);
    todoStore.set(sessionId, [
      { id: 't2', content: 'Ship Y', status: 'in_progress' },
    ]);
    persistSessionTodos(sessionId);
    await Promise.resolve();
    const stored = state.get<Record<string, TodoItem[]>>('agent-k.sessionTodos');
    expect(stored?.[sessionId]).toEqual(todoStore.get(sessionId));
  });
});
