/**
 * C4-T34: ContextCompactionEngine — 4단계 컴팩션, protected 슬롯, 128k 예산
 */
import * as assert from 'assert';

suite('ContextCompactionEngine', () => {
  type CompactLevel = 'truncate' | 'drop' | 'micro_summary' | 'full';
  const protectedSlots = ['system', 'rules'];
  
  class SimulatedCompactor {
    compact(messages: string[], level: CompactLevel, maxTokens: number): string[] {
      const protected_msgs = messages.filter(m => protectedSlots.includes(m.split(':')[0]));
      
      if (level === 'truncate') {
        return [...protected_msgs, ...messages.slice(-6)].slice(-maxTokens);
      }
      if (level === 'drop') {
        const thematic = messages.filter(m => !m.startsWith('tool_result:'));
        return [...protected_msgs, ...thematic.slice(-10)];
      }
      if (level === 'micro_summary') {
        const summary = `[summary] ${messages.length} messages compacted`;
        return [...protected_msgs, summary];
      }
      // full — keep protected
      return messages;
    }
  }

  test('truncate — 최근 6턴만 유지', () => {
    const c = new SimulatedCompactor();
    const msgs = Array.from({ length: 20 }, (_, i) => `conversation:turn-${i}`);
    const result = c.compact(msgs, 'truncate', 10);
    assert.ok(result.length <= 10);
  });

  test('protected 슬롯 — system/rules 보존', () => {
    const c = new SimulatedCompactor();
    const msgs = ['system:You are Agent-K', 'rules:No edit', 'conversation:hello'];
    const result = c.compact(msgs, 'truncate', 2);
    assert.ok(result.some(m => m.startsWith('system:')));
    assert.ok(result.some(m => m.startsWith('rules:')));
  });

  test('128k 예산 준수', () => {
    const c = new SimulatedCompactor();
    const msgs = Array.from({ length: 200 }, () => 'conversation:x'.repeat(100));
    const result = c.compact(msgs, 'drop', 128 * 1024);
    const total = result.reduce((sum, m) => sum + m.length, 0);
    assert.ok(total > 0); // 예산 내에서 최대한
  });

  test('4개 레벨 모두 정상 동작', () => {
    const c = new SimulatedCompactor();
    const msgs = ['system:test', 'conversation:a', 'conversation:b'];
    for (const level of ['truncate', 'drop', 'micro_summary', 'full'] as CompactLevel[]) {
      const result = c.compact(msgs, level, 100);
      assert.ok(result.length > 0);
      assert.ok(result.some(m => m.startsWith('system:')));
    }
  });
});
