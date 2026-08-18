/**
 * regenerate must append a new streaming assistant turn and keep the prior reply.
 */
import * as assert from 'assert';
import type { ChatMessage } from '../../../src/chat/types';
import {
  apiHistoryForRegenerate,
  appendRegenerateAssistantTurn,
  createStreamingAssistantTurn,
  lastUserIndex
} from '../../../src/chat/regenerateTurn';

function msg(
  id: string,
  role: ChatMessage['role'],
  content: string,
  status: ChatMessage['status'] = 'complete'
): ChatMessage {
  return { id, role, content, status, timestamp: 1 };
}

suite('regenerate assistant turn', () => {
  test('api history ends at last user and keeps earlier assistants', () => {
    const thread = [
      msg('u1', 'user', 'first'),
      msg('a1', 'assistant', 'old-1'),
      msg('u2', 'user', 'second'),
      msg('a2', 'assistant', 'old-2')
    ];
    assert.strictEqual(lastUserIndex(thread), 2);
    const history = apiHistoryForRegenerate(thread);
    assert.ok(history);
    assert.deepStrictEqual(
      history!.map((m) => m.id),
      ['u1', 'a1', 'u2']
    );
  });

  test('append keeps the previous assistant and adds a new streaming id', () => {
    const thread = [
      msg('u1', 'user', 'hello'),
      msg('a1', 'assistant', 'first answer')
    ];
    const next = appendRegenerateAssistantTurn(
      thread,
      createStreamingAssistantTurn('a2', 99)
    );
    assert.strictEqual(next.length, 3);
    assert.strictEqual(next[1].id, 'a1');
    assert.strictEqual(next[1].content, 'first answer');
    assert.strictEqual(next[2].id, 'a2');
    assert.strictEqual(next[2].role, 'assistant');
    assert.strictEqual(next[2].status, 'streaming');
    assert.strictEqual(next[2].content, '');
    assert.notStrictEqual(next[2].id, next[1].id);
  });

  test('onRegenerateStart runs before sendMessage with last-user history', async () => {
    const thread = [
      msg('u1', 'user', 'q'),
      msg('a1', 'assistant', 'old')
    ];
    const order: string[] = [];
    let sentIds: string[] = [];

    const onRegenerateStart = () => {
      order.push('start');
    };
    const sendMessage = async (
      _text: string,
      _files: unknown,
      apiMessages: ChatMessage[]
    ) => {
      order.push('send');
      sentIds = apiMessages.map((m) => m.id);
    };

    const apiMessages = apiHistoryForRegenerate(thread);
    assert.ok(apiMessages);
    onRegenerateStart();
    await sendMessage(apiMessages![apiMessages!.length - 1].content, [], apiMessages!);

    assert.deepStrictEqual(order, ['start', 'send']);
    assert.deepStrictEqual(sentIds, ['u1']);
  });

  test('no user message → no regenerate history', () => {
    assert.strictEqual(apiHistoryForRegenerate([msg('a1', 'assistant', 'hi')]), null);
  });
});
