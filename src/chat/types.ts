export type Role = 'user' | 'assistant' | 'tool' | 'system';
export type Mode = 'ask' | 'agent' | 'plan' | 'debug';
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  status: MessageStatus;
  timestamp: number;
  metadata?: {
    model: string;
    tokens: { input: number; output: number };
    mode: Mode;
    toolsUsed: string[];
  };
}

export interface Attachment {
  type: 'file' | 'folder' | 'symbol' | 'codebase';
  path: string;
  content?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  error?: boolean;
}

export interface StreamDelta {
  content?: string;
  toolCalls?: ToolCall[];
  done?: boolean;
  error?: string;
}

export interface ProviderConfig {
  type: 'litellm' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio';
  baseUrl: string;
  apiKey?: string;
  model: string;
}