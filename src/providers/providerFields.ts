/**
 * Which settings fields each provider type needs in the UI.
 */
import type { ProviderType } from './types';

export interface ProviderFieldMeta {
  /** Show Base URL input */
  needsBaseUrl: boolean;
  /** Show API Key input */
  needsApiKey: boolean;
  /** API key may be empty (local / no auth) */
  apiKeyOptional?: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  hint: string;
}

export const PROVIDER_FIELDS: Record<ProviderType, ProviderFieldMeta> = {
  litellm: {
    needsBaseUrl: true,
    needsApiKey: true,
    apiKeyOptional: true,
    defaultBaseUrl: 'http://127.0.0.1:52415',
    defaultModel: 'mlx-community/Qwen3.6-35B-A3B-4bit',
    hint:
      'OpenAI-compatible (MLX/exo/LiteLLM). Local MLX usually needs no key; LiteLLM proxy may need a master key.'
  },
  openai: {
    needsBaseUrl: false,
    needsApiKey: true,
    apiKeyOptional: false,
    defaultBaseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-4o',
    hint: 'Official OpenAI API. Enter your API key; models load after Test Connection.'
  },
  anthropic: {
    needsBaseUrl: true,
    needsApiKey: true,
    apiKeyOptional: false,
    defaultBaseUrl: 'http://127.0.0.1:4000',
    defaultModel: 'claude-sonnet-4-20250514',
    hint: 'OpenAI-compatible Anthropic proxy (e.g. LiteLLM). Base URL + API key required.'
  },
  ollama: {
    needsBaseUrl: true,
    needsApiKey: false,
    defaultBaseUrl: 'http://127.0.0.1:11434',
    defaultModel: 'llama3.2',
    hint: 'Local Ollama — base URL only (no API key).'
  },
  lmstudio: {
    needsBaseUrl: true,
    needsApiKey: false,
    defaultBaseUrl: 'http://127.0.0.1:1234',
    defaultModel: 'local-model',
    hint: 'LM Studio local server — base URL only (no API key).'
  },
  'opencode-zen': {
    needsBaseUrl: true,
    needsApiKey: true,
    apiKeyOptional: false,
    defaultBaseUrl: 'https://opencode.ai/zen',
    defaultModel: 'kimi-k2.6',
    hint:
      'OpenCode Zen (pay-as-you-go). Use your Zen API key from opencode.ai/auth — not the Go key. Test Connection fills Composer.'
  },
  'opencode-go': {
    needsBaseUrl: true,
    needsApiKey: true,
    apiKeyOptional: false,
    defaultBaseUrl: 'https://opencode.ai/zen/go',
    defaultModel: 'kimi-k2.6',
    hint:
      'OpenCode Go (subscription). Use your Go API key — separate from Zen. Test Connection fills Composer.'
  }
};

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  litellm: 'LiteLLM / OpenAI-compatible',
  openai: 'OpenAI',
  anthropic: 'Anthropic (via proxy)',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  'opencode-zen': 'OpenCode Zen',
  'opencode-go': 'OpenCode Go'
};

export function isProviderType(v: string): v is ProviderType {
  return v in PROVIDER_FIELDS;
}
