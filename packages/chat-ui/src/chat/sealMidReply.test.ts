import { describe, expect, it } from 'vitest';
import { sealBodyBeforeTools } from './sealTurnProse';
import type { ChatMessage } from './types';

function msg(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'a',
    role: 'assistant',
    content: '',
    status: 'streaming',
    timestamp: 1,
    ...partial
  };
}

describe('sealBodyBeforeTools — structural (content → turnProse)', () => {
  it('always seals content to turnProse even when explore tools already ran', () => {
    const before = msg({
      content: '테스트 파일과 추가 문서를 확인하겠습니다.',
      steps: [
        {
          id: 'r1',
          kind: 'reading',
          label: 'Read',
          toolName: 'read_file',
          turn: 1,
          itemStatus: 'done'
        }
      ]
    });
    const after = sealBodyBeforeTools(before, 1);
    expect(after.content).toBe('');
    expect(after.turnProse?.length).toBe(1);
    expect(after.turnProse?.[0].content).toContain('테스트 파일');
    expect(after.turnProse?.[0].afterStepId).toBe('r1');
    const thought = (after.steps || []).find((s) => s.kind === 'thinking');
    expect(thought?.detail || '').not.toContain('테스트 파일');
  });

  it('never folds mixed dig+handoff content into Thought (any language)', () => {
    const handoff =
      '이걸 서브에이전트에게 맡깁니다. Phase 1 커서 이동 프리미티브를 구현합니다.';
    const before = msg({
      content: [
        "Let me write a thorough prompt. I'll spawn one subagent.",
        "I'll spawn it now.",
        handoff
      ].join('\n'),
      steps: [
        {
          id: 'tl_thinking_1',
          kind: 'thinking',
          label: 'Thought',
          detail: 'reasoning-only dig',
          turn: 1,
          itemStatus: 'done'
        },
        {
          id: 'r1',
          kind: 'reading',
          label: 'Read',
          toolName: 'read_file',
          turn: 1,
          itemStatus: 'done'
        }
      ]
    });
    const after = sealBodyBeforeTools(before, 1);
    expect(after.turnProse?.some((p) => p.content.includes('맡깁니다'))).toBe(
      true
    );
    // Comment: content must not append into Thought — reasoning channel owns that
    expect(
      String(
        (after.steps || []).find((s) => s.id === 'tl_thinking_1')?.detail || ''
      )
    ).toBe('reasoning-only dig');
  });

  it('seals Command pre-ack to turnProse without NLP', () => {
    const before = msg({
      content: '먼저 정확한 수정 지점을 확인한 뒤 빌드를 실행하겠습니다.',
      steps: [
        {
          id: 'r1',
          kind: 'reading',
          label: 'Read',
          toolName: 'read_file',
          turn: 1,
          itemStatus: 'done'
        }
      ]
    });
    const after = sealBodyBeforeTools(before, 1);
    expect(after.turnProse?.[0]?.content).toContain('빌드를 실행');
  });
});
