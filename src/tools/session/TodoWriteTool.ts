/**
 * TodoWriteTool - Plan/Agent 모드 TODO 생성/동기화 (C5-T23)
 */
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
   * Create a new TODO item (from Plan or Agent mode)
   */
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

  /**
   * Mark a TODO as completed
   */
  complete(todoId: string): boolean {
    const todo = this.todos.find(t => t.id === todoId);
    if (!todo) return false;
    todo.completed = true;
    this.notify();
    return true;
  }

  /**
   * Get all active (incomplete) TODOs
   */
  getActiveTodos(): TodoItem[] {
    return this.todos.filter(t => !t.completed);
  }

  /**
   * Get all TODOs for a specific plan
   */
  getPlanTodos(planSlug: string): TodoItem[] {
    return this.todos.filter(t => t.planSlug === planSlug);
  }

  /**
   * Get TODO progress for a plan
   */
  getPlanProgress(planSlug: string): { total: number; completed: number; active: number } {
    const planTodos = this.getPlanTodos(planSlug);
    return {
      total: planTodos.length,
      completed: planTodos.filter(t => t.completed).length,
      active: planTodos.filter(t => !t.completed).length
    };
  }

  /**
   * Sync TODOs from a plan document
   */
  syncFromPlan(planSlug: string, todoTexts: string[]): void {
    // Remove old plan TODOs that are no longer in the plan
    this.todos = this.todos.filter(t => 
      t.planSlug !== planSlug || (t.planSlug === planSlug && t.completed)
    );

    // Add new TODOs
    todoTexts.forEach((text, i) => {
      const exists = this.todos.some(t => t.planSlug === planSlug && t.stepIndex === i);
      if (!exists) {
        this.create(text, 'plan', planSlug, i);
      }
    });
    this.notify();
  }

  /**
   * Build a progress block for context injection
   */
  buildContextBlock(planSlug: string): string {
    const progress = this.getPlanProgress(planSlug);
    const active = this.getPlanTodos(planSlug).filter(t => !t.completed);

    if (active.length === 0 && progress.total === 0) return '';

    return [
      `### TODO Progress (${planSlug})`,
      ``,
      `**${progress.completed}/${progress.total}** steps completed`,
      ``,
      ...active.map(t => `- [ ] ${t.text}`),
      ...this.getPlanTodos(planSlug).filter(t => t.completed).map(t => `- [x] ~~${t.text}~~`)
    ].join('\n');
  }

  private notify(): void {
    this.onChange?.([...this.todos]);
  }
}

export const todoWriteTool = new TodoWriteTool();
