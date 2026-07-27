/**
 * ADDON-T06: HostSessionBridge pure mapping helpers unit tests
 */
import * as assert from 'assert';
import { toHostSnapshot, fromHostSnapshot } from '../../../src/session/HostSessionBridge';

suite('ADDON-T06 HostSessionBridge', () => {
  test('toHostSnapshot maps ChatSessionMeta title → host label', () => {
    const snap = toHostSnapshot(
      [
        {
          id: 's1',
          title: 'My chat',
          mode: 'agent',
          messageCount: 4,
          createdAt: 10,
          updatedAt: 20
        }
      ],
      's1'
    );
    assert.strictEqual(snap.currentId, 's1');
    assert.strictEqual(snap.sessions.length, 1);
    assert.strictEqual(snap.sessions[0].label, 'My chat');
    assert.strictEqual(snap.sessions[0].mode, 'agent');
  });

  test('fromHostSnapshot maps host label → ChatSessionMeta title', () => {
    const { metas, currentId } = fromHostSnapshot({
      sessions: [
        {
          id: 'h1',
          label: 'Host chat',
          mode: 'plan',
          messageCount: 2,
          createdAt: 1,
          updatedAt: 2
        }
      ],
      currentId: 'h1'
    });
    assert.strictEqual(currentId, 'h1');
    assert.strictEqual(metas.length, 1);
    assert.strictEqual(metas[0].title, 'Host chat');
    assert.strictEqual(metas[0].mode, 'plan');
  });

  test('round-trip toHostSnapshot → fromHostSnapshot preserves fields', () => {
    const original = [
      {
        id: 's1',
        title: 'Round trip',
        mode: 'debug',
        messageCount: 7,
        createdAt: 100,
        updatedAt: 200,
        summary: 'a summary'
      }
    ];
    const snap = toHostSnapshot(original, 's1');
    const { metas, currentId } = fromHostSnapshot(snap);
    assert.strictEqual(currentId, 's1');
    assert.deepStrictEqual(metas, original);
  });

  test('fromHostSnapshot tolerates null/undefined/malformed input', () => {
    assert.deepStrictEqual(fromHostSnapshot(null), { metas: [], currentId: null });
    assert.deepStrictEqual(fromHostSnapshot(undefined), { metas: [], currentId: null });
    assert.deepStrictEqual(fromHostSnapshot({ sessions: null as any, currentId: null }), {
      metas: [],
      currentId: null
    });
  });

  test('toHostSnapshot handles empty list and null currentId', () => {
    const snap = toHostSnapshot([], null);
    assert.deepStrictEqual(snap, { sessions: [], currentId: null });
  });
});
