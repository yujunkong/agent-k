/**
 * Optional Plan tool — advance planning → review after the plan document.
 * Research/questions stay UI + ask_question driven (no per-stage tool gates).
 */
import type { ToolDefinition } from '../agent/types';
import { toolRegistry } from './registry';

export const planNextStageTool: ToolDefinition = {
  name: 'plan_next_stage',
  description:
    'Plan mode (optional): after you have written the FULL plan markdown with - [ ] TODOs, call once to mark Review. The UI usually promotes automatically — use this only if Review did not open. Do not call during research/questions.',
  parameters: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        enum: ['review'],
        description: 'Must be "review"',
        optional: true
      },
      note: {
        type: 'string',
        description: 'Optional short note',
        optional: true
      }
    },
    required: []
  },
  modeAllowlist: ['plan'],
  category: 'session'
};

export function registerPlanStageTools(): void {
  toolRegistry.registerTool(planNextStageTool);
}
