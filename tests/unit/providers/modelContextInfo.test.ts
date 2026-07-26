/**
 * Unit: provider-aware model context extraction helpers (no network).
 */
import * as assert from 'assert';

suite('modelContextInfo known maps / matching', () => {
  test('KNOWN-style prefix match via resolve fallback path', async () => {
    // Import after compile path — use source via dynamic import in tsx tests
    const { resolveModelContextInfo, clearModelContextCache } = await import(
      '../../src/providers/modelContextInfo'
    );
    clearModelContextCache();
    // Unreachable base URL → known map for openai model ids
    const info = await resolveModelContextInfo({
      providerType: 'openai',
      baseUrl: 'http://127.0.0.1:9',
      model: 'gpt-4o-2024-08-06',
      fallbackTokens: 11111,
      signal: AbortSignal.timeout(200)
    });
    assert.strictEqual(info.maxInputTokens, 128000);
    assert.strictEqual(info.source, 'known');
  });

  test('unknown local model uses fallback', async () => {
    const { resolveModelContextInfo, clearModelContextCache } = await import(
      '../../src/providers/modelContextInfo'
    );
    clearModelContextCache();
    const info = await resolveModelContextInfo({
      providerType: 'lmstudio',
      baseUrl: 'http://127.0.0.1:9',
      model: 'my-custom-local-gguf',
      fallbackTokens: 65536,
      signal: AbortSignal.timeout(200)
    });
    assert.strictEqual(info.maxInputTokens, 65536);
    assert.strictEqual(info.source, 'fallback');
  });
});
