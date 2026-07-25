/**
 * Provider 타입 정의
 */
export type ProviderType = 'litellm' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio';

export interface LLMProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey?: string;
  model: string;
  models?: string[];
  capabilities?: ('chat' | 'streaming' | 'tool_calls' | 'vision' | 'reasoning')[];
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
  messages: { role: string; content: string }[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: any[];
}

export interface StreamChunk {
  content?: string;
  toolCalls?: any[];
  done?: boolean;
  error?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export type ProviderEventType = 'registered' | 'updated' | 'removed' | 'activated' | 'error';

export interface ProviderEvent {
  type: ProviderEventType;
  providerId: string;
  timestamp: number;
  data?: any;
}

export type ProviderEventListener = (event: ProviderEvent) => void;
