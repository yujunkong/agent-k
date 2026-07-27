/**
 * ADDON-T16: SideChatSession.executeQuery no longer fakes exploration —
 * it returns a clearly-labeled unsupported result.
 */
import * as assert from 'assert';
import { SideChatSession } from '../../../src/sidechat/SideChatSession';

suite('ADDON-T16 SideChatSession (unsupported stub resolution)', () => {
  test('executeQuery returns an explicit unsupported result, never a fake summary', async () => {
    const session = new SideChatSession();
    const result = await session.executeQuery('find all usages of UserService');
    assert.strictEqual(result.summary, 'Side chat is unsupported in this build.');
    assert.deepStrictEqual(result.findings, ['unsupported']);
    assert.deepStrictEqual(result.sources, []);
    assert.ok(!result.summary.includes('find all usages'), 'must not pretend to have explored the query');
  });

  test('does not throw for any query input', async () => {
    const session = new SideChatSession();
    await assert.doesNotReject(session.executeQuery(''));
    await assert.doesNotReject(session.executeQuery('a'.repeat(5000)));
  });

  test('getLatestResult / getMergeBlock still work with the unsupported result', async () => {
    const session = new SideChatSession();
    await session.executeQuery('grep for a symbol');
    const latest = session.getLatestResult();
    assert.ok(latest);
    assert.strictEqual(latest?.findings[0], 'unsupported');

    const block = session.getMergeBlock();
    assert.ok(block.includes('<side-chat'));
    assert.ok(block.includes('unsupported'));
  });

  test('clear() empties results', async () => {
    const session = new SideChatSession();
    await session.executeQuery('q');
    session.clear();
    assert.strictEqual(session.getLatestResult(), null);
  });
});
