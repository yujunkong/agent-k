/**
 * TOOL-011 TodoWriteTool — in-memory todo list (mutates ctx.todoStore).
 */

import type { TodoItem, ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export const todoWriteTool: ToolDefinition = {
  name: 'todo_write',
  description: 'Create or update an in-memory session todo list.',
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'cancelled'],
            },
          },
          required: ['content', 'status'],
        },
      },
      merge: {
        type: 'boolean',
        description: 'If true, merge by id into existing store; else replace',
      },
    },
    required: ['todos'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      todos: { type: 'array' },
      count: { type: 'number' },
    },
  },
  permissionHint: 'session',
  timeoutMs: 5_000,
  cancelSupported: true,
  timelineEventType: 'session',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'session',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const incoming = (input.todos as TodoItem[] | undefined) ?? [];
      if (!Array.isArray(incoming) || incoming.length === 0) {
        return { success: false, error: 'todo_write requires todos array' };
      }

      const normalized: TodoItem[] = incoming.map((t, i) => ({
        id: t.id || `todo_${i + 1}`,
        content: String(t.content),
        status: t.status,
      }));

      if (!ctx.todoStore) {
        ctx.todoStore = [];
      }

      if (input.merge) {
        const byId = new Map(ctx.todoStore.map((t) => [t.id, t]));
        for (const t of normalized) {
          byId.set(t.id, t);
        }
        ctx.todoStore.splice(0, ctx.todoStore.length, ...byId.values());
      } else {
        ctx.todoStore.splice(0, ctx.todoStore.length, ...normalized);
      }

      return {
        success: true,
        data: {
          todos: [...ctx.todoStore],
          count: ctx.todoStore.length,
        },
      };
    });
  },
};
