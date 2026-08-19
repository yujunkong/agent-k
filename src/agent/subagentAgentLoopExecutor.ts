import type { AgentLoopController } from '../loop/AgentLoopController';
import type { SubagentExecutionContext, SubagentExecutor } from './subagentRunner';

export interface SubagentAgentLoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface SubagentAgentLoopHooks {
  onAssistantDelta?: (text: string) => void | Promise<void>;
  onReasoning?: (text: string) => void | Promise<void>;
  onToolCall?: (name: string, args: unknown, callId?: string) => void | Promise<void>;
  onToolResult?: (name: string, result: unknown, callId?: string) => void | Promise<void>;
}

export interface SubagentAgentLoopOptions {
  /**
   * Build the real AgentLoopController using the same provider/tool/runtime
   * configuration as the normal host chat path. Hooks are passed into the
   * constructor rather than mutating loop internals after construction.
   */
  createLoop: (
    context: SubagentExecutionContext,
    hooks: SubagentAgentLoopHooks
  ) => AgentLoopController;
  systemPrompt: string;
  buildMessages?: (context: SubagentExecutionContext) => SubagentAgentLoopMessage[];
  onDelta?: (context: SubagentExecutionContext, text: string) => void | Promise<void>;
  onReasoning?: (context: SubagentExecutionContext, text: string) => void | Promise<void>;
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
}

/**
 * Adapter between the transport-agnostic SubagentRunner and the real
 * AgentLoopController. The caller supplies the same configured loop factory
 * used by the normal host chat path, so subagents reuse provider, tools,
 * streaming, compaction and lifecycle behavior instead of creating a second
 * inference protocol.
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
      }
    };

    const loop = options.createLoop(context, hooks);
    const messages = options.buildMessages?.(context) ?? [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: context.task.prompt }
    ];

    // Abort the same loop used by the host when the subagent is cancelled.
    const onAbort = () => loop.stop();
    context.signal.addEventListener('abort', onAbort, { once: true });

    try {
      await loop.continue(messages);

      if (!answer.trim()) {
        const last = [...loop.getMessages()].reverse().find(
          (message) => message.role === 'assistant' && String(message.content || '').trim()
        );
        answer = String(last?.content || '');
      }

      if (context.signal.aborted) {
        const error = new Error('Subagent cancelled');
        error.name = 'AbortError';
        throw error;
      }

      return answer;
    } finally {
      context.signal.removeEventListener('abort', onAbort);
    }
  };
}
