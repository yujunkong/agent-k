/**
 * TOOL-013 SkillTool — invoke skill by id → stub result (SKILL-* core later).
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export interface SkillStubResult {
  kind: 'skill_result';
  skillId: string;
  status: 'stub';
  message: string;
  args?: Record<string, unknown>;
}

export const skillTool: ToolDefinition = {
  name: 'skill',
  description: 'Invoke a named skill by id. Returns a stub until SKILL-* is wired.',
  inputSchema: {
    type: 'object',
    properties: {
      skillId: { type: 'string', description: 'Skill identifier' },
      id: { type: 'string', description: 'Alias for skillId' },
      args: { type: 'object', description: 'Optional skill arguments' },
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string' },
      skillId: { type: 'string' },
      status: { type: 'string' },
    },
  },
  permissionHint: 'none',
  timeoutMs: 10_000,
  cancelSupported: true,
  timelineEventType: 'task',
  modeAllowlist: ['agent', 'debug', 'plan', 'ask'],
  category: 'orchestration',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const skillId = String(input.skillId ?? input.id ?? '').trim();
      if (!skillId) {
        return { success: false, error: 'skill requires skillId' };
      }
      const result: SkillStubResult = {
        kind: 'skill_result',
        skillId,
        status: 'stub',
        message: `Skill "${skillId}" stub — not executed (SKILL-* pending).`,
        args:
          input.args && typeof input.args === 'object'
            ? (input.args as Record<string, unknown>)
            : undefined,
      };
      return { success: true, data: result };
    });
  },
};
