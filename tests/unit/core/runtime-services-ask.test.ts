/**
 * Parallel-tab ask_question: waiters stay bound to the notifier captured at wait start.
 */
import * as assert from 'assert';
import { RuntimeServices, type PendingAskQuestion } from '../../../src/core/RuntimeServices';

function q(id: string, question = 'pick'): PendingAskQuestion {
  return { id, question, required: true };
}

suite('RuntimeServices ask_question isolation', () => {
  setup(() => {
    RuntimeServices.cancelQuestion('test reset');
    RuntimeServices.setAskQuestionNotifier(undefined);
  });

  teardown(() => {
    RuntimeServices.cancelQuestion('test reset');
    RuntimeServices.setAskQuestionNotifier(undefined);
  });

  test('a later tab notifier does not steal an in-flight waiter', async () => {
    const posted: string[] = [];
    RuntimeServices.setAskQuestionNotifier((pending) => {
      posted.push(`a:${pending.id}`);
    }, 'req-a');
    const waitA = RuntimeServices.waitForQuestion(q('q-a'), 5_000);

    RuntimeServices.setAskQuestionNotifier((pending) => {
      posted.push(`b:${pending.id}`);
    }, 'req-b');
    const waitB = RuntimeServices.waitForQuestion(q('q-b'), 5_000);

    assert.deepStrictEqual(posted, ['a:q-a', 'b:q-b']);
    assert.strictEqual(RuntimeServices.getPendingQuestions('req-a').length, 1);
    assert.strictEqual(RuntimeServices.getPendingQuestions('req-b').length, 1);

    RuntimeServices.resolveQuestion('q-a', 'yes');
    RuntimeServices.resolveQuestion('q-b', 'no');
    assert.strictEqual(await waitA, 'yes');
    assert.strictEqual(await waitB, 'no');
  });

  test('cancelQuestion scoped to one request leaves the other waiter', async () => {
    RuntimeServices.setAskQuestionNotifier(() => {}, 'req-a');
    const waitA = RuntimeServices.waitForQuestion(q('q-a'), 5_000);
    RuntimeServices.setAskQuestionNotifier(() => {}, 'req-b');
    const waitB = RuntimeServices.waitForQuestion(q('q-b'), 5_000);

    RuntimeServices.cancelQuestion('chat stopped', 'req-a');
    await assert.rejects(waitA, /chat stopped/);
    assert.strictEqual(RuntimeServices.isAskQuestionPending('req-b'), true);

    RuntimeServices.resolveQuestion('q-b', 'ok');
    assert.strictEqual(await waitB, 'ok');
  });

  test('cancelQuestionById only rejects that qid', async () => {
    RuntimeServices.setAskQuestionNotifier(() => {}, 'req-a');
    const waitA = RuntimeServices.waitForQuestion(q('q-a'), 5_000);
    RuntimeServices.setAskQuestionNotifier(() => {}, 'req-b');
    const waitB = RuntimeServices.waitForQuestion(q('q-b'), 5_000);

    RuntimeServices.cancelQuestionById('q-a', 'ask_question cancelled: q-a');
    await assert.rejects(waitA, /q-a/);
    RuntimeServices.resolveQuestion('q-b', 'kept');
    assert.strictEqual(await waitB, 'kept');
  });
});
