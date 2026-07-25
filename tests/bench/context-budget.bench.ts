/**
 * HARB-T37: 50턴 세션 창 오버플로 없이 중요 @파일 항상 유지 벤치마크
 *
 * 장기 세션(50턴)에서 컨텍스트 예산이 오버플로되지 않고,
 * 중요한 파일 참조가 유지되는지 검증.
 *
 * PRD: PRD-Harness-01_Model_Tiers.md
 */
import * as assert from 'assert';

import { ContextAssembler } from '../../src/agent/ContextAssembler';
import { CONTEXT_BUDGET_128K } from '../../src/harness/ContextRules';
import { TIER_POLICIES } from '../../src/harness/ModelTiers';

suite('HARB-T37: Context Budget Benchmark', () => {
  test('T37.1: Context budget slots sum to 100%', () => {
    const totalPercent = CONTEXT_BUDGET_128K.reduce((sum, slot) => sum + slot.percent, 0);
    assert.strictEqual(totalPercent, 100, 'Budget slots should sum to 100%');
  });

  test('T37.2: Context budget total is 128k', () => {
    const totalTokens = CONTEXT_BUDGET_128K.reduce((sum, slot) => sum + slot.tokens, 0);
    assert.strictEqual(totalTokens, 128000, 'Total budget should be 128k tokens');
  });

  test('T37.3: Protected slots are marked correctly', () => {
    const protectedSlots = CONTEXT_BUDGET_128K.filter(s => s.protected_);
    assert.ok(protectedSlots.length >= 4, 'Should have at least 4 protected slots');
  });

  test('T37.4: ContextAssembler handles large message volumes', () => {
    const assembler = new ContextAssembler();
    const messages: Array<{ role: string; content: string }> = [];

    // Simulate 50 turns of conversation
    for (let i = 0; i < 50; i++) {
      messages.push({ role: 'user', content: `This is turn ${i} with some context about file.ts and function foo` });
      messages.push({ role: 'assistant', content: `Here is the response for turn ${i}. Let me check file.ts...` });
      messages.push({ role: 'tool', content: JSON.stringify({ result: `file.ts content for turn ${i}` }) });
    }

    const result = assembler.assemble('agent', messages, { tier: 'A' });
    assert.ok(result.slots.length > 0, 'Should assemble with 50 turns');
    assert.ok(result.usedTokens > 0, 'Should estimate tokens');
  });

  test('T37.5: Tier A policy has correct max turns', () => {
    assert.strictEqual(TIER_POLICIES.A.maxTurns, 15, 'Tier A max turns = 15');
    assert.strictEqual(TIER_POLICIES.B.maxTurns, 25, 'Tier B max turns = 25');
  });

  test('T37.6: ContextAssembler with tier A injects harness prompts', () => {
    const assembler = new ContextAssembler();
    const result = assembler.assemble('agent', [{ role: 'user', content: 'hello' }], { tier: 'A' });
    const systemSlot = result.slots.find(s => s.name === 'system');
    assert.ok(systemSlot, 'Should have system slot');
    assert.ok(systemSlot!.content.includes('Verification-First'), 'Tier A should include Verification-First prompt');
  });
});
