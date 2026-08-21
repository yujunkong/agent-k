/**
 * PROVIDER-005 — Common provider / model presets for Add Provider UI.
 * OpenAI Compatible is first-class for custom base URL endpoints.
 */
import type { ProviderType } from './types';

export interface ProviderPreset {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
}

/** Standard presets — Add Provider chips */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'openai', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com' },
  { id: 'claude', name: 'Claude', type: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    type: 'litellm',
    baseUrl: 'http://127.0.0.1:4000',
  },
  { id: 'openrouter', name: 'OpenRouter', type: 'litellm', baseUrl: 'https://openrouter.ai/api' },
  { id: 'ollama', name: 'Ollama', type: 'ollama', baseUrl: 'http://127.0.0.1:11434' },
  { id: 'lmstudio', name: 'LM Studio', type: 'lmstudio', baseUrl: 'http://127.0.0.1:1234' },
  { id: 'groq', name: 'Groq', type: 'litellm', baseUrl: 'https://api.groq.com/openai' },
  { id: 'together', name: 'Together', type: 'litellm', baseUrl: 'https://api.together.xyz' },
];

/** Manual model candidates when /v1/models is empty or unsupported */
export const MANUAL_MODEL_PRESETS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-latest'],
  qwen: ['qwen3-coder', 'qwen3.6-35b-a3b', 'mlx-community/Qwen3.6-35B-A3B-4bit'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4'],
};

export function manualModelPresetsForType(type: ProviderType): string[] {
  if (type === 'openai') return MANUAL_MODEL_PRESETS.openai;
  if (type === 'anthropic') return MANUAL_MODEL_PRESETS.anthropic;
  if (type === 'ollama' || type === 'lmstudio' || type === 'litellm') {
    return [...MANUAL_MODEL_PRESETS.qwen, ...MANUAL_MODEL_PRESETS.deepseek];
  }
  return [...MANUAL_MODEL_PRESETS.openai, ...MANUAL_MODEL_PRESETS.anthropic];
}

/** Preset id for the custom OpenAI Compatible chip */
export const OPENAI_COMPATIBLE_PRESET_ID = 'openai-compatible';

export function getOpenAICompatiblePreset(): ProviderPreset {
  const preset = PROVIDER_PRESETS.find((p) => p.id === OPENAI_COMPATIBLE_PRESET_ID);
  if (!preset) throw new Error('OpenAI Compatible preset missing');
  return preset;
}
