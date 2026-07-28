/**
 * Thinking effort — model capability + DeepSeek max
 */
import * as assert from 'assert';
import {
  clampThinkingEffort,
  parseThinkingEffort,
  resolveThinkingCapability,
  thinkingEffortToProviderOpts,
  thinkingOptionsForModel,
} from '../../../src/agent/thinkingEffort';

suite('thinkingEffort', () => {
  test('parses max', () => {
    assert.strictEqual(parseThinkingEffort('max'), 'max');
    assert.strictEqual(parseThinkingEffort('nope'), 'medium');
  });

  test('DeepSeek → off / high / max', () => {
    const cap = resolveThinkingCapability('deepseek-v4-pro');
    assert.strictEqual(cap.supported, true);
    assert.strictEqual(cap.family, 'deepseek');
    assert.deepStrictEqual(cap.efforts, ['off', 'high', 'max']);
    assert.deepStrictEqual(
      thinkingOptionsForModel('deepseek-chat').map((o) => o.value),
      ['off', 'high', 'max']
    );
  });

  test('clamps medium → high on DeepSeek', () => {
    const cap = resolveThinkingCapability('deepseek-v4-flash');
    assert.strictEqual(clampThinkingEffort('medium', cap), 'high');
    assert.strictEqual(clampThinkingEffort('low', cap), 'high');
    assert.strictEqual(clampThinkingEffort('max', cap), 'max');
    assert.strictEqual(clampThinkingEffort('off', cap), 'off');
  });

  test('detects Qwen3 / OpenAI; hides gpt-4o', () => {
    assert.strictEqual(
      resolveThinkingCapability('mlx-community/Qwen3.6-35B-A3B-4bit').family,
      'qwen'
    );
    assert.strictEqual(resolveThinkingCapability('o3-mini').family, 'openai');
    assert.strictEqual(resolveThinkingCapability('gpt-4o').supported, false);
  });

  test('maps max to provider fields', () => {
    assert.deepStrictEqual(thinkingEffortToProviderOpts('max'), {
      enableThinking: true,
      reasoningEffort: 'max',
      thinkingBudget: 32768,
    });
    assert.strictEqual(thinkingEffortToProviderOpts('off').enableThinking, false);
  });
});
