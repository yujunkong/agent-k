import type { AgentLoopController } from '../loop/AgentLoopController';
import type { SubagentExecutionContext, SubagentExecutor } from './subagentRunner';

export interface SubagentAgentLoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface SubagentAgentLoopOptions {
  createLoop: (context: SubagentExecutionContext) => AgentLoopController;
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
    const loop = options.createLoop(context);
    let answer = '';

    const messages = options.buildMessages?.(context) ?? [
      { role: 'system', content: options.systemPrompt },
      {
        role: 'user',
        content: context.task.prompt
      }
    ];

    // Abort the same loop used by the host when the subagent is cancelled.
    const onAbort = () => loop.stop();
    context.signal.addEventListener('abort', onAbort, { once: true });

    try {
      // Subagent events intentionally flow through the existing AgentLoop
      // callback surface. This preserves tool/file-edit/timeline behavior.
      const originalDelta = loop.onAssistantDelta;
      const originalReasoning = loop.onReasoning;
      const originalToolCall = loop.onToolCall;
      const originalToolResult = loop.onToolResult;

      loop.onAssistantDelta = async (piece: string) => {
        answer += piece;
        await options.onDelta?.(context, piece);
        await originalDelta?.(piece);
      };
      loop.onReasoning = async (text: string) => {
        await options.onReasoning?.(context, text);
        await originalReasoning?.(text);
      };
      loop.onToolCall = async (name: string, args: unknown, callId?: string) => {
        await options.onToolCall?.(context, name, args, callId);
        await originalToolCall?.(name, args, callId);
      };
      loop.onToolResult = async (name: string, result: unknown, callId?: string) => {
        await options.onToolResult?.(context, name, result, callId);
        await originalToolResult?.(name, result, callId);
      };

      await loop.continue(messages);

      if (!answer.trim()) {
        const last = [...loop.getMessages()].reverse().find(
          (message) => message.role === 'assistant' && String(message.content || '').trim()
        );
        answer = String(last?.content || '');
      }

      if (context.signal.aborted) {
        throw new DOMException('Subagent cancelled', 'AbortError');
      }

      return answer;
    } finally {
      context.signal.removeEventListener('abort', onAbort);
    }
  };
}
