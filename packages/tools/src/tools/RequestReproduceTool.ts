/**
 * Debug FSM — request_reproduce (user confirmation prompt payload).
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export const requestReproduceTool: ToolDefinition = {
  name: 'request_reproduce',
  description:
    'Ask the user to reproduce the bug and wait for confirmation (debug FSM).',
  inputSchema: {
    type: 'object',
    properties: {
      steps: { type: 'string', description: 'Reproduction steps to show' },
      hypothesisId: { type: 'string' },
    },
    required: [],
  },
  permissionHint: 'session',
  timeoutMs: 5_000,
  cancelSupported: false,
  timelineEventType: 'asking',
  modeAllowlist: ['debug', 'agent'],
  category: 'debug',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const steps = String(input.steps ?? '').trim();
      return {
        success: true,
        data: {
          status: 'awaiting_user',
          steps: steps || 'Please reproduce the issue and confirm in the UI.',
          hypothesisId: input.hypothesisId
            ? String(input.hypothesisId)
            : undefined,
          note: 'Host/UI should present a reproduce confirmation card.',
        },
      };
    });
  },
};
