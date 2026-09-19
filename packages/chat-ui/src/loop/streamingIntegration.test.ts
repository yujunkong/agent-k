/**
 * INT-004 — Streaming → Stop → Queue → Regenerate 통합 (chat-ui 경로)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StopHandler } from './StopHandler';
import { MessageQueue } from './MessageQueue';
import { moveUserTurnToEnd, apiHistoryForRegenerate } from '../chat/regenerateTurn';
import { configManager } from '../core/ConfigManager';

beforeEach(() => {
  configManager.set('agent-k.queue.onStop', 'keep');
});

describe('INT-004 Streaming → Stop → Queue', () => {
  it('stop aborts and keeps queue by default', () => {
    let aborted = false;
    const queue = new MessageQueue();
    queue.enqueue('next task', 'queue_only');
    const handler = new StopHandler({ abort: () => { aborted = true; }, queue });

    const result = handler.stop('user_stop');
    expect(aborted).toBe(true);
    expect(result).toEqual({ keptQueue: true, discarded: 0 });
    expect(queue.getQueued()).toHaveLength(1);
  });

  it('stop discards queue when agent-k.queue.onStop = discard', () => {
    configManager.set('agent-k.queue.onStop', 'discard');
    let aborted = false;
    const queue = new MessageQueue();
    queue.enqueue('a', 'queue_only');
    queue.enqueue('b', 'queue_only');
    const handler = new StopHandler({ abort: () => { aborted = true; }, queue });

    const result = handler.stop('user_stop');
    expect(aborted).toBe(true);
    expect(result).toEqual({ keptQueue: false, discarded: 2 });
    expect(queue.getQueued()).toHaveLength(0);
  });

  it('interruptForResynthesize aborts without touching queue', () => {
    let aborted = false;
    const queue = new MessageQueue();
    queue.enqueue('keep me', 'queue_only');
    const handler = new StopHandler({ abort: () => { aborted = true; }, queue });

    handler.interruptForResynthesize();
    expect(aborted).toBe(true);
    expect(queue.getQueued()).toHaveLength(1);
  });
});

describe('INT-004 Regenerate', () => {
  it('moves user turn to end for regeneration', () => {
    const messages = [
      { id: 'm1', role: 'user' as const, content: 'first', timestamp: 1 },
      { id: 'm2', role: 'assistant' as const, content: 'reply', timestamp: 2 },
      { id: 'm3', role: 'user' as const, content: 'second', timestamp: 3 },
    ];
    const result = moveUserTurnToEnd(messages, 0, 'first (edited)', 'a-new');
    expect(result).not.toBeNull();
    if (result) {
      // original user turn removed from position 0; edited copy appended near the end
      expect(result.messages[0].id).not.toBe('m1');
      const edited = result.messages.find((m) => m.id === 'm1');
      expect(edited?.content).toBe('first (edited)');
      expect(edited?.role).toBe('user');
      // fresh assistant step appended last
      expect(result.messages[result.messages.length - 1].role).toBe('assistant');
    }
  });

  it('apiHistoryForRegenerate truncates later assistants', () => {
    const messages = [
      { id: 'm1', role: 'user' as const, content: 'q1', timestamp: 1 },
      { id: 'm2', role: 'assistant' as const, content: 'a1', timestamp: 2 },
      { id: 'm3', role: 'user' as const, content: 'q2', timestamp: 3 },
    ];
    const history = apiHistoryForRegenerate(messages);
    expect(history?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});
