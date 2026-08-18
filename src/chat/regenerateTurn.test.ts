import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './types';
import {
  apiHistoryForRegenerate,
  appendRegenerateAssistantTurn,
  createStreamingAssistantTurn
} from './regenerateTurn';

function msg(
  id: string,
  role: ChatMessage['role'],
  content: string
): ChatMessage {
  return { id, role, content, status: 'complete', timestamp: 1 };
}

describe('regenerateTurn', () => {
  it('keeps the prior assistant and appends a new streaming ConversationTurn id', () => {
    const thread = [msg('u1', 'user', 'hi'), msg('a1', 'assistant', 'v1')];
    const next = appendRegenerateAssistantTurn(
      thread,
      createStreamingAssistantTurn('a2')
    );
    expect(next.map((m) => m.id)).toEqual(['u1', 'a1', 'a2']);
    expect(next[1].content).toBe('v1');
    expect(next[2].status).toBe('streaming');
    expect(apiHistoryForRegenerate(thread)?.map((m) => m.id)).toEqual(['u1']);
  });
});
