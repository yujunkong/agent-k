/**
 * V31-TOOL-04 — Session-scoped todo persistence (ISSUE-10).
 *
 * TodoWriteTool mutates `ctx.todoStore`; the host owns the per-session array
 * so todos survive turns and compaction. `format()` feeds the loop's
 * `todoContextProvider` sticky context.
 *
 * Pure host logic — no vscode import.
 */

import type { TodoItem } from '@agent-k/tools';

export class TodoStore {
  private readonly bySession = new Map<string, TodoItem[]>();

  /** Create [] on first use and return the SAME array reference. */
  ensure(sessionId: string): TodoItem[] {
    let todos = this.bySession.get(sessionId);
    if (!todos) {
      todos = [];
      this.bySession.set(sessionId, todos);
    }
    return todos;
  }

  get(sessionId: string): TodoItem[] {
    return this.bySession.get(sessionId) ?? [];
  }

  set(sessionId: string, todos: TodoItem[]): void {
    this.bySession.set(sessionId, todos);
  }

  clear(sessionId: string): void {
    this.bySession.delete(sessionId);
  }

  /** Model-facing context block; '' when empty. */
  format(sessionId: string): string {
    const todos = this.bySession.get(sessionId);
    if (!todos?.length) return '';
    const lines = todos.map((t) => `- [${t.status}] ${t.content}`);
    return `## Session todos\n${lines.join('\n')}`;
  }
}

/** Shared singleton for extension wiring (tests may use fresh instances). */
export const todoStore = new TodoStore();
