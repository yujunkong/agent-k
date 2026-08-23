/**
 * SUB-004 — Adapter: SubagentRunner → AgentLoopController.run().
 * Host supplies createLoop with the same provider/tools as parent chat.
 * Workspace isolation: createLoop must bind tool cwd to context.worktree.path
 * (no core→tools import for runWithWorkspaceRoot).
 */

import type { AgentLoopController } from '../loop/AgentLoopController';
import type { AgentMessage } from '../types';
import type {
  SubagentExecutionContext,
  SubagentExecutor,
} from './subagentRunner';

export interface SubagentAgentLoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface SubagentAgentLoopHooks {
  onAssistantDelta?: (text: string) => void | Promise<void>;
  onReasoning?: (text: string) => void | Promise<void>;
  onToolCall?: (
    name: string,
    args: unknown,
    callId?: string
  ) => void | Promise<void>;
  onToolResult?: (
    name: string,
    result: unknown,
    callId?: string
  ) => void | Promise<void>;
  /** First tool_call of the model turn — seal Thought before tools run. */
  onToolCallsBegin?: () => void | Promise<void>;
}

export interface SubagentAgentLoopOptions {
  createLoop: (
    context: SubagentExecutionContext,
    hooks: SubagentAgentLoopHooks
  ) => AgentLoopController;
  systemPrompt: string;
  buildMessages?: (
    context: SubagentExecutionContext
  ) => SubagentAgentLoopMessage[];
  onDelta?: (
    context: SubagentExecutionContext,
    text: string
  ) => void | Promise<void>;
  onReasoning?: (
    context: SubagentExecutionContext,
    text: string
  ) => void | Promise<void>;
  onToolCall?: (
    context: SubagentExecutionContext,
    name: string,
    args: unknown,
    callId?: string
  ) => void | Promise<void>;
  onToolResult?: (
    context: SubagentExecutionContext,
    name: string,
    result: unknown,
    callId?: string
  ) => void | Promise<void>;
  onToolCallsBegin?: (
    context: SubagentExecutionContext
  ) => void | Promise<void>;
}

/**
 * Build an executor that drives one AgentLoopController via run() + AbortSignal.
 */
export function createSubagentAgentLoopExecutor(
  options: SubagentAgentLoopOptions
): SubagentExecutor {
  return async (context) => {
    let answer = '';

    const hooks: SubagentAgentLoopHooks = {
      onAssistantDelta: async (piece) => {
        answer += piece;
        await options.onDelta?.(context, piece);
      },
      onReasoning: async (text) => {
        await options.onReasoning?.(context, text);
      },
      onToolCall: async (name, args, callId) => {
        await options.onToolCall?.(context, name, args, callId);
      },
      onToolResult: async (name, result, callId) => {
        await options.onToolResult?.(context, name, result, callId);
      },
      onToolCallsBegin: async () => {
        await options.onToolCallsBegin?.(context);
      },
    };

    // Comment: SUB-014 — refuse parent cwd; host createLoop must use this path
    if (!context.worktree?.path) {
      throw new Error('Subagent refused: isolated worktree path is required');
    }

    const loop = options.createLoop(context, hooks);
    const prior =
      options.buildMessages?.(context) ??
      ([{ role: 'system', content: options.systemPrompt }] as AgentMessage[]);

    // Comment: v3 loop uses run() + signal (no continue/stop API)
    const result = await loop.run({
      prompt: context.task.prompt,
      signal: context.signal,
      messages: prior as AgentMessage[],
    });

    if (context.signal.aborted || result.reason === 'aborted') {
      const error = new Error('Subagent cancelled');
      error.name = 'AbortError';
      throw error;
    }

    if (!answer.trim()) {
      answer = String(result.content || '');
      if (!answer.trim()) {
        const last = [...loop.getMessages()]
          .reverse()
          .find(
            (message) =>
              message.role === 'assistant' &&
              String(message.content || '').trim()
          );
        answer = String(last?.content || '');
      }
    }

    return answer;
  };
}
