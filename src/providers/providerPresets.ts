/**
 * 자주 쓰는 Provider / 모델 프리셋.
 * Add Provider 에서 클릭 한 번으로 Base URL 을 채우고,
 * /models 실패 시 수동 추가 후보를 제공한다.
 */
import type { ProviderType } from './types';

export interface ProviderPreset {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
}

/** 표준 Provider 프리셋 — Add Provider 칩에 표시 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'openai', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com' },
  { id: 'claude', name: 'Claude', type: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  { id: 'openai-compatible', name: 'OpenAI Compatible', type: 'litellm', baseUrl: 'http://127.0.0.1:4000' },
  { id: 'openrouter', name: 'OpenRouter', type: 'litellm', baseUrl: 'https://openrouter.ai/api' },
  { id: 'ollama', name: 'Ollama', type: 'ollama', baseUrl: 'http://127.0.0.1:11434' },
  { id: 'lmstudio', name: 'LM Studio', type: 'lmstudio', baseUrl: 'http://127.0.0.1:1234' },
  { id: 'groq', name: 'Groq', type: 'litellm', baseUrl: 'https://api.groq.com/openai' },
  { id: 'together', name: 'Together', type: 'litellm', baseUrl: 'https://api.together.xyz' }
];

/** /models 미지원 Provider 를 위한 자주 쓰는 모델명 */
export const MANUAL_MODEL_PRESETS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-latest'],
  qwen: ['qwen3-coder', 'qwen3.6-35b-a3b', 'mlx-community/Qwen3.6-35B-A3B-4bit'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4']
};

export function manualModelPresetsForType(type: ProviderType): string[] {
  if (type === 'openai') return MANUAL_MODEL_PRESETS.openai;
  if (type === 'anthropic') return MANUAL_MODEL_PRESETS.anthropic;
  if (type === 'ollama' || type === 'lmstudio' || type === 'litellm') {
    return [...MANUAL_MODEL_PRESETS.qwen, ...MANUAL_MODEL_PRESETS.deepseek];
  }
  return [...MANUAL_MODEL_PRESETS.openai, ...MANUAL_MODEL_PRESETS.anthropic];
}
