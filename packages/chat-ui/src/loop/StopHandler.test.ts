/**
 * CHAT-006 / STREAM-007: Stop keeps or discards queue per agent-k.queue.onStop.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageQueue } from './MessageQueue';
import { StopHandler } from './StopHandler';
import { configManager } from '../core/ConfigManager';

describe('StopHandler queue policy', () => {
  beforeEach(() => {
    vi.spyOn(configManager, 'get').mockImplementation((key: string) => {
      if (key === 'agent-k.queue.onStop') return 'keep';
      return undefined;
    });
  });

  it('stop with keep leaves queued messages', () => {
    const abort = vi.fn();
    const queue = new MessageQueue();
    queue.enqueue('later', 'queue_only');
    const handler = new StopHandler({ abort, queue });

    const result = handler.stop();
    expect(abort).toHaveBeenCalledOnce();
    expect(result.keptQueue).toBe(true);
    expect(result.discarded).toBe(0);
    expect(queue.getQueued()).toHaveLength(1);
  });

  it('stop with discard cancels all queued', () => {
    vi.spyOn(configManager, 'get').mockImplementation((key: string) => {
      if (key === 'agent-k.queue.onStop') return 'discard';
      return undefined;
    });
    const abort = vi.fn();
    const queue = new MessageQueue();
    queue.enqueue('a', 'queue_only');
    queue.enqueue('b', 'queue_only');
    const handler = new StopHandler({ abort, queue });

    const result = handler.stop();
    expect(result.keptQueue).toBe(false);
    expect(result.discarded).toBe(2);
    expect(queue.getQueued()).toHaveLength(0);
  });

  it('interruptForResynthesize aborts without touching queue', () => {
    const abort = vi.fn();
    const queue = new MessageQueue();
    queue.enqueue('keep', 'queue_only');
    const handler = new StopHandler({ abort, queue });

    handler.interruptForResynthesize();
    expect(abort).toHaveBeenCalledOnce();
    expect(queue.getQueued()).toHaveLength(1);
  });
});
