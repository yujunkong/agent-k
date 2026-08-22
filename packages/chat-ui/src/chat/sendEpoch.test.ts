/**
 * STREAM-003 — Per-tab send epoch (chat-ui). Runtime twin: core REL-005.
 */
import { describe, expect, it } from 'vitest';
import { SendEpochMap } from './sendEpoch';

describe('STREAM-003 SendEpochMap', () => {
  it('bumping session B does not stale session A', () => {
    const epochs = new SendEpochMap();
    const a = epochs.bump('sess-a');
    const b = epochs.bump('sess-b');
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(epochs.isStale('sess-a', a)).toBe(false);
    expect(epochs.isStale('sess-b', b)).toBe(false);
    epochs.bump('sess-b');
    expect(epochs.isStale('sess-a', a)).toBe(false);
    expect(epochs.isStale('sess-b', b)).toBe(true);
  });

  it('stop/resynth on A only stales A', () => {
    const epochs = new SendEpochMap();
    const a = epochs.bump('sess-a');
    const b = epochs.bump('sess-b');
    epochs.bump('sess-a');
    expect(epochs.isStale('sess-a', a)).toBe(true);
    expect(epochs.isStale('sess-b', b)).toBe(false);
  });

  it('clear drops epoch so a new bump starts at 1', () => {
    const epochs = new SendEpochMap();
    epochs.bump('sess-a');
    epochs.bump('sess-a');
    epochs.clear('sess-a');
    expect(epochs.get('sess-a')).toBe(0);
    expect(epochs.bump('sess-a')).toBe(1);
  });
});
