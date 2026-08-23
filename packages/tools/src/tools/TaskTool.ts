/**
 * TOOL-012 TaskTool — subagent task args (host spawns via createSubagentHost).
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export interface SubAgentTaskDescriptor {
  kind: 'subagent_task';
  taskId: string;
  prompt: string;
  description?: string;
  model?: string;
  /** Host intercepts task/task_run before this runs. */
  status: 'pending' | 'completed' | 'error' | 'cancelled';
}

let taskCounter = 0;

export const taskTool: ToolDefinition = {
  name: 'task',
  description:
    'Spawn a subagent for a focused task (isolated worktree). Prefer short description (3–5 words).',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Detailed task prompt for the subagent',
      },
      description: {
        type: 'string',
        description: 'Short (3-5 words) title shown in the parent timeline',
      },
      type: {
        type: 'string',
        description:
          'Subagent role: search|explore|general|debug|coding|review',
      },
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
  timeoutMs: 300_000,
  cancelSupported: true,
  timelineEventType: 'task',
  modeAllowlist: ['agent', 'debug', 'plan'],
  category: 'orchestration',
  async execute(input, ctx): Promise<ToolResult> {
    // Comment: host chatSend intercepts task/task_run before this runs
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
        description: input.description
          ? String(input.description)
          : undefined,
        model: input.model ? String(input.model) : undefined,
        status: 'pending',
      };
      return { success: true, data: descriptor };
    });
  },
};
