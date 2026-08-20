/**
 * Unit: Zero-config provider detection, model normalize, health labels.
 */
import * as assert from 'assert';

suite('detectProviderType', () => {
  test('detects official OpenAI and Anthropic hosts', async () => {
    const { detectProviderType } = await import('../../../src/providers/detectProviderType');
    assert.strictEqual(detectProviderType('https://api.openai.com').type, 'openai');
    assert.strictEqual(detectProviderType('https://api.openai.com').confidence, 'high');
    assert.strictEqual(detectProviderType('https://api.anthropic.com').type, 'anthropic');
  });

  test('falls back to OpenAI Compatible for ambiguous gateways', async () => {
    const { detectProviderType } = await import('../../../src/providers/detectProviderType');
    const r = detectProviderType('https://openrouter.ai/api/v1');
    assert.strictEqual(r.type, 'litellm');
    assert.strictEqual(r.ambiguous, true);
    assert.strictEqual(r.confidence, 'low');
    assert.ok(detectProviderType('https://api.groq.com/openai').ambiguous);
    assert.ok(detectProviderType('https://my-resource.openai.azure.com').ambiguous);
  });

  test('detects local Ollama / LM Studio / loopback', async () => {
    const { detectProviderType, isLocalBaseUrl } = await import('../../../src/providers/detectProviderType');
    assert.strictEqual(detectProviderType('http://127.0.0.1:11434').type, 'ollama');
    assert.strictEqual(detectProviderType('http://localhost:1234').type, 'lmstudio');
    assert.ok(isLocalBaseUrl('http://192.168.1.10:8000'));
    const local = detectProviderType('http://127.0.0.1:52415');
    assert.strictEqual(local.type, 'litellm');
    assert.strictEqual(local.ambiguous, false);
  });
});

suite('normalizeModelId', () => {
  test('treats qwen3-coder variants as the same model', async () => {
    const { displayModelName, modelIdsMatch, normalizeModelId } = await import(
      '../../../src/providers/normalizeModelId'
    );
    assert.strictEqual(normalizeModelId('qwen3-coder'), 'qwen3-coder');
    assert.strictEqual(normalizeModelId('Qwen3-Coder'), 'qwen3-coder');
    assert.strictEqual(normalizeModelId('Qwen/Qwen3-Coder'), 'qwen3-coder');
    assert.ok(modelIdsMatch('Qwen/Qwen3-Coder', 'qwen3_coder'));
    assert.strictEqual(displayModelName('Qwen/Qwen3-Coder'), 'Qwen3-Coder');
  });
});

suite('providerStatus', () => {
  test('classifies auth / rate-limit / offline', async () => {
    const { classifyProbeResult, formatProviderStatusLine, isModelListStale } = await import(
      '../../../src/providers/providerStatus'
    );
    assert.strictEqual(classifyProbeResult(true, 200), 'connected');
    assert.strictEqual(classifyProbeResult(false, 401), 'auth_failed');
    assert.strictEqual(classifyProbeResult(false, 403), 'auth_failed');
    assert.strictEqual(classifyProbeResult(false, 429), 'rate_limited');
    assert.strictEqual(classifyProbeResult(false, 503), 'offline');
    assert.strictEqual(
      formatProviderStatusLine({ status: 'connected', modelCount: 12, isLocal: true, modelsFetchedAt: Date.now() }),
      'Connected · 12 models · Local'
    );
    assert.ok(isModelListStale(Date.now() - 25 * 60 * 60 * 1000));
    assert.strictEqual(
      formatProviderStatusLine({
        status: 'connected',
        modelCount: 6,
        modelsFetchedAt: Date.now() - 25 * 60 * 60 * 1000
      }),
      'Connected · model list stale'
    );
    assert.strictEqual(
      formatProviderStatusLine({ status: 'auth_failed', modelCount: 0 }),
      'Auth failed'
    );
  });
});

suite('inferModelTags', () => {
  test('tags local / fast / reasoning', async () => {
    const { inferModelTags } = await import('../../../src/providers/modelTags');
    const local = inferModelTags({ modelId: 'qwen3-coder', isLocalProvider: true });
    assert.ok(local.includes('local'));
    const fast = inferModelTags({ modelId: 'gpt-4o-mini' });
    assert.ok(fast.includes('fast'));
    assert.ok(fast.includes('cheap'));
    const reason = inferModelTags({ modelId: 'deepseek-r1' });
    assert.ok(reason.includes('reasoning'));
  });
});
