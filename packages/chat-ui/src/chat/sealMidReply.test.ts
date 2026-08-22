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

describe('sealBodyBeforeTools mid-reply visibility', () => {
  it('keeps Korean dig-bridge as turnProse even when explore tools already ran', () => {
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
    // Must NOT only live inside Thought detail
    const thought = (after.steps || []).find((s) => s.kind === 'thinking');
    expect(thought?.detail || '').not.toContain('테스트 파일');
  });
});
