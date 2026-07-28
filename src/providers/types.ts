/**
 * Provider 타입 정의
 */
export type ProviderType =
  | 'litellm'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'lmstudio'
  | 'opencode-zen'
  | 'opencode-go';

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
  messages: Array<Record<string, unknown>>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: any[];
  /**
   * Qwen / exo thinking channel. Prefer setting via thinkingEffort.
   */
  enableThinking?: boolean;
  /** off | low | medium | high | max — mapped to enable_thinking + reasoning_effort / budget */
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high' | 'max';
}

export interface StreamChunk {
  content?: string;
  /** Qwen/exo thinking stream (optional) */
  reasoning_content?: string;
  toolCalls?: any[];
  done?: boolean;
  error?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  /** Set when the model hit max_tokens mid-answer */
  finishReason?: string;
}

export type ProviderEventType = 'registered' | 'updated' | 'removed' | 'activated' | 'error';

export interface ProviderEvent {
  type: ProviderEventType;
  providerId: string;
  timestamp: number;
  data?: any;
}

export type ProviderEventListener = (event: ProviderEvent) => void;
