/**
 * Pencil edit (✎) and regenerate (↻) share ONE rework path:
 * move the target user turn to the bottom as the latest turn, then send a
 * fresh assistant answer (skipPaint — no duplicate user bubble, no variant pager).
 *
 * Canonical API: moveUserTurnToEnd. appendRegenerateAssistantTurn is a thin
 * wrapper that targets the last user turn (CONV-007 simplify).
 */
import type { Attachment, ChatMessage } from './types';

export function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

/** End index (exclusive) of user turn: user + following non-user messages. */
export function userTurnEndIndex(messages: ChatMessage[], userIndex: number): number {
  let end = userIndex + 1;
  while (end < messages.length && messages[end].role !== 'user') {
    end += 1;
  }
  return end;
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

function stripVariantMeta(message: ChatMessage): ChatMessage {
  const metadata = message.metadata as
    | (ChatMessage['metadata'] & {
        conversationVariantGroupId?: string;
        conversationVariantIndex?: number;
        conversationVariantCount?: number;
      })
    | undefined;
  if (
    !metadata ||
    (metadata.conversationVariantGroupId == null &&
      metadata.conversationVariantIndex == null &&
      metadata.conversationVariantCount == null)
  ) {
    return message;
  }
  const {
    conversationVariantGroupId: _g,
    conversationVariantIndex: _i,
    conversationVariantCount: _c,
    ...rest
  } = metadata;
  return {
    ...message,
    metadata: Object.keys(rest).length ? rest : undefined
  };
}

/**
 * Lift selected user turn to the transcript end (keep other turns), drop its
 * prior assistants, append edited/same user + new streaming assistant.
 * Shared by ✎ edit and ↻ regenerate — not truncate-middle + duplicate user.
 */
export function moveUserTurnToEnd(
  messages: ChatMessage[],
  userIndex: number,
  newContent: string,
  newAssistantId: string
): { messages: ChatMessage[]; attachments: Attachment[] } | null {
  if (
    userIndex < 0 ||
    userIndex >= messages.length ||
    messages[userIndex].role !== 'user'
  ) {
    return null;
  }

  const turnEnd = userTurnEndIndex(messages, userIndex);
  const before = messages.slice(0, userIndex).map(stripVariantMeta);
  const after = messages.slice(turnEnd).map(stripVariantMeta);
  const userMsg: ChatMessage = {
    ...stripVariantMeta(messages[userIndex]),
    content: newContent,
    status: 'complete'
  };
  const assistant = createStreamingAssistantTurn(newAssistantId);

  return {
    messages: [...before, ...after, userMsg, assistant],
    attachments: userMsg.attachments ? [...userMsg.attachments] : []
  };
}

/**
 * Thin wrapper around moveUserTurnToEnd for the last user turn.
 * Prefer moveUserTurnToEnd + skipPaint send from UI handlers; kept exported
 * for any callers that already pass a pre-built streaming assistant.
 */
export function appendRegenerateAssistantTurn(
  messages: ChatMessage[],
  assistant: ChatMessage
): ChatMessage[] {
  const userIndex = lastUserIndex(messages);
  if (userIndex < 0) return [...messages, assistant];

  const prepared = moveUserTurnToEnd(
    messages,
    userIndex,
    messages[userIndex].content,
    assistant.id
  );
  if (!prepared) return [...messages, assistant];

  // Keep caller-supplied assistant object (e.g. stamped timestamp).
  return [...prepared.messages.slice(0, -1), stripVariantMeta(assistant)];
}
