/**
 * PROVIDER-001 / 005 / 006 / 007 / normalize — unit tests.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetProviderConfigStore } from './configStore';
import { detectProviderType, isLocalBaseUrl } from './detectProviderType';
import { displayModelName, modelIdsMatch, normalizeModelId } from './normalizeModelId';
import { PROVIDER_FIELDS, PROVIDER_LABELS, isProviderType } from './providerFields';
import {
  OPENAI_COMPATIBLE_PRESET_ID,
  PROVIDER_PRESETS,
  getOpenAICompatiblePreset,
  manualModelPresetsForType,
} from './providerPresets';
import {
  classifyProbeResult,
  formatProviderStatusLine,
  isModelListStale,
} from './providerStatus';

beforeEach(() => {
  resetProviderConfigStore();
});

describe('PROVIDER-001 detectProviderType', () => {
  it('detects official OpenAI and Anthropic hosts', () => {
    expect(detectProviderType('https://api.openai.com').type).toBe('openai');
    expect(detectProviderType('https://api.openai.com').confidence).toBe('high');
    expect(detectProviderType('https://api.anthropic.com').type).toBe('anthropic');
  });

  it('falls back to OpenAI Compatible for ambiguous gateways', () => {
    const r = detectProviderType('https://openrouter.ai/api/v1');
    expect(r.type).toBe('litellm');
    expect(r.ambiguous).toBe(true);
    expect(r.confidence).toBe('low');
    expect(detectProviderType('https://api.groq.com/openai').ambiguous).toBe(true);
    expect(detectProviderType('https://my-resource.openai.azure.com').ambiguous).toBe(true);
  });

  it('detects local Ollama / LM Studio / loopback', () => {
    expect(detectProviderType('http://127.0.0.1:11434').type).toBe('ollama');
    expect(detectProviderType('http://localhost:1234').type).toBe('lmstudio');
    expect(isLocalBaseUrl('http://192.168.1.10:8000')).toBe(true);
    const local = detectProviderType('http://127.0.0.1:52415');
    expect(local.type).toBe('litellm');
    expect(local.ambiguous).toBe(false);
  });

  it('maps OpenCode hosts to OpenAI Compatible (015 skipped)', () => {
    const r = detectProviderType('https://opencode.ai/zen');
    expect(r.type).toBe('litellm');
    expect(r.ambiguous).toBe(true);
  });
});

describe('normalizeModelId', () => {
  it('treats qwen3-coder variants as the same model', () => {
    expect(normalizeModelId('qwen3-coder')).toBe('qwen3-coder');
    expect(normalizeModelId('Qwen3-Coder')).toBe('qwen3-coder');
    expect(normalizeModelId('Qwen/Qwen3-Coder')).toBe('qwen3-coder');
    expect(modelIdsMatch('Qwen/Qwen3-Coder', 'qwen3_coder')).toBe(true);
    expect(displayModelName('Qwen/Qwen3-Coder')).toBe('Qwen3-Coder');
  });
});

describe('PROVIDER-005 / 006 presets and fields', () => {
  it('exposes OpenAI Compatible preset and label for custom endpoints', () => {
    const preset = getOpenAICompatiblePreset();
    expect(preset.id).toBe(OPENAI_COMPATIBLE_PRESET_ID);
    expect(preset.type).toBe('litellm');
    expect(PROVIDER_LABELS.litellm).toBe('OpenAI Compatible');
    expect(PROVIDER_FIELDS.litellm.needsBaseUrl).toBe(true);
    expect(PROVIDER_FIELDS.litellm.apiKeyOptional).toBe(true);
    expect(PROVIDER_PRESETS.some((p) => p.id === 'openai')).toBe(true);
    expect(isProviderType('litellm')).toBe(true);
    expect(isProviderType('opencode-zen')).toBe(false);
    expect(manualModelPresetsForType('openai').length).toBeGreaterThan(0);
  });
});

describe('PROVIDER-007 providerStatus', () => {
  it('classifies auth / rate-limit / offline and formats status lines', () => {
    expect(classifyProbeResult(true, 200)).toBe('connected');
    expect(classifyProbeResult(false, 401)).toBe('auth_failed');
    expect(classifyProbeResult(false, 403)).toBe('auth_failed');
    expect(classifyProbeResult(false, 429)).toBe('rate_limited');
    expect(classifyProbeResult(false, 503)).toBe('offline');
    expect(
      formatProviderStatusLine({
        status: 'connected',
        modelCount: 12,
        isLocal: true,
        modelsFetchedAt: Date.now(),
      }),
    ).toBe('Connected · 12 models · Local');
    expect(isModelListStale(Date.now() - 25 * 60 * 60 * 1000)).toBe(true);
    expect(
      formatProviderStatusLine({
        status: 'connected',
        modelCount: 6,
        modelsFetchedAt: Date.now() - 25 * 60 * 60 * 1000,
      }),
    ).toBe('Connected · model list stale');
    expect(formatProviderStatusLine({ status: 'auth_failed', modelCount: 0 })).toBe('Auth failed');
  });
});
