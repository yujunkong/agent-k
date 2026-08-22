/**
 * PROVIDER-005 — Provider endpoint presets for Add Provider UI.
 * Model ids are NOT preset — they come from /v1/models discovery only
 * (models change too often for a hard-coded catalog).
 */
import type { ProviderType } from './types';

export interface ProviderPreset {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
}

/** Endpoint chips only (stable URLs) — never invent model ids. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'openai', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com' },
  { id: 'claude', name: 'Claude', type: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    type: 'litellm',
    baseUrl: '',
  },
  { id: 'openrouter', name: 'OpenRouter', type: 'litellm', baseUrl: 'https://openrouter.ai/api' },
  { id: 'ollama', name: 'Ollama', type: 'ollama', baseUrl: 'http://127.0.0.1:11434' },
  { id: 'lmstudio', name: 'LM Studio', type: 'lmstudio', baseUrl: 'http://127.0.0.1:1234' },
  { id: 'groq', name: 'Groq', type: 'litellm', baseUrl: 'https://api.groq.com/openai' },
  { id: 'together', name: 'Together', type: 'litellm', baseUrl: 'https://api.together.xyz' },
];

/**
 * @deprecated Model presets removed — use /v1/models or a single manual name field.
 * Kept as empty for call-site compatibility.
 */
export const MANUAL_MODEL_PRESETS: Record<string, string[]> = {};

/** Always empty — models are discovered, not preset. */
export function manualModelPresetsForType(_type: ProviderType): string[] {
  return [];
}

/** Preset id for the custom OpenAI Compatible chip */
export const OPENAI_COMPATIBLE_PRESET_ID = 'openai-compatible';

export function getOpenAICompatiblePreset(): ProviderPreset {
  const preset = PROVIDER_PRESETS.find((p) => p.id === OPENAI_COMPATIBLE_PRESET_ID);
  if (!preset) throw new Error('OpenAI Compatible preset missing');
  return preset;
}
