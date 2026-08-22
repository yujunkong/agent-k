/**
 * Regenerate creates a sibling assistant variant for the same user turn.
 * The old assistant remains visible through the conversation variant model,
 * while the host receives history only through the active user prompt.
 */
import type { ChatMessage } from './types';
import {
  annotateVariantSiblings,
  getVariantMeta
} from './conversation/conversationVariants';

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

/**
 * Keep existing turns and annotate assistants after the last user as siblings.
 * The newly generated assistant becomes the active variant.
 */
export function appendRegenerateAssistantTurn(
  messages: ChatMessage[],
  assistant: ChatMessage
): ChatMessage[] {
  const userIndex = lastUserIndex(messages);
  if (userIndex < 0) return [...messages, assistant];

  const userId = messages[userIndex].id;
  const groupId = `turn:${userId}`;
  const current = [...messages, assistant];
  const annotated = annotateVariantSiblings(
    current,
    userIndex,
    groupId,
    undefined
  );

  const newAssistantIndex = annotated.findIndex((message) => message.id === assistant.id);
  if (newAssistantIndex < 0) return annotated;

  // annotateVariantSiblings activates the newest sibling by default.
  const newAssistant = annotated[newAssistantIndex];
  if (!getVariantMeta(newAssistant)) return annotated;
  return annotated;
}
