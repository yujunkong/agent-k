/**
 * CHAT-006: MessageQueue debounce, drain, take/applyNow (ported from v2.1 RW-P1-02).
 * applyNow → take(): marks completed (not processing) so QueueUI never sticks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageQueue } from './MessageQueue';

describe('MessageQueue (CHAT-006)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('default debounce is 300ms before process handler runs', async () => {
    let processed = 0;
    const q = new MessageQueue();
    q.setHandler(async () => {
      processed += 1;
    });

    q.enqueue('hello', 'resynthesize');
    expect(processed).toBe(0);
    await vi.advanceTimersByTimeAsync(299);
    expect(processed).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(processed).toBe(1);
  });

  it('rapid resynthesize enqueue collapses to one process after debounce', async () => {
    let processed = 0;
    const q = new MessageQueue(300);
    q.setHandler(async () => {
      processed += 1;
    });

    q.enqueue('a', 'resynthesize');
    await vi.advanceTimersByTimeAsync(50);
    q.enqueue('b', 'resynthesize');
    await vi.advanceTimersByTimeAsync(50);
    q.enqueue('c', 'resynthesize');
    await vi.advanceTimersByTimeAsync(299);
    expect(processed).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(processed).toBe(1);
  });

  it('drain() returns queued texts in order', () => {
    const q = new MessageQueue();
    q.enqueue('first', 'queue_only');
    q.enqueue('second', 'queue_only');
    const texts = q.drain();
    expect(texts).toEqual(['first', 'second']);
    expect(q.getQueued()).toHaveLength(0);
  });

  it('take()/applyNow marks completed, sets resynthesize, clears debounce', async () => {
    const q = new MessageQueue(300);
    const msg = q.enqueue('urgent', 'queue_only');
    expect(msg.status).toBe('queued');

    const applied = q.applyNow(msg.id);
    expect(applied).toBeTruthy();
    // take() completes immediately so QueueUI does not show a stuck "processing" row
    expect(applied!.status).toBe('completed');
    expect(applied!.action).toBe('resynthesize');
    expect(q.getQueued()).toHaveLength(0);

    let processed = 0;
    q.setHandler(async () => {
      processed += 1;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(processed).toBe(0);
  });

  it('cancelQueued removes one item; pruneSettled drops settled history', () => {
    const q = new MessageQueue();
    const a = q.enqueue('keep', 'queue_only');
    const b = q.enqueue('drop', 'queue_only');
    q.cancelQueued(b.id);
    expect(q.getQueued().map((m) => m.id)).toEqual([a.id]);
    q.pruneSettled();
    expect(q.state.messages).toHaveLength(1);
    expect(q.state.messages[0].id).toBe(a.id);
  });

  it('snapshotQueued / restoreQueued park per-tab queue (CHAT-007 bridge)', () => {
    const q = new MessageQueue();
    q.enqueue('parked', 'queue_only');
    const snap = q.snapshotQueued();
    q.clear();
    expect(q.getQueued()).toHaveLength(0);
    q.restoreQueued(snap);
    expect(q.getQueued().map((m) => m.text)).toEqual(['parked']);
  });
});
