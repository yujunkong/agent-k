/**
 * STREAM-004 — Streaming buffer stabilization (chat-ui).
 *
 * Locks the single-content-buffer contract (v2.1 Phase 4 / streaming-buffer-
 * stabilization.test.ts). Runtime debounce buffer is core REL-003.
 *
 *   - dedupeAssistantBody: final body must not duplicate sealed turnProse
 *   - sealBodyBeforeTools: seal clears content to ''; classify once per seal
 */
import { describe, expect, it } from 'vitest';
import { dedupeAssistantBody } from './assistantStreamSession';
import { hasToolSteps, sealBodyBeforeTools } from './sealTurnProse';
import type { ChatMessage } from './types';

function baseMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    status: 'streaming',
    timestamp: Date.now(),
    ...overrides
  };
}

describe('STREAM-004 dedupeAssistantBody — single buffer', () => {
  it('exact duplicate of sealed turnProse is dropped; body kept', () => {
    const msg = baseMsg({
      content: '네, 확인하겠습니다. 여기 결과입니다.',
      turnProse: [
        { id: 'p1', turn: 1, content: '네, 확인하겠습니다. 여기 결과입니다.' }
      ]
    });
    const out = dedupeAssistantBody(msg);
    expect(out.turnProse?.length).toBe(0);
    expect(out.content).toBe(msg.content);
  });

  it('turnProse that is a prefix of the final body (>=40 chars) is dropped', () => {
    const lead =
      '네, OAuth 로그인 오류를 확인하겠습니다. 코드를 먼저 살펴본 다음 원인을 정리해서 알려드리겠습니다.';
    const msg = baseMsg({
      content: `${lead} 원인은 리프레시 토큰 만료 처리 누락입니다.`,
      turnProse: [{ id: 'p1', turn: 1, content: lead }]
    });
    const out = dedupeAssistantBody(msg);
    expect(out.turnProse?.length).toBe(0);
  });

  it('genuinely distinct turnProse is preserved', () => {
    const msg = baseMsg({
      content: '완료했습니다. 테스트도 통과했습니다.',
      turnProse: [{ id: 'p1', turn: 1, content: '먼저 관련 파일들을 찾아보겠습니다.' }]
    });
    const out = dedupeAssistantBody(msg);
    expect(out.turnProse?.length).toBe(1);
  });

  it('empty body or empty turnProse is a no-op', () => {
    const noBody = baseMsg({
      content: '',
      turnProse: [{ id: 'p1', turn: 1, content: 'x' }]
    });
    expect(dedupeAssistantBody(noBody)).toBe(noBody);

    const noProse = baseMsg({ content: 'hello', turnProse: [] });
    expect(dedupeAssistantBody(noProse)).toBe(noProse);
  });
});

describe('STREAM-004 sealBodyBeforeTools — single-buffer contract', () => {
  it('after any seal, content is exactly empty', () => {
    const sealed = sealBodyBeforeTools(
      baseMsg({ content: '네, 확인하겠습니다.', turnProse: [] }),
      1
    );
    expect(sealed.content).toBe('');
    expect(sealed.openingLead).toBeUndefined();
  });

  it('first seal with no explore tools → visible turnProse', () => {
    const sealed = sealBodyBeforeTools(
      baseMsg({ content: '먼저 관련 코드를 살펴보겠습니다.', steps: [], turnProse: [] }),
      1
    );
    expect(sealed.turnProse?.length).toBe(1);
    expect(sealed.turnProse?.[0].content).toBe('먼저 관련 코드를 살펴보겠습니다.');
    expect(hasToolSteps(sealed)).toBe(false);
  });

  it('later seal after explore tools → visible mid reply stays turnProse (Cursor dig bridge)', () => {
    const sealed = sealBodyBeforeTools(
      baseMsg({
        content: '테스트 파일과 추가 문서를 확인하겠습니다.',
        turnProse: [],
        steps: [
          { id: 's1', kind: 'reading', label: 'Read', itemStatus: 'done', turn: 1 },
          { id: 's2', kind: 'thinking', label: 'Thought', detail: '', itemStatus: 'done', turn: 1 }
        ]
      }),
      1
    );
    expect(sealed.turnProse?.length).toBe(1);
    expect(sealed.turnProse?.[0].content).toContain('테스트 파일');
    const thought = sealed.steps?.find((s) => s.kind === 'thinking');
    expect(thought?.detail || '').not.toContain('테스트 파일');
  });

  it('long English content after explore tools stays turnProse (never Thought)', () => {
    const dump =
      'Looking at the internal machinery more carefully, there are several interconnected pieces that need verification before proceeding with the wider refactor across modules.';
    const sealed = sealBodyBeforeTools(
      baseMsg({
        content: dump,
        turnProse: [],
        steps: [
          { id: 's1', kind: 'reading', label: 'Read', itemStatus: 'done', turn: 1 },
          { id: 's2', kind: 'thinking', label: 'Thought', detail: 'prior', itemStatus: 'done', turn: 1 }
        ]
      }),
      1
    );
    // Comment: structural contract — content channel never folds into Thought
    expect(sealed.turnProse?.length).toBe(1);
    expect(sealed.turnProse?.[0].content).toContain('interconnected pieces');
    const thought = sealed.steps?.find((s) => s.kind === 'thinking');
    expect(thought?.detail).toBe('prior');
  });

  it('sealing the same mid reply twice does not duplicate turnProse', () => {
    let msg = baseMsg({
      content: '중복 방지 테스트 문장입니다.',
      turnProse: [],
      steps: [{ id: 's1', kind: 'reading', label: 'Read', itemStatus: 'done', turn: 1 }]
    });
    msg = sealBodyBeforeTools(msg, 1);
    msg = { ...msg, content: '중복 방지 테스트 문장입니다.' };
    msg = sealBodyBeforeTools(msg, 1);

    expect(msg.turnProse?.length).toBe(1);
    expect(msg.turnProse?.[0].content).toBe('중복 방지 테스트 문장입니다.');
  });

  it('whitespace-only content → no empty turnProse entry', () => {
    const sealed = sealBodyBeforeTools(baseMsg({ content: '   ', turnProse: [] }), 1);
    expect(sealed.content).toBe('');
    expect((sealed.turnProse || []).length).toBe(0);
  });
});
