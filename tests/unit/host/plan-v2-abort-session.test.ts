/**
 * chat.send must abort only the same session's Plan V2 generate (parallel tabs).
 * Mirrors ChatViewProvider.abortPlanV2GenerateForSession + requestId session parse.
 */
import * as assert from 'assert';

type AbortEntry = { abort: AbortController; sessionId: string };

function sessionIdFromHostRequestId(requestId: string): string {
  const m = String(requestId || '').match(/^host_(.+?)_\d+_\d+$/);
  return m?.[1]?.trim() || '';
}

function abortPlanV2GenerateForSession(
  planV2Aborts: Map<string, AbortEntry>,
  cancelledIds: Set<string>,
  sessionId?: string
): void {
  const owner = String(sessionId || '').trim();
  if (!owner) return;
  for (const [id, entry] of [...planV2Aborts.entries()]) {
    if (entry.sessionId !== owner) continue;
    cancelledIds.add(id);
    entry.abort.abort();
    planV2Aborts.delete(id);
  }
}

suite('Plan V2 abort session scoping', () => {
  test('parses session id from host request id including underscores', () => {
    assert.strictEqual(
      sessionIdFromHostRequestId('host_sess_abc_3_1710000000000'),
      'sess_abc'
    );
    assert.strictEqual(sessionIdFromHostRequestId('host_plain_1_99'), 'plain');
    assert.strictEqual(sessionIdFromHostRequestId('not-a-host-id'), '');
  });

  test('aborts only matching session generates; empty session is a no-op', () => {
    const aborts = new Map<string, AbortEntry>();
    const cancelled = new Set<string>();
    const a = new AbortController();
    const b = new AbortController();
    aborts.set('req-a', { abort: a, sessionId: 'tab-a' });
    aborts.set('req-b', { abort: b, sessionId: 'tab-b' });

    abortPlanV2GenerateForSession(aborts, cancelled, '');
    assert.strictEqual(aborts.size, 2);
    assert.strictEqual(a.signal.aborted, false);

    abortPlanV2GenerateForSession(aborts, cancelled, 'tab-a');
    assert.strictEqual(a.signal.aborted, true);
    assert.strictEqual(b.signal.aborted, false);
    assert.ok(cancelled.has('req-a'));
    assert.ok(!cancelled.has('req-b'));
    assert.strictEqual(aborts.has('req-b'), true);
    assert.strictEqual(aborts.has('req-a'), false);
  });
});
