/**
 * Per-tab send epoch: a second tab's send must not stale the first tab's stream.
 */
import * as assert from 'assert';
import { SendEpochMap } from '../../../src/chat/sendEpoch';

suite('SendEpochMap', () => {
  test('bumping session B does not stale session A', () => {
    const epochs = new SendEpochMap();
    const a = epochs.bump('sess-a');
    const b = epochs.bump('sess-b');
    assert.strictEqual(a, 1);
    assert.strictEqual(b, 1);
    assert.strictEqual(epochs.isStale('sess-a', a), false);
    assert.strictEqual(epochs.isStale('sess-b', b), false);
    epochs.bump('sess-b');
    assert.strictEqual(epochs.isStale('sess-a', a), false);
    assert.strictEqual(epochs.isStale('sess-b', b), true);
  });

  test('stop/resynth on A only stales A', () => {
    const epochs = new SendEpochMap();
    const a = epochs.bump('sess-a');
    const b = epochs.bump('sess-b');
    epochs.bump('sess-a');
    assert.ok(epochs.isStale('sess-a', a));
    assert.strictEqual(epochs.isStale('sess-b', b), false);
  });
});
