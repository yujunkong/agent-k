/**
 * TodoWriteTool - Plan/Agent 모드 TODO 생성/동기화 (C5-T23)
 */
import type { ToolInput, ToolOutput } from '../types';

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  source: 'plan' | 'agent';
  planSlug?: string;
  stepIndex?: number;
  createdAt: number;
}

export class TodoWriteTool {
  private todos: TodoItem[] = [];
  private onChange: ((todos: TodoItem[]) => void) | null = null;

  onChangeCallback(cb: (todos: TodoItem[]) => void): void {
    this.onChange = cb;
  }

  /**
   * AgentLoop / host tool dispatch entry.
 * Accepts both Agent-K schema `{ action, text }` and `{ todos: [...] }`.
   */
  execute(args: ToolInput): ToolOutput {
    try {
      const raw = args as Record<string, unknown>;

      if (Array.isArray(raw.todos)) {
        const created: TodoItem[] = [];
        for (const item of raw.todos as Array<Record<string, unknown>>) {
          const text = String(item.content ?? item.text ?? '').trim();
          if (!text) continue;
          const status = String(item.status ?? 'pending');
          if (status === 'completed' || status === 'cancelled') {
            const existing = this.todos.find((t) => t.text === text || t.id === item.id);
            if (existing) {
              existing.completed = status === 'completed';
              this.notify();
            } else {
              const t = this.create(text, 'agent');
              t.completed = status === 'completed';
              created.push(t);
            }
          } else {
            created.push(this.create(text, 'agent'));
          }
        }
        return {
          success: true,
          data: {
            message: `Updated ${created.length || (raw.todos as unknown[]).length} todo(s)`,
            todos: this.getActiveTodos().map((t) => ({
              id: t.id,
              text: t.text,
              completed: t.completed
            }))
          }
        };
      }

      const action = String(raw.action || 'add').toLowerCase();
      const text = String(raw.text ?? raw.content ?? '').trim();
      const id = raw.id != null ? String(raw.id) : undefined;

      if (action === 'complete' || String(raw.status || '') === 'completed') {
        if (id && this.complete(id)) {
          return { success: true, data: { message: `Completed todo ${id}`, id } };
        }
        if (text) {
          const hit = this.todos.find((t) => t.text === text || t.text.includes(text));
          if (hit && this.complete(hit.id)) {
            return { success: true, data: { message: 'Completed todo', id: hit.id } };
          }
          const t = this.create(text, 'agent');
          t.completed = true;
          this.notify();
          return { success: true, data: { message: 'Recorded completed todo', id: t.id } };
        }
        return { success: false, error: 'todo_write complete requires id or text' };
      }

      if (action === 'update' && id) {
        const hit = this.todos.find((t) => t.id === id);
        if (!hit) return { success: false, error: `Todo not found: ${id}` };
        if (text) hit.text = text;
        if (String(raw.status || '') === 'completed') hit.completed = true;
        this.notify();
        return { success: true, data: { message: 'Updated todo', id: hit.id, text: hit.text } };
      }

      const planText =
        text || (typeof raw.plan === 'string' ? String(raw.plan) : '');
      if (!planText) {
        return {
          success: false,
          error: 'todo_write requires text, content, or todos[]'
        };
      }
      const lines = planText
        .split(/\n/)
        .map((l) => l.replace(/^[-*\[\]\sx]+/i, '').trim())
        .filter((l) => l.length > 2);
      const items = (lines.length > 1 ? lines : [planText]).map((l) =>
        this.create(l, 'agent')
      );
      return {
        success: true,
        data: {
          message: `Added ${items.length} todo(s)`,
          todos: items.map((t) => ({ id: t.id, text: t.text, completed: t.completed }))
        }
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }

  create(text: string, source: 'plan' | 'agent', planSlug?: string, stepIndex?: number): TodoItem {
    const todo: TodoItem = {
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      completed: false,
      source,
      planSlug,
      stepIndex,
      createdAt: Date.now()
    };
    this.todos.push(todo);
    this.notify();
    return todo;
  }

  complete(todoId: string): boolean {
    const todo = this.todos.find((t) => t.id === todoId);
    if (!todo) return false;
    todo.completed = true;
    this.notify();
    return true;
  }

  getActiveTodos(): TodoItem[] {
    return this.todos.filter((t) => !t.completed);
  }

  getPlanTodos(planSlug: string): TodoItem[] {
    return this.todos.filter((t) => t.planSlug === planSlug);
  }

  getPlanProgress(planSlug: string): { total: number; completed: number; active: number } {
    const planTodos = this.getPlanTodos(planSlug);
    return {
      total: planTodos.length,
      completed: planTodos.filter((t) => t.completed).length,
      active: planTodos.filter((t) => !t.completed).length
    };
  }

  syncFromPlan(planSlug: string, todoTexts: string[]): void {
    this.todos = this.todos.filter(
      (t) => t.planSlug !== planSlug || (t.planSlug === planSlug && t.completed)
    );
    todoTexts.forEach((text, i) => {
      const exists = this.todos.some((t) => t.planSlug === planSlug && t.stepIndex === i);
      if (!exists) {
        this.create(text, 'plan', planSlug, i);
      }
    });
    this.notify();
  }

  buildContextBlock(planSlug: string): string {
    const progress = this.getPlanProgress(planSlug);
    const active = this.getPlanTodos(planSlug).filter((t) => !t.completed);
    if (active.length === 0 && progress.total === 0) return '';
    return [
      `### TODO Progress (${planSlug})`,
      ``,
      `**${progress.completed}/${progress.total}** steps completed`,
      ``,
      ...active.map((t) => `- [ ] ${t.text}`),
      ...this.getPlanTodos(planSlug)
        .filter((t) => t.completed)
        .map((t) => `- [x] ~~${t.text}~~`)
    ].join('\n');
  }

  private notify(): void {
    this.onChange?.([...this.todos]);
  }
}

export const todoWriteTool = new TodoWriteTool();
