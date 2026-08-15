/**
 * Mode auto-classifier + ConversationTurn
 */
import * as assert from 'assert';
import {
  classifyMode,
  lastConversationTurn,
  resolveSendMode
} from '../../../src/mode';

suite('mode classifier', () => {
  test('debug keywords → debug', () => {
    const d = classifyMode({ userMessage: '이 에러 왜 안 돼?' });
    assert.strictEqual(d.mode, 'debug');
    assert.strictEqual(d.source, 'heuristic');
  });

  test('plan keywords → plan', () => {
    const d = classifyMode({ userMessage: '아키텍처 설계부터 어떻게 하면 좋을까' });
    assert.strictEqual(d.mode, 'plan');
    assert.strictEqual(d.source, 'heuristic');
  });

  test('implement keywords → agent', () => {
    const d = classifyMode({ userMessage: '이 패치 적용하고 테스트까지 해줘' });
    assert.strictEqual(d.mode, 'agent');
    assert.strictEqual(d.source, 'heuristic');
  });

  test('no signal → ask', () => {
    const d = classifyMode({ userMessage: '이 함수가 뭐 하는 거야?' });
    assert.strictEqual(d.mode, 'ask');
    assert.strictEqual(d.source, 'fallback');
  });

  test('sticky keeps agent while tools were running', () => {
    const d = classifyMode({
      userMessage: '이어서 그 파일도 봐줘',
      previousMode: 'agent',
      previousWasActive: true
    });
    assert.strictEqual(d.mode, 'agent');
    assert.strictEqual(d.source, 'sticky');
  });

  test('explicit switch breaks sticky', () => {
    const d = classifyMode({
      userMessage: '계획만 세워 주세요',
      previousMode: 'agent',
      previousWasActive: true
    });
    assert.strictEqual(d.mode, 'plan');
    assert.notStrictEqual(d.source, 'sticky');
  });

  test('plan session stays on plan until explicit switch', () => {
    const d = classifyMode({
      userMessage: '좋아, 그 방향으로',
      previousMode: 'plan',
      planSessionActive: true
    });
    assert.strictEqual(d.mode, 'plan');
    assert.strictEqual(d.source, 'sticky');
  });
});

suite('resolveSendMode', () => {
  test('locked picker ignores keywords', () => {
    const r = resolveSendMode({
      userMessage: '구현해줘',
      picker: 'ask',
      lastTurn: null,
      planSessionActive: false
    });
    assert.strictEqual(r.mode, 'ask');
    assert.strictEqual(r.decision.source, 'manual');
  });

  test('modeOverride wins over Auto', () => {
    const r = resolveSendMode({
      userMessage: '아키텍처 설계',
      picker: 'auto',
      lastTurn: null,
      planSessionActive: false,
      modeOverride: 'agent'
    });
    assert.strictEqual(r.mode, 'agent');
    assert.strictEqual(r.decision.source, 'manual');
  });

  test('Auto classifies on send', () => {
    const r = resolveSendMode({
      userMessage: 'write a plan for the refactor',
      picker: 'auto',
      lastTurn: null,
      planSessionActive: false
    });
    assert.strictEqual(r.mode, 'plan');
    assert.strictEqual(r.decision.source, 'heuristic');
  });
});

suite('lastConversationTurn', () => {
  test('reads mode + tool activity from the last user/assistant pair', () => {
    const turn = lastConversationTurn([
      {
        id: 'u1',
        role: 'user',
        content: '고쳐줘',
        timestamp: 1,
        metadata: { mode: 'agent' }
      },
      {
        id: 'a1',
        role: 'assistant',
        content: 'ok',
        steps: [{ kind: 'editing' }]
      }
    ]);
    assert.ok(turn);
    assert.strictEqual(turn!.mode, 'agent');
    assert.strictEqual(turn!.hadToolCalls, true);
    assert.strictEqual(turn!.userMessage, '고쳐줘');
  });

  test('empty transcript → null', () => {
    assert.strictEqual(lastConversationTurn([]), null);
  });
});
