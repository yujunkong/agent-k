/**
 * sanitizeLoadedMessages must preserve in-flight streaming (CHAT-007).
 */
import { describe, expect, it } from 'vitest';
import {
  finalizeStreamingAssistant,
  finalizeStreamingMessages,
  sanitizeLoadedMessages
} from './chatAppHelpers';
import type { ChatMessage } from './types';

function streaming(content: string): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content,
    timestamp: 1,
    status: 'streaming'
  };
}

describe('sanitizeLoadedMessages', () => {
  it('keeps status:streaming so background deltas can still append', () => {
    const out = sanitizeLoadedMessages([streaming('partial')]);
    expect(out[0].status).toBe('streaming');
    expect(out[0].content).toBe('partial');
  });

  it('does not turn empty streaming into (no response)', () => {
    const out = sanitizeLoadedMessages([streaming('')]);
    expect(out[0].status).toBe('streaming');
    expect(out[0].content).toBe('');
  });
});

describe('finalizeStreamingAssistant', () => {
  it('settles empty streaming to visible error only when explicitly finalized', () => {
    const out = finalizeStreamingAssistant(streaming(''));
    expect(out?.status).toBe('error');
    expect(out?.content).toBe('(no response)');
  });

  it('cold-load settle via finalizeStreamingMessages', () => {
    const out = finalizeStreamingMessages([streaming('')]);
    expect(out[0].status).toBe('error');
    expect(out[0].content).toBe('(no response)');
  });
});
