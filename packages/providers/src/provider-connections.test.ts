/**
 * PROVIDER-002 / 003 / 004 / 009 — registry, connections, custom OpenAI Compatible.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetProviderConfigStore } from './configStore';
import {
  addCustomOpenAICompatibleConnection,
  addManualModel,
  applyProbeToConnection,
  getProviderConnections,
  migrateProfilesToConnections,
  reorderProviderConnections,
  upsertProviderConnection,
} from './ProviderConnections';
import { upsertProviderProfile } from './ProviderProfiles';
import { providerRegistry } from './ProviderRegistry';
import { mergeProbeHeaders, probeProviderEndpoint } from './providerProbe';

beforeEach(() => {
  resetProviderConfigStore();
  providerRegistry.clear();
});

describe('PROVIDER-002 ProviderRegistry', () => {
  it('registers OpenAI Compatible and typed providers via LiteLLMProvider', () => {
    const p = providerRegistry.register({
      id: 'p1',
      name: 'Local',
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:4000',
      model: 'qwen3-coder',
    });
    expect(p.type).toBe('litellm');
    expect(providerRegistry.getActiveProviderId()).toBe('p1');
    expect(providerRegistry.getProviderTypes()).toContain('lmstudio');
    expect(providerRegistry.getProviderTypes()).not.toContain('opencode-zen');

    providerRegistry.register({
      id: 'p2',
      name: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      model: 'gpt-4o',
    });
    expect(providerRegistry.setActive('p2')).toBe(true);
    expect(providerRegistry.getActive()?.id).toBe('p2');
    expect(providerRegistry.list()).toHaveLength(2);
  });
});

describe('PROVIDER-003 ProviderConnections + custom OpenAI Compatible', () => {
  it('adds a custom OpenAI Compatible connection with arbitrary base URL', () => {
    const conn = addCustomOpenAICompatibleConnection({
      name: 'My vLLM',
      baseUrl: 'http://10.0.0.5:8000/',
      apiKey: 'optional-key',
    });
    expect(conn.type).toBe('litellm');
    expect(conn.typeSource).toBe('manual');
    expect(conn.baseUrl).toBe('http://10.0.0.5:8000');
    expect(getProviderConnections()).toHaveLength(1);
  });

  it('adds manual models when /models is empty', () => {
    const conn = upsertProviderConnection({
      name: 'Anthropic',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      discoveredModels: [],
      status: 'offline',
    });
    addManualModel(conn.id, 'claude-sonnet-4-20250514');
    const again = getProviderConnections().find((c) => c.id === conn.id);
    expect(again?.manualModels).toContain('claude-sonnet-4-20250514');
  });

  it('applies probe results and migrates legacy profiles', () => {
    upsertProviderProfile({
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:52415',
      model: 'qwen3-coder',
      name: 'DGX Spark / qwen3-coder',
    });
    upsertProviderProfile({
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:52415',
      model: 'deepseek-v4',
      name: 'DGX Spark / deepseek-v4',
    });
    migrateProfilesToConnections();
    const conns = getProviderConnections();
    expect(conns).toHaveLength(1);
    expect(conns[0].discoveredModels).toHaveLength(2);

    const updated = applyProbeToConnection(conns[0].id, {
      ok: true,
      status: 200,
      detail: 'OK',
      modelIds: ['qwen3-coder', 'deepseek-v4', 'llama3'],
    });
    expect(updated?.status).toBe('connected');
    expect(updated?.discoveredModels).toContain('llama3');
  });

  it('records preferUserOrder on reorder', () => {
    const a = upsertProviderConnection({
      name: 'A',
      type: 'openai',
      baseUrl: 'https://api.openai.com',
    });
    const b = upsertProviderConnection({
      name: 'B',
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:4000',
    });
    const ordered = reorderProviderConnections([b.id, a.id]);
    expect(ordered[0].id).toBe(b.id);
    expect(ordered[0].priority).toBe(0);
  });
});

describe('PROVIDER-009 providerProbe', () => {
  it('merges Authorization Bearer when missing', () => {
    expect(mergeProbeHeaders('sk-x', { 'X-Custom': '1' })).toEqual({
      'X-Custom': '1',
      Authorization: 'Bearer sk-x',
    });
    expect(mergeProbeHeaders('sk-x', { Authorization: 'Bearer keep' }).Authorization).toBe(
      'Bearer keep',
    );
  });

  it('probes /v1/models via injected fetch', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch;

    const result = await probeProviderEndpoint(
      { baseUrl: 'http://127.0.0.1:4000', model: 'm1' },
      fetchImpl,
    );
    expect(result.ok).toBe(true);
    expect(result.health).toBe('connected');
    expect(result.modelIds).toEqual(['m1', 'm2']);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/v1/models',
      expect.any(Object),
    );
  });

  it('classifies auth failure from probe', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('nope', { status: 401 }),
    ) as unknown as typeof fetch;
    const result = await probeProviderEndpoint(
      { baseUrl: 'https://api.openai.com' },
      fetchImpl,
    );
    expect(result.ok).toBe(false);
    expect(result.health).toBe('auth_failed');
  });
});

describe('migrateFlatSettingsToConnections', () => {
  it('lifts flat settings into a connection when connections empty', async () => {
    const { resetProviderConfigStore, setProviderConfigStore, MemoryProviderConfigStore } = await import('./configStore');
    const { getProviderConnections, migrateFlatSettingsToConnections } = await import('./ProviderConnections');
    const store = resetProviderConfigStore();
    store.update({
      'agent-k.provider.type': 'litellm',
      'agent-k.provider.baseUrl': 'https://example.test',
      'agent-k.provider.model': 'hy3-free',
      'agent-k.provider.availableModels': ['big-pickle', 'hy3-free'],
    });
    migrateFlatSettingsToConnections();
    const list = getProviderConnections();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('pc-settings-active');
    expect(list[0].baseUrl).toBe('https://example.test');
    expect(list[0].discoveredModels).toEqual(expect.arrayContaining(['big-pickle', 'hy3-free']));
  });
});
