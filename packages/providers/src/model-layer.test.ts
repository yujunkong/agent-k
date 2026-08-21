/**
 * MODEL-001…011 / CFG-008 / UXPROV-001…004 — unit tests.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAvailableModels,
  mergeAvailableModels,
  persistSelectedModel,
  refreshAvailableModels,
  setAvailableModels,
  testProviderConnection,
} from './availableModels';
import { resetProviderConfigStore } from './configStore';
import {
  findConnectionsForModel,
  findUnifiedModel,
  listUnifiedModels,
} from './ModelRegistry';
import {
  rankConnections,
  resolveAndActivateModel,
  resolveConnectionForModel,
} from './ModelResolver';
import { ModelRouter } from './ModelRouter';
import {
  getAIConfiguration,
  migrateLegacyProviderProfiles,
  resolveModelProfiles,
  setRoutingRule,
  upsertModelProfile,
} from './ModelRouting';
import { getMaxTurnsForModel, inferTierFromModelId } from './ModelTiers';
import { clearModelContextCache, resolveModelContextInfo } from './modelContextInfo';
import { filterModelOptions, unifiedModelsToPickerOptions } from './modelPicker';
import { inferModelTags } from './modelTags';
import {
  getPreferUserOrder,
  reorderProviderConnections,
  upsertProviderConnection,
} from './ProviderConnections';
import { getProviderConfiguration, updateProviderConfiguration } from './providerConfig';
import {
  clampThinkingEffort,
  resolveThinkingCapability,
  thinkingOptionsForModel,
} from './thinkingEffort';

beforeEach(() => {
  resetProviderConfigStore();
  clearModelContextCache();
});

describe('MODEL-005 modelTags', () => {
  it('tags local / fast / reasoning', () => {
    expect(inferModelTags({ modelId: 'qwen2.5-7b', isLocalProvider: true })).toEqual(
      expect.arrayContaining(['local', 'fast', 'cheap']),
    );
    expect(inferModelTags({ modelId: 'o3-mini' })).toContain('reasoning');
  });
});

describe('MODEL-001 ModelRegistry', () => {
  it('unifies the same model across local + remote connections', () => {
    upsertProviderConnection({
      name: 'Local',
      type: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      discoveredModels: ['Qwen/Qwen3-Coder'],
      priority: 1,
    });
    upsertProviderConnection({
      name: 'Cloud',
      type: 'openai',
      baseUrl: 'https://api.openai.com',
      discoveredModels: ['qwen3-coder'],
      priority: 0,
    });

    const models = listUnifiedModels();
    const hit = findUnifiedModel('Qwen3-Coder');
    expect(hit).toBeDefined();
    expect(hit!.providers.length).toBe(2);
    expect(hit!.tags).toContain('local');
    expect(models.some((m) => m.canonicalId === hit!.canonicalId)).toBe(true);
    expect(findConnectionsForModel('qwen3_coder').length).toBe(2);
  });
});

describe('MODEL-002 ModelResolver / UXPROV-006', () => {
  it('prefers local over remote, then user order when preferUserOrder', () => {
    const local = upsertProviderConnection({
      name: 'Local',
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:8000',
      discoveredModels: ['flash'],
      priority: 5,
    });
    const remote = upsertProviderConnection({
      name: 'Remote',
      type: 'openai',
      baseUrl: 'https://api.openai.com',
      discoveredModels: ['flash'],
      priority: 0,
      lastSuccessAt: Date.now(),
    });

    const resolved = resolveConnectionForModel('flash');
    expect(resolved?.connection.id).toBe(local.id);

    reorderProviderConnections([remote.id, local.id]);
    expect(getPreferUserOrder()).toBe(true);
    const ranked = rankConnections([local, remote]);
    expect(ranked[0].id).toBe(remote.id);

    const activated = resolveAndActivateModel('flash');
    expect(activated?.model).toBe('flash');
  });
});

describe('MODEL-003 ModelRouter + ModelRouting', () => {
  it('routes by task / complexity / retry', () => {
    const router = new ModelRouter({ tierAModel: 'a', tierBModel: 'b' });
    expect(router.route({ taskType: 'plan' }).tier).toBe('B');
    expect(router.route({ complexity: 'complex' }).model).toBe('b');
    expect(router.route({ retryCount: 3 }).tier).toBe('B');
    expect(router.route({ forceTier: 'C' }).tier).toBe('C');
  });

  it('stores role routing via ProviderConfigStore', () => {
    upsertProviderConnection({
      name: 'C',
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:9',
      discoveredModels: ['m1'],
    });
    migrateLegacyProviderProfiles();
    const cfg = getAIConfiguration();
    expect(cfg.profiles.length).toBeGreaterThan(0);
    const profile = upsertModelProfile({
      name: 'Chat',
      providerProfileId: cfg.profiles[0].providerProfileId,
    });
    setRoutingRule('chat', profile.id);
    expect(resolveModelProfiles('chat')[0]?.id).toBe(profile.id);
  });
});

describe('MODEL-006/007 availableModels', () => {
  it('prefers unified connection catalog; falls back to persisted list', () => {
    // No connections → persisted availableModels list
    expect(setAvailableModels(['z', 'a'])).toEqual(['a', 'z']);
    expect(mergeAvailableModels(['b'])).toEqual(['a', 'b', 'z']);

    upsertProviderConnection({
      name: 'L',
      type: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      discoveredModels: ['alpha', 'beta'],
    });
    // Unified registry wins over manual setAvailableModels
    expect(getAvailableModels()).toEqual(['alpha', 'beta']);
    persistSelectedModel('alpha');
    expect(getAvailableModels()).toEqual(['alpha', 'beta']);
  });
});

describe('UXPROV-001/002 connection test + refresh', () => {
  it('probes with injected fetch and refreshes discovered models', async () => {
    const conn = upsertProviderConnection({
      name: 'Mock',
      type: 'litellm',
      baseUrl: 'http://mock.local:8000',
      discoveredModels: [],
    });

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      expect(url).toContain('/v1/models');
      return new Response(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const test = await testProviderConnection({
      baseUrl: conn.baseUrl,
      fetchImpl,
    });
    expect(test.ok).toBe(true);
    expect(test.modelIds).toEqual(['m1', 'm2']);

    const refreshed = await refreshAvailableModels({
      connectionId: conn.id,
      baseUrl: conn.baseUrl,
      fetchImpl,
    });
    expect(refreshed.ok).toBe(true);
    expect(getAvailableModels()).toEqual(['m1', 'm2']);
  });
});

describe('UXPROV-003 modelPicker', () => {
  it('filters by query and tag', () => {
    upsertProviderConnection({
      name: 'LocalBox',
      type: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      discoveredModels: ['qwen2.5-7b', 'gpt-4o'],
    });
    const options = unifiedModelsToPickerOptions();
    expect(filterModelOptions(options, { query: 'qwen' }).length).toBe(1);
    expect(filterModelOptions(options, { tag: 'local' }).length).toBeGreaterThan(0);
    expect(filterModelOptions(options, { query: 'nope' })).toEqual([]);
  });
});

describe('MODEL-008 thinkingEffort', () => {
  it('resolves capability and clamps DeepSeek efforts', () => {
    const ds = resolveThinkingCapability('deepseek-v4');
    expect(ds.supported).toBe(true);
    expect(ds.family).toBe('deepseek');
    expect(clampThinkingEffort('low', ds)).toBe('high');
    expect(thinkingOptionsForModel('o3-mini').map((o) => o.value)).toContain('medium');
    expect(resolveThinkingCapability('plain-coder').supported).toBe(false);
  });
});

describe('MODEL-009 ModelTiers', () => {
  it('infers tier and maxTurns', () => {
    expect(inferTierFromModelId('gpt-4o')).toBe('B');
    expect(inferTierFromModelId('flash-mini')).toBe('A');
    expect(getMaxTurnsForModel('claude-3-opus')).toBe(25);
    expect(getMaxTurnsForModel('tiny')).toBe(15);
  });
});

describe('MODEL-011 modelContextInfo', () => {
  it('uses known map when endpoint is dead', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('offline');
    };
    const info = await resolveModelContextInfo({
      providerType: 'openai',
      baseUrl: 'http://127.0.0.1:9',
      model: 'gpt-4o',
      fetchImpl,
    });
    expect(info.source).toBe('known');
    expect(info.maxInputTokens).toBe(128_000);

    const cached = await resolveModelContextInfo({
      providerType: 'openai',
      baseUrl: 'http://127.0.0.1:9',
      model: 'gpt-4o',
      fetchImpl,
    });
    expect(cached).toBe(info);
  });
});

describe('CFG-008 providerConfig', () => {
  it('reads and updates active provider fields', () => {
    updateProviderConfiguration({
      type: 'litellm',
      baseUrl: 'http://127.0.0.1:8000/',
      model: 'm',
      apiKey: 'k',
      preferUserOrder: true,
    });
    const snap = getProviderConfiguration();
    expect(snap.type).toBe('litellm');
    expect(snap.baseUrl).toBe('http://127.0.0.1:8000');
    expect(snap.model).toBe('m');
    expect(snap.preferUserOrder).toBe(true);
  });
});
