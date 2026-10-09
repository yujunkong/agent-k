/**
 * V31-TOOL-04 — Reload survival for session todos.
 * The in-memory TodoStore stays the runtime source; this memento is the copy
 * that outlives an extension host restart.
 */
import type { Memento } from 'vscode';
import type { TodoItem } from '@agent-k/tools';
import { todoStore } from './TodoStore';

const KEY = 'agent-k.sessionTodos';

let memento: Memento | undefined;

/** Load every saved session into the store. Safe to call once at activate. */
export function bindTodoPersistence(state: Memento): void {
  memento = state;
  const saved = state.get<Record<string, TodoItem[]>>(KEY);
  if (!saved) return;
  for (const [id, items] of Object.entries(saved)) {
    if (Array.isArray(items)) todoStore.set(id, items);
  }
}

/** Write the current session array back. No-op until bindTodoPersistence. */
export function persistSessionTodos(sessionId: string): void {
  if (!memento || !sessionId) return;
  const saved = { ...(memento.get<Record<string, TodoItem[]>>(KEY) ?? {}) };
  saved[sessionId] = todoStore.get(sessionId);
  void memento.update(KEY, saved);
}
