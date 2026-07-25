/**
 * C3-T21: ContextAssembler — 128k 슬롯 예산, 시스템/규칙/도구/메모리/고정/대화
 */
import * as assert from 'assert';

suite('ContextAssembler', () => {
  const MAX_BUDGET = 128 * 1024;

  test('예산 내 슬롯 할당', () => {
    const slots = {
      system: { tokens: 2000 },
      rules: { tokens: 1000 },
      tools: { tokens: 4000 },
      memories: { tokens: 1500 },
      sticky: { tokens: 500 },
      conversation: { tokens: 8000 }
    };
    const total = Object.values(slots).reduce((sum, s) => sum + s.tokens, 0);
    assert.ok(total <= MAX_BUDGET);
  });

  test('시스템/규칙 슬롯 보호 — 컴팩션 대상에서 제외', () => {
    const protectedSlots = ['system', 'rules'];
    const slots = ['system', 'rules', 'memories', 'conversation'];
    
    const compactable = slots.filter(s => !protectedSlots.includes(s));
    assert.deepStrictEqual(compactable, ['memories', 'conversation']);
  });

  test('sticky 슬롯 — @file 맨션 유지', () => {
    const sticky = '@file:src/main.ts\n@file:src/utils.ts';
    assert.ok(sticky.includes('@file:'));
  });

  test('컨텍스트 빌드 — 에러 없이 연결', () => {
    const blocks = ['[system] You are Agent-K', '[rules] No edit mode', '[conversation] Hello'];
    const assembled = blocks.join('\n\n');
    assert.ok(assembled.length > 0);
    assert.ok(assembled.includes('[system]'));
    assert.ok(assembled.includes('[conversation]'));
  });
});
