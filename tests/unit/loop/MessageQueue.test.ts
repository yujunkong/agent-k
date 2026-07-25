/**
 * RW-P1-02: MessageQueue debounce, drain, applyNow (fake timers)
 */
import * as assert from 'assert';
import { MessageQueue } from '../../src/loop/MessageQueue';

type TimerEntry = { at: number; fn: () => void; cancelled: boolean };

suite('MessageQueue (RW-P1-02)', () => {
  let now: number;
  let nextId: number;
  const scheduled = new Map<number, TimerEntry>();
  let origSetTimeout: typeof setTimeout;
  let origClearTimeout: typeof clearTimeout;

  function tick(ms: number): void {
    now += ms;
    for (const entry of scheduled.values()) {
      if (!entry.cancelled && entry.at <= now) {
        entry.cancelled = true;
        entry.fn();
      }
    }
  }

  setup(() => {
    now = 0;
    nextId = 0;
    scheduled.clear();
    origSetTimeout = global.setTimeout;
    origClearTimeout = global.clearTimeout;

    global.setTimeout = ((fn: () => void, ms?: number) => {
      const id = ++nextId;
      scheduled.set(id, { at: now + (ms ?? 0), fn, cancelled: false });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    global.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
      const entry = scheduled.get(id as number);
      if (entry) entry.cancelled = true;
    }) as typeof clearTimeout;
  });

  teardown(() => {
    global.setTimeout = origSetTimeout;
    global.clearTimeout = origClearTimeout;
  });

  test('default debounce is 300ms before process handler runs', async () => {
    let processed = 0;
    const q = new MessageQueue();
    q.setHandler(async () => {
      processed++;
    });

    q.enqueue('hello', 'resynthesize');
    assert.strictEqual(processed, 0);
    tick(299);
    assert.strictEqual(processed, 0);
    tick(1);
    assert.strictEqual(processed, 1);
  });

  test('rapid resynthesize enqueue collapses to one process after debounce', async () => {
    let processed = 0;
    const q = new MessageQueue(300);
    q.setHandler(async () => {
      processed++;
    });

    q.enqueue('a', 'resynthesize');
    tick(50);
    q.enqueue('b', 'resynthesize');
    tick(50);
    q.enqueue('c', 'resynthesize');
    tick(299);
    assert.strictEqual(processed, 0);
    tick(1);
    assert.strictEqual(processed, 1);
  });

  test('drain() returns queued texts in order', () => {
    const q = new MessageQueue();
    q.enqueue('first', 'queue_only');
    q.enqueue('second', 'queue_only');
    const texts = q.drain();
    assert.deepStrictEqual(texts, ['first', 'second']);
    assert.strictEqual(q.getQueued().length, 0);
  });

  test('applyNow marks message processing and clears debounce', () => {
    const q = new MessageQueue(300);
    const msg = q.enqueue('urgent', 'queue_only');
    assert.strictEqual(msg.status, 'queued');

    const applied = q.applyNow(msg.id);
    assert.ok(applied);
    assert.strictEqual(applied!.status, 'processing');
    assert.strictEqual(applied!.action, 'resynthesize');

    let processed = 0;
    q.setHandler(async () => {
      processed++;
    });
    tick(500);
    assert.strictEqual(processed, 0, 'debounce timer cleared by applyNow');
  });
});
