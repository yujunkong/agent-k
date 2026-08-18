/**
 * Regenerate keeps prior assistant turns in the UI and starts a new
 * streaming assistant. Host history still ends at the last user message
 * so the model answers the same prompt instead of continuing the old reply.
 */
import type { ChatMessage } from './types';

export function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

/** Conversation sent to the host: through last user, excluding later assistants. */
export function apiHistoryForRegenerate(messages: ChatMessage[]): ChatMessage[] | null {
  const idx = lastUserIndex(messages);
  if (idx < 0) return null;
  return messages.slice(0, idx + 1);
}

export function createStreamingAssistantTurn(
  id: string,
  timestamp = Date.now()
): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    timestamp,
    status: 'streaming'
  };
}

/** Keep existing turns; append a new streaming assistant (new ConversationTurn id). */
export function appendRegenerateAssistantTurn(
  messages: ChatMessage[],
  assistant: ChatMessage
): ChatMessage[] {
  return [...messages, assistant];
}
