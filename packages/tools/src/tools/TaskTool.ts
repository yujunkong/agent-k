/**
 * TOOL-012 TaskTool — create subagent task descriptor (no real spawn).
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export interface SubAgentTaskDescriptor {
  kind: 'subagent_task';
  taskId: string;
  prompt: string;
  description?: string;
  model?: string;
  /** Stub only — host/core owns real spawn. */
  status: 'pending';
}

let taskCounter = 0;

export const taskTool: ToolDefinition = {
  name: 'task',
  description:
    'Create a subagent task descriptor. Does not spawn a real agent (host/core wiring).',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Task prompt for the subagent' },
      description: { type: 'string', description: 'Short title' },
      model: { type: 'string', description: 'Optional model hint' },
    },
    required: ['prompt'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string' },
      taskId: { type: 'string' },
      status: { type: 'string' },
    },
  },
  permissionHint: 'session',
  timeoutMs: 5_000,
  cancelSupported: true,
  timelineEventType: 'task',
  modeAllowlist: ['agent', 'debug', 'plan'],
  category: 'orchestration',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const prompt = String(input.prompt ?? '').trim();
      if (!prompt) {
        return { success: false, error: 'task requires prompt' };
      }
      taskCounter += 1;
      const descriptor: SubAgentTaskDescriptor = {
        kind: 'subagent_task',
        taskId: `task_${taskCounter}_${Date.now()}`,
        prompt,
        description: input.description ? String(input.description) : undefined,
        model: input.model ? String(input.model) : undefined,
        status: 'pending',
      };
      return { success: true, data: descriptor };
    });
  },
};
