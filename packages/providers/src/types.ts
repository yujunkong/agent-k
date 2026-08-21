/**
 * PROVIDER-* — shared provider domain types.
 * Custom OpenAI Compatible endpoints use type `litellm` (UI: "OpenAI Compatible").
 * PROVIDER-015 OpenCode types omitted (out of scope).
 */

import type { ThinkingEffort } from '@agent-k/shared';

export type ProviderType =
  | 'litellm'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'lmstudio';

export interface LLMProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey?: string;
  model: string;
  models?: string[];
  capabilities?: Array<'chat' | 'streaming' | 'tool_calls' | 'vision' | 'reasoning'>;
  createdAt?: number;
  updatedAt?: number;
}

export interface LLMProviderInterface {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType;
  readonly config: LLMProviderConfig;
  authenticate(): Promise<boolean>;
  streamChat(options: StreamChatOptions): AsyncGenerator<StreamChunk>;
  listModels(): Promise<string[]>;
  healthCheck(): Promise<{ healthy: boolean; latency?: number }>;
}

export interface StreamChatOptions {
  messages: Array<Record<string, unknown>>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];
  enableThinking?: boolean;
  thinkingEffort?: ThinkingEffort;
  responseFormat?: {
    type: 'json_schema';
    json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> };
  };
}

export interface StreamChunk {
  content?: string;
  reasoning_content?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolCalls?: any[];
  done?: boolean;
  error?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  finishReason?: string;
}

export type ProviderEventType = 'registered' | 'updated' | 'removed' | 'activated' | 'error';

export interface ProviderEvent {
  type: ProviderEventType;
  providerId: string;
  timestamp: number;
  data?: unknown;
}

export type ProviderEventListener = (event: ProviderEvent) => void;
