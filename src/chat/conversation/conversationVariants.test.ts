import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import {
  annotateVariantSiblings,
  getActiveVariant,
  getVariantMeta,
  selectActiveConversationMessages
} from './conversationVariants';

function message(id: string, role: ChatMessage['role'], content = id): ChatMessage {
  return {
    id,
    role,
    content,
    timestamp: 1,
    status: 'complete'
  };
}

describe('Conversation variants', () => {
  it('groups assistant siblings under one user turn and activates the newest', () => {
    const messages = [
      message('u1', 'user', 'question'),
      message('a1', 'assistant', 'answer A'),
      message('a2', 'assistant', 'answer B')
    ];

    const next = annotateVariantSiblings(messages, 0, 'turn:u1');

    expect(getVariantMeta(next[1])).toMatchObject({ groupId: 'turn:u1', index: 0, count: 2 });
    expect(getVariantMeta(next[2])).toMatchObject({ groupId: 'turn:u1', index: 1, count: 2 });
    expect(getActiveVariant('turn:u1')).toBe(1);
  });

  it('selects only the active sibling for model context', () => {
    const messages = [
      message('u1', 'user', 'question'),
      message('a1', 'assistant', 'answer A'),
      message('a2', 'assistant', 'answer B')
    ];
    const next = annotateVariantSiblings(messages, 0, 'turn:u1', 0);

    expect(selectActiveConversationMessages(next).map((m) => m.id)).toEqual(['u1', 'a1']);
  });
});
