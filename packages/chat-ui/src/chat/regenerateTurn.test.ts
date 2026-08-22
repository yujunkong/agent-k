/**
 * ✎ edit and ↻ regenerate share moveUserTurnToEnd; appendRegenerateAssistantTurn
 * is a thin last-user wrapper over that API.
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './types';
import {
  appendRegenerateAssistantTurn,
  createStreamingAssistantTurn,
  lastUserIndex,
  moveUserTurnToEnd
} from './regenerateTurn';
import { getVariantMeta } from './conversation/conversationVariants';

function message(
  id: string,
  role: ChatMessage['role'],
  content = id,
  extra?: Partial<ChatMessage>
): ChatMessage {
  return {
    id,
    role,
    content,
    timestamp: 1,
    status: 'complete',
    ...extra
  };
}

describe('moveUserTurnToEnd', () => {
  it('moves a middle user turn to the end and keeps later turns', () => {
    const messages = [
      message('u1', 'user', 'first'),
      message('a1', 'assistant', 'a1'),
      message('u2', 'user', 'middle'),
      message('a2', 'assistant', 'a2'),
      message('u3', 'user', 'later'),
      message('a3', 'assistant', 'a3')
    ];
    const prepared = moveUserTurnToEnd(messages, 2, 'middle edited', 'a-new');
    expect(prepared).not.toBeNull();
    expect(prepared!.messages.map((m) => m.id)).toEqual([
      'u1',
      'a1',
      'u3',
      'a3',
      'u2',
      'a-new'
    ]);
    expect(prepared!.messages[4].content).toBe('middle edited');
    expect(prepared!.messages[5].status).toBe('streaming');
    // Same user id — no duplicate bubble
    expect(prepared!.messages.filter((m) => m.id === 'u2')).toHaveLength(1);
    expect(lastUserIndex(prepared!.messages)).toBe(4);
  });

  it('rewriting the last turn only replaces its assistants (regenerate case)', () => {
    const messages = [
      message('u0', 'user', 'earlier'),
      message('a0', 'assistant', 'earlier answer'),
      message('u1', 'user', 'latest'),
      message('a1', 'assistant', 'stale')
    ];
    const prepared = moveUserTurnToEnd(messages, 2, 'latest', 'a-new');
    expect(prepared!.messages.map((m) => m.id)).toEqual([
      'u0',
      'a0',
      'u1',
      'a-new'
    ]);
    expect(prepared!.messages[2].content).toBe('latest');
  });

  it('strips variant meta and returns attachments from the user turn', () => {
    const messages = [
      message('u1', 'user', 'q', {
        attachments: [{ type: 'file', path: 'a.txt' }],
        metadata: {
          conversationVariantGroupId: 'turn:u1',
          conversationVariantIndex: 0,
          conversationVariantCount: 2
        }
      }),
      message('a1', 'assistant', 'old', {
        metadata: {
          conversationVariantGroupId: 'turn:u1',
          conversationVariantIndex: 0,
          conversationVariantCount: 2
        }
      })
    ];
    const prepared = moveUserTurnToEnd(messages, 0, 'q', 'a2');
    expect(getVariantMeta(prepared!.messages[0])).toBeNull();
    expect(getVariantMeta(prepared!.messages[1])).toBeNull();
    expect(prepared!.attachments).toHaveLength(1);
  });

  it('returns null for invalid user index', () => {
    expect(moveUserTurnToEnd([message('a1', 'assistant')], 0, 'x', 'a2')).toBeNull();
    expect(moveUserTurnToEnd([], -1, 'x', 'a2')).toBeNull();
  });
});

describe('appendRegenerateAssistantTurn', () => {
  it('delegates to moveUserTurnToEnd for last user — no sibling variants', () => {
    const messages = [
      message('u1', 'user', 'q1'),
      message('a1', 'assistant', 'old A', {
        metadata: {
          conversationVariantGroupId: 'turn:u1',
          conversationVariantIndex: 0,
          conversationVariantCount: 2
        }
      }),
      message('a2', 'assistant', 'old B', {
        metadata: {
          conversationVariantGroupId: 'turn:u1',
          conversationVariantIndex: 1,
          conversationVariantCount: 2
        }
      })
    ];
    const nextAssistant = createStreamingAssistantTurn('a3');
    const next = appendRegenerateAssistantTurn(messages, nextAssistant);

    expect(next.map((m) => m.id)).toEqual(['u1', 'a3']);
    expect(next[0].role).toBe('user');
    expect(getVariantMeta(next[0])).toBeNull();
    expect(next[1].status).toBe('streaming');
    expect(getVariantMeta(next[1])).toBeNull();
  });

  it('keeps earlier turns and only rewrites the last user turn', () => {
    const messages = [
      message('u0', 'user', 'earlier'),
      message('a0', 'assistant', 'earlier answer'),
      message('u1', 'user', 'latest'),
      message('a1', 'assistant', 'stale')
    ];
    const next = appendRegenerateAssistantTurn(
      messages,
      createStreamingAssistantTurn('a-new')
    );
    expect(next.map((m) => m.id)).toEqual(['u0', 'a0', 'u1', 'a-new']);
    expect(lastUserIndex(next)).toBe(2);
  });
});
