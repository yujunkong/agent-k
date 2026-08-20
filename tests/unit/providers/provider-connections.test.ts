/**
 * Unit: connection registry, unified model catalog, resolver ranking.
 */
import * as assert from 'assert';

suite('ProviderConnections + ModelRegistry', () => {
  setup(async () => {
    const { configManager } = await import('../../../src/core/ConfigManager');
    configManager.resetAll();
  });

  test('dedupes the same model across providers after normalize', async () => {
    const { upsertProviderConnection } = await import('../../../src/providers/ProviderConnections');
    const { listUnifiedModels } = await import('../../../src/providers/ModelRegistry');
    upsertProviderConnection({
      name: 'DGX Spark',
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:52415',
      discoveredModels: ['Qwen/Qwen3-Coder'],
      status: 'connected'
    });
    upsertProviderConnection({
      name: 'OpenRouter',
      type: 'litellm',
      baseUrl: 'https://openrouter.ai/api',
      discoveredModels: ['qwen3-coder'],
      status: 'connected'
    });
    const unified = listUnifiedModels();
    const hit = unified.find((m) => m.canonicalId === 'qwen3-coder');
    assert.ok(hit);
    assert.strictEqual(hit!.providers.length, 2);
    assert.ok(hit!.tags.includes('local'));
  });

  test('manual model add works when /models is empty', async () => {
    const { addManualModel, getProviderConnections, upsertProviderConnection } = await import(
      '../../../src/providers/ProviderConnections'
    );
    const conn = upsertProviderConnection({
      name: 'Anthropic',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      discoveredModels: [],
      status: 'offline'
    });
    addManualModel(conn.id, 'claude-sonnet-4-20250514');
    const again = getProviderConnections().find((c) => c.id === conn.id);
    assert.ok(again?.manualModels.includes('claude-sonnet-4-20250514'));
  });

  test('migrates legacy per-model profiles into one connection per endpoint', async () => {
    const { upsertProviderProfile } = await import('../../../src/providers/ProviderProfiles');
    const { getProviderConnections, migrateProfilesToConnections } = await import(
      '../../../src/providers/ProviderConnections'
    );
    upsertProviderProfile({
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:52415',
      model: 'qwen3-coder',
      name: 'DGX Spark / qwen3-coder'
    });
    upsertProviderProfile({
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:52415',
      model: 'deepseek-v4',
      name: 'DGX Spark / deepseek-v4'
    });
    migrateProfilesToConnections();
    const conns = getProviderConnections();
    assert.strictEqual(conns.length, 1);
    assert.strictEqual(conns[0].discoveredModels.length, 2);
  });
});

suite('ModelResolver ranking', () => {
  setup(async () => {
    const { configManager } = await import('../../../src/core/ConfigManager');
    configManager.resetAll();
  });

  test('prefers local over remote by default', async () => {
    const { upsertProviderConnection } = await import('../../../src/providers/ProviderConnections');
    const { rankConnections, resolveConnectionForModel } = await import('../../../src/providers/ModelResolver');
    const local = upsertProviderConnection({
      name: 'DGX Spark',
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:52415',
      discoveredModels: ['qwen3-coder'],
      lastSuccessAt: 1,
      priority: 5
    });
    const remote = upsertProviderConnection({
      name: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com',
      discoveredModels: ['qwen3-coder'],
      lastSuccessAt: Date.now(),
      priority: 0
    });
    const ranked = rankConnections([remote, local]);
    assert.strictEqual(ranked[0].id, local.id);
    const resolved = resolveConnectionForModel('Qwen/Qwen3-Coder');
    assert.strictEqual(resolved?.connection.id, local.id);
    assert.strictEqual(resolved?.originalModelId, 'qwen3-coder');
  });

  test('drag order wins when preferUserOrder is set', async () => {
    const { PREFER_USER_ORDER_KEY, reorderProviderConnections, upsertProviderConnection } = await import(
      '../../../src/providers/ProviderConnections'
    );
    const { rankConnections } = await import('../../../src/providers/ModelResolver');
    const { configManager } = await import('../../../src/core/ConfigManager');
    const local = upsertProviderConnection({
      name: 'DGX Spark',
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:52415',
      discoveredModels: ['gpt-4o']
    });
    const remote = upsertProviderConnection({
      name: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com',
      discoveredModels: ['gpt-4o']
    });
    reorderProviderConnections([remote.id, local.id]);
    assert.strictEqual(configManager.get(PREFER_USER_ORDER_KEY), true);
    const { getProviderConnections } = await import('../../../src/providers/ProviderConnections');
    const ranked = rankConnections(getProviderConnections());
    assert.strictEqual(ranked[0].id, remote.id);
  });
});
