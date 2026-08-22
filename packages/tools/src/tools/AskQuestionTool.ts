/**
 * TOOL-007 AskQuestionTool — returns structured question payload (no UI).
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export interface AskQuestionPayload {
  kind: 'ask_question';
  questions: Array<{
    id: string;
    prompt: string;
    options?: string[];
    allowMultiple?: boolean;
  }>;
}

export const askQuestionTool: ToolDefinition = {
  name: 'ask_question',
  description:
    'Ask the user one or more clarifying questions. Returns structured payload for the host UI.',
  inputSchema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            prompt: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            allowMultiple: { type: 'boolean' },
          },
          required: ['prompt'],
        },
      },
      prompt: { type: 'string', description: 'Single question shorthand' },
      options: { type: 'array', items: { type: 'string' } },
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string' },
      questions: { type: 'array' },
    },
  },
  permissionHint: 'session',
  timeoutMs: 5_000,
  cancelSupported: true,
  timelineEventType: 'asking',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'session',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      let questions = (input.questions as AskQuestionPayload['questions']) ?? [];
      if ((!questions || questions.length === 0) && input.prompt) {
        questions = [
          {
            id: 'q1',
            prompt: String(input.prompt),
            options: Array.isArray(input.options)
              ? (input.options as string[])
              : undefined,
          },
        ];
      }
      if (!questions.length) {
        return { success: false, error: 'ask_question requires questions or prompt' };
      }

      const normalized = questions.map((q, i) => ({
        id: q.id || `q${i + 1}`,
        prompt: String(q.prompt),
        options: q.options,
        allowMultiple: q.allowMultiple,
      }));

      const payload: AskQuestionPayload = {
        kind: 'ask_question',
        questions: normalized,
      };

      return { success: true, data: payload };
    });
  },
};
