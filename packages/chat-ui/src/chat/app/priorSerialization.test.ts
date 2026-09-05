/**
 * STREAM-004 — outbound prior serialization (follow-up send).
 *
 * sealBodyBeforeTools 후 assistant는 content:'' + turnProse만 남을 수 있다.
 * 모델에 보내는 prior 직렬화는 봉인된 prose를 content로 복원해야 한다.
 */
import { describe, expect, it } from 'vitest';
import { assistantOutboundContent, serializePriorMessages } from './priorSerialization';
import type { ChatMessage } from '../types';

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    status: 'complete',
    timestamp: Date.now(),
    ...overrides
  };
}

describe('assistantOutboundContent', () => {
  it('keeps non-empty content as-is (no prose duplication)', () => {
    const m = msg({
      content: 'final body',
      openingLead: 'lead',
      turnProse: [{ id: 'p1', turn: 1, content: 'sealed prose' }]
    });
    expect(assistantOutboundContent(m)).toBe('final body');
  });

  it('restores openingLead + turnProse when content is empty (sealed)', () => {
    const m = msg({
      content: '',
      openingLead: '확인했습니다.',
      turnProse: [
        { id: 'p1', turn: 1, content: '먼저 파일을 살폈습니다.' },
        { id: 'p2', turn: 1, content: '수정을 적용했습니다.' }
      ]
    });
    expect(assistantOutboundContent(m)).toBe(
      '확인했습니다.\n\n먼저 파일을 살폈습니다.\n\n수정을 적용했습니다.'
    );
  });

  it('drops whitespace-only prose fragments', () => {
    const m = msg({
      content: '   ',
      openingLead: '  ',
      turnProse: [
        { id: 'p1', turn: 1, content: '   ' },
        { id: 'p2', turn: 1, content: '실제 산문' }
      ]
    });
    expect(assistantOutboundContent(m)).toBe('실제 산문');
  });

  it('returns empty string when nothing is sealed', () => {
    expect(assistantOutboundContent(msg())).toBe('');
  });
});

describe('serializePriorMessages', () => {
  it('keeps assistant content when present', () => {
    const out = serializePriorMessages([msg({ content: '이전 답변' })]);
    expect(out).toEqual([{ role: 'assistant', content: '이전 답변', name: undefined }]);
  });

  it('joins sealed prose for assistant with empty content', () => {
    const out = serializePriorMessages([
      msg({
        content: '',
        openingLead: 'lead',
        turnProse: [{ id: 'p1', turn: 1, content: 'prose body' }]
      })
    ]);
    expect(out).toEqual([{ role: 'assistant', content: 'lead\n\nprose body', name: undefined }]);
  });

  it('excludes streaming assistants', () => {
    const out = serializePriorMessages([
      msg({ content: 'done', id: 'a1' }),
      msg({ content: 'partial', id: 'a2', status: 'streaming' })
    ]);
    expect(out.map((m) => m.content)).toEqual(['done']);
  });

  it('leaves user messages untouched', () => {
    const out = serializePriorMessages([
      msg({ role: 'user', content: '질문', id: 'u1' }),
      msg({ content: 'sealed', turnProse: [{ id: 'p1', turn: 1, content: 'x' }] })
    ]);
    expect(out[0]).toEqual({ role: 'user', content: '질문', name: undefined });
    expect(out[1].content).toBe('sealed');
  });
});
