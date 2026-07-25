/**
 * RW-P0-04 / C3-T25: MessageQueue + synthesizeInstructions + StopHandler in-process
 */
import * as assert from 'assert';
import { MessageQueue } from '../../src/loop/MessageQueue';
import { StopHandler } from '../../src/loop/StopHandler';
import { buildResynthesizeMessages, synthesizeInstructions, stripResynthForDisplay } from '../../src/loop/synthesizeInstructions';
import { configManager } from '../../src/core/ConfigManager';

suite('E2E: MessageQueue + Resynthesize (RW-P0-04)', () => {
  test('Stop keeps queue when agent-k.queue.onStop=keep', () => {
    configManager.set('agent-k.queue.onStop', 'keep');
    const queue = new MessageQueue(50);
    queue.enqueue('queued item', 'queue_only');

    let aborted = false;
    const handler = new StopHandler({
      abort: () => {
        aborted = true;
      },
      queue
    });

    const result = handler.stop('user_stop');
    assert.strictEqual(aborted, true);
    assert.strictEqual(result.keptQueue, true);
    assert.strictEqual(result.discarded, 0);
    assert.strictEqual(queue.getQueued().length, 1);
  });

  test('Stop discards queue when onStop=discard', () => {
    configManager.set('agent-k.queue.onStop', 'discard');
    const queue = new MessageQueue(50);
    queue.enqueue('drop me', 'queue_only');

    const handler = new StopHandler({
      abort: () => {},
      queue
    });

    const result = handler.stop('user_stop');
    assert.strictEqual(result.keptQueue, false);
    assert.ok(result.discarded >= 1);
    configManager.set('agent-k.queue.onStop', 'keep');
  });

  test('drain + buildResynthesizeMessages produces interrupt system note', () => {
    const queue = new MessageQueue(50);
    queue.enqueue('follow-up A', 'resynthesize');
    queue.enqueue('follow-up B', 'resynthesize');
    const drained = queue.drain();
    assert.deepStrictEqual(drained, ['follow-up A', 'follow-up B']);

    const batch = drained.join('\n');
    const messages = buildResynthesizeMessages(
      [
        { role: 'user', content: 'initial ask' },
        { role: 'assistant', content: 'partial answer…' }
      ],
      batch,
      2,
      'agent'
    );

    const lastUser = messages.filter(m => m.role === 'user').slice(-1)[0];
    assert.ok(lastUser.content.includes('<system_note type="interrupt_resynthesize">'));
    assert.ok(lastUser.content.includes('follow-up A'));

    assert.strictEqual(
      stripResynthForDisplay(lastUser.content),
      'follow-up A\nfollow-up B',
      'UI must show only user instruction, not the interrupt wrapper'
    );

    const direct = synthesizeInstructions({
      interruptedMessage: '이',
      conversationSoFar: [{ role: 'assistant', content: 'was typing' }],
      lastToolResults: [],
      turnNumber: 1,
      mode: 'agent'
    });
    assert.ok(direct.includes('interrupted after turn 1'));
    assert.strictEqual(stripResynthForDisplay(direct), '이');
  });

  test('resynthesize debounce: single handler invocation', async () => {
    const queue = new MessageQueue(80);
    let runs = 0;
    queue.setHandler(async () => {
      runs++;
    });

    queue.enqueue('one', 'resynthesize');
    queue.enqueue('two', 'resynthesize');
    await new Promise(r => setTimeout(r, 120));
    assert.strictEqual(runs, 1);
  });
});
