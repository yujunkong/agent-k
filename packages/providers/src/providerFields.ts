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
    defaultBaseUrl: 'http://127.0.0.1:4000',
    defaultModel: 'mlx-community/Qwen3.6-35B-A3B-4bit',
    hint:
      'OpenAI Compatible endpoint (LiteLLM, vLLM, local proxy, OpenRouter-style gateways). Local servers often need no key.'
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
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    hint: 'Claude (Anthropic). Use the official API URL or an OpenAI-compatible proxy. API key required.'
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
      'OpenCode Zen (pay-as-you-go). Use your Zen API key from opencode.ai/auth — not the Go key. Test Connection replaces the Composer model list with Zen models only.'
  },
  'opencode-go': {
    needsBaseUrl: true,
    needsApiKey: true,
    apiKeyOptional: false,
    defaultBaseUrl: 'https://opencode.ai/zen/go',
    defaultModel: 'kimi-k2.6',
    hint:
      'OpenCode Go (subscription). Use your Go API key — separate from Zen. Test Connection replaces the Composer model list with Go models only.'
  }
};

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  litellm: 'OpenAI Compatible',
  openai: 'OpenAI',
  anthropic: 'Claude (Anthropic)',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  'opencode-zen': 'OpenCode Zen',
  'opencode-go': 'OpenCode Go'
};

export function isProviderType(v: string): v is ProviderType {
  return v in PROVIDER_FIELDS;
}
