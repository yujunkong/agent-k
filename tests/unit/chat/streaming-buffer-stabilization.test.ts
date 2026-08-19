/**
 * Phase 4 — Streaming buffer stabilization regression tests.
 *
 * Verified structurally in v2.1 (single content buffer, seal-once
 * reclassification) — see the Phase 4 audit note in the roadmap. These
 * tests lock that behavior in at the pure-function level:
 *
 *   - `dedupeAssistantBody` (assistantStreamSession.ts): the final content
 *     buffer must never end up duplicating text that was already sealed
 *     into turnProse — single source of truth per message.
 *   - `sealBodyBeforeTools` (sealTurnProse.ts): a seal must always leave
 *     `content` at exactly '' afterwards (single buffer contract — the
 *     next `delta.content` starts a fresh accumulation, never appended on
 *     top of stale pre-seal text), and must classify content into visible
 *     turnProse vs. folded Thought exactly once per call, not drift on
 *     repeated seals of the same turn.
 *
 * These are the two "seal 후 짧은 content 청크가 다시 쌓이는" and
 * "중간 재분류" risks flagged as residual — this file is the harden pass
 * for them rather than a full pipeline rewrite (none is needed).
 */
import * as assert from 'assert';
import { dedupeAssistantBody } from '../../../src/chat/assistantStreamSession';
import { sealBodyBeforeTools, hasToolSteps } from '../../../src/chat/sealTurnProse';
import type { ChatMessage } from '../../../src/chat/types';

function baseMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    status: 'streaming',
    timestamp: Date.now(),
    ...overrides
  } as ChatMessage;
}

suite('dedupeAssistantBody — single buffer, no duplicate final content', () => {
  test('exact duplicate of sealed turnProse is dropped from turnProse, body kept', () => {
    const msg = baseMsg({
      content: '네, 확인하겠습니다. 여기 결과입니다.',
      turnProse: [{ id: 'p1', turn: 1, content: '네, 확인하겠습니다. 여기 결과입니다.' }]
    });
    const out = dedupeAssistantBody(msg);
    assert.strictEqual(out.turnProse?.length, 0, 'exact-duplicate prose must be dropped');
    assert.strictEqual(out.content, msg.content, 'final body must be untouched');
  });

  test('turnProse that is a prefix of the final body (>=40 chars) is dropped as duplicate', () => {
    const lead =
      '네, OAuth 로그인 오류를 확인하겠습니다. 코드를 먼저 살펴본 다음 원인을 정리해서 알려드리겠습니다.';
    const msg = baseMsg({
      content: `${lead} 원인은 리프레시 토큰 만료 처리 누락입니다.`,
      turnProse: [{ id: 'p1', turn: 1, content: lead }]
    });
    const out = dedupeAssistantBody(msg);
    assert.strictEqual(out.turnProse?.length, 0);
  });

  test('genuinely distinct turnProse (different content, not a prefix) is preserved', () => {
    const msg = baseMsg({
      content: '완료했습니다. 테스트도 통과했습니다.',
      turnProse: [{ id: 'p1', turn: 1, content: '먼저 관련 파일들을 찾아보겠습니다.' }]
    });
    const out = dedupeAssistantBody(msg);
    assert.strictEqual(out.turnProse?.length, 1, 'unrelated prose must not be dropped');
  });

  test('empty body or empty turnProse → message returned unchanged (no-op guard)', () => {
    const noBody = baseMsg({ content: '', turnProse: [{ id: 'p1', turn: 1, content: 'x' }] });
    assert.strictEqual(dedupeAssistantBody(noBody), noBody);

    const noProse = baseMsg({ content: 'hello', turnProse: [] });
    assert.strictEqual(dedupeAssistantBody(noProse), noProse);
  });
});

suite('sealBodyBeforeTools — single-buffer contract on seal', () => {
  test('after any seal, content is always exactly the empty string', () => {
    const msg = baseMsg({ content: '네, 확인하겠습니다.', turnProse: [] });
    const sealed = sealBodyBeforeTools(msg, 1);
    assert.strictEqual(sealed.content, '', 'content buffer must be fully cleared on seal');
    assert.strictEqual(sealed.openingLead, undefined, 'openingLead must be cleared too — no second buffer');
  });

  test('first seal of a turn (no explore tools yet) → visible turnProse, not folded into Thought', () => {
    const msg = baseMsg({ content: '먼저 관련 코드를 살펴보겠습니다.', steps: [], turnProse: [] });
    const sealed = sealBodyBeforeTools(msg, 1);
    assert.strictEqual(sealed.turnProse?.length, 1);
    assert.strictEqual(sealed.turnProse?.[0].content, '먼저 관련 코드를 살펴보겠습니다.');
    assert.strictEqual(hasToolSteps(sealed), false);
  });

  test('later seal in the same turn, after explore tools already ran → folded into Thought, not duplicated as visible prose', () => {
    const msg = baseMsg({
      content: '아직 하나 더 확인해야 할 부분이 있네요.',
      turnProse: [],
      steps: [
        { id: 's1', kind: 'reading', label: 'Read', itemStatus: 'done', turn: 1 },
        { id: 's2', kind: 'thinking', label: 'Thought', detail: '', itemStatus: 'done', turn: 1 }
      ]
    });
    const sealed = sealBodyBeforeTools(msg, 1);
    // Must NOT show up as a second visible turnProse entry — that was the
    // pre-Phase-2 bug (mid-dig self-talk duplicating as a visible reply).
    assert.strictEqual((sealed.turnProse || []).length, 0);
    const thought = sealed.steps?.find((s) => s.kind === 'thinking');
    assert.ok(thought?.detail?.includes('아직 하나 더 확인해야 할 부분이 있네요.'));
  });

  test('sealing the exact same text twice in a row does not duplicate it into Thought', () => {
    let msg = baseMsg({
      content: '중복 방지 테스트 문장입니다.',
      turnProse: [],
      steps: [{ id: 's1', kind: 'reading', label: 'Read', itemStatus: 'done', turn: 1 }]
    });
    msg = sealBodyBeforeTools(msg, 1);
    // Simulate a second, identical trickle before the next real delta arrives.
    msg = { ...msg, content: '중복 방지 테스트 문장입니다.' };
    msg = sealBodyBeforeTools(msg, 1);

    const thought = msg.steps?.find((s) => s.kind === 'thinking');
    const occurrences = (thought?.detail || '').split('중복 방지 테스트 문장입니다.').length - 1;
    assert.strictEqual(occurrences, 1, 'identical re-sealed text must not accumulate twice in Thought');
  });

  test('empty content after trim → seal is a no-op clear, no empty turnProse entry created', () => {
    const msg = baseMsg({ content: '   ', turnProse: [] });
    const sealed = sealBodyBeforeTools(msg, 1);
    assert.strictEqual(sealed.content, '');
    assert.strictEqual((sealed.turnProse || []).length, 0);
  });
});
