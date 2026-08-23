/**
 * switch_mode — schema-visible; UI/host owns real mode changes.
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export const switchModeTool: ToolDefinition = {
  name: 'switch_mode',
  description:
    'Request a mode switch (ask|agent|plan|debug). Prefer the UI mode picker; Plan/Debug may reject self-escalation.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        description: 'Target mode: ask | agent | plan | debug',
      },
    },
    required: ['mode'],
  },
  permissionHint: 'session',
  timeoutMs: 5_000,
  cancelSupported: false,
  timelineEventType: 'session',
  modeAllowlist: ['agent'],
  category: 'session',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const target = String(input.mode ?? '').trim().toLowerCase();
      if (!['ask', 'agent', 'plan', 'debug'].includes(target)) {
        return {
          success: false,
          error: `Invalid mode: "${target}". Valid: ask, agent, plan, debug`,
        };
      }
      if (ctx.switchMode) {
        const data = await ctx.switchMode(target);
        return { success: true, data };
      }
      return {
        success: false,
        error:
          'switch_mode is not available on this host path — use the UI mode selector.',
      };
    });
  },
};
