/**
 * Runnable smoke demo for PROVIDER-001…014 + custom OpenAI Compatible.
 *
 * Starts a local mock OpenAI-compatible /v1/models server, then exercises:
 * detect → presets/fields → custom connection → probe → apply → registry.
 *
 * Run: npm run smoke -w @agent-k/providers
 */
import http from 'node:http';
import {
  PROVIDER_FIELDS,
  PROVIDER_LABELS,
  PROVIDER_PRESETS,
  addCustomOpenAICompatibleConnection,
  applyProbeToConnection,
  detectProviderType,
  formatProviderStatusLine,
  getOpenAICompatiblePreset,
  getProviderConnections,
  probeProviderEndpoint,
  providerRegistry,
  resetProviderConfigStore,
} from './index';

function log(section: string, detail?: unknown): void {
  console.log(`\n=== ${section} ===`);
  if (detail !== undefined) {
    console.log(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
  }
}

async function startMockOpenAICompatibleServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/v1/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: [
            { id: 'qwen3-coder' },
            { id: 'deepseek-v4' },
            { id: 'local-demo-model' },
          ],
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind mock server');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function main(): Promise<void> {
  resetProviderConfigStore();
  providerRegistry.clear();

  log('PROVIDER-001 detectProviderType');
  const samples = [
    'https://api.openai.com',
    'https://api.anthropic.com',
    'http://127.0.0.1:11434',
    'http://localhost:1234',
    'https://openrouter.ai/api',
    'http://10.0.0.5:8000',
  ];
  for (const url of samples) {
    const d = detectProviderType(url);
    console.log(
      `  ${url}\n    → type=${d.type} (${PROVIDER_LABELS[d.type]}) confidence=${d.confidence} ambiguous=${d.ambiguous}`,
    );
  }

  log('PROVIDER-005/006 presets & OpenAI Compatible fields');
  const preset = getOpenAICompatiblePreset();
  console.log(`  preset: ${preset.name} type=${preset.type} baseUrl=${preset.baseUrl}`);
  console.log(`  label(litellm)=${PROVIDER_LABELS.litellm}`);
  console.log(`  fields:`, PROVIDER_FIELDS.litellm);
  console.log(
    `  all presets:`,
    PROVIDER_PRESETS.map((p) => `${p.name}[${p.type}]`).join(', '),
  );

  const mock = await startMockOpenAICompatibleServer();
  log('Mock OpenAI Compatible server', mock.baseUrl);

  try {
    log('PROVIDER-003 addCustomOpenAICompatibleConnection');
    const conn = addCustomOpenAICompatibleConnection({
      name: 'Demo vLLM',
      baseUrl: `${mock.baseUrl}/`,
      apiKey: 'demo-key',
    });
    console.log(`  id=${conn.id}`);
    console.log(`  name=${conn.name}`);
    console.log(`  type=${conn.type} (${PROVIDER_LABELS[conn.type]})`);
    console.log(`  typeSource=${conn.typeSource}`);
    console.log(`  baseUrl=${conn.baseUrl}`);
    console.log(`  status=${conn.status}`);

    log('PROVIDER-009 probeProviderEndpoint (/v1/models)');
    const probe = await probeProviderEndpoint({
      baseUrl: conn.baseUrl,
      apiKey: conn.apiKey,
      model: 'qwen3-coder',
    });
    console.log(`  ok=${probe.ok} status=${probe.status} health=${probe.health}`);
    console.log(`  detail=${probe.detail}`);
    console.log(`  modelIds=${JSON.stringify(probe.modelIds)}`);

    log('PROVIDER-003 applyProbeToConnection');
    const updated = applyProbeToConnection(conn.id, {
      ok: probe.ok,
      status: probe.status,
      detail: probe.detail,
      modelIds: probe.modelIds,
    });
    if (!updated) throw new Error('applyProbeToConnection returned undefined');
    console.log(`  status=${updated.status}`);
    console.log(`  discoveredModels=${JSON.stringify(updated.discoveredModels)}`);
    console.log(
      `  statusLine=${formatProviderStatusLine({
        status: updated.status,
        modelCount: updated.discoveredModels.length,
        isLocal: true,
        modelsFetchedAt: updated.modelsFetchedAt,
      })}`,
    );

    log('PROVIDER-002 ProviderRegistry.register (litellm wire client)');
    const provider = providerRegistry.register({
      id: 'demo-provider',
      name: updated.name,
      type: updated.type,
      baseUrl: updated.baseUrl,
      apiKey: updated.apiKey,
      model: updated.discoveredModels[0] || 'local-demo-model',
    });
    console.log(`  registered id=${provider.id} type=${provider.type}`);
    console.log(`  active=${providerRegistry.getActiveProviderId()}`);
    console.log(`  providerTypes=${providerRegistry.getProviderTypes().join(', ')}`);

    log('Connections snapshot');
    console.log(
      getProviderConnections().map((c) => ({
        name: c.name,
        type: c.type,
        baseUrl: c.baseUrl,
        status: c.status,
        models: c.discoveredModels,
      })),
    );

    console.log('\n✅ smoke OK — OpenAI Compatible custom connection + probe verified\n');
  } finally {
    await mock.close();
  }
}

main().catch((err) => {
  console.error('\n❌ smoke FAILED\n', err);
  process.exitCode = 1;
});
