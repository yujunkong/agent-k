import type { ProviderConfig, StreamDelta, ChatMessage, Mode, Attachment, ToolCall, ToolResult } from '../types';

let currentProvider: ProviderConfig = {
  type: 'litellm',
  baseUrl: 'http://127.0.0.1:4000',
  model: 'qwen3.6-35b-a3b'
};

export function setProvider(config: Partial<ProviderConfig>) {
  currentProvider = { ...currentProvider, ...config };
}

export function getProvider(): ProviderConfig {
  return currentProvider;
}

export async function* streamChat(options: {
  messages: ChatMessage[];
  mode: Mode;
  signal?: AbortSignal;
  provider?: string;
  model?: string;
  temperature?: number;
}): AsyncGenerator<StreamDelta> {
  const { messages, mode, signal, provider, model, temperature = 0.7 } = options;
  
  const providerConfig = provider 
    ? { ...currentProvider, baseUrl: provider }
    : currentProvider;
  const modelName = model || providerConfig.model;
  
  try {
    const response = await fetch(`${providerConfig.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(providerConfig.apiKey ? { 'Authorization': `Bearer ${providerConfig.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: true,
        temperature,
        max_tokens: 4096
      }),
      signal
    });

    if (!response.ok) {
      const error = await response.text();
      yield { error: `API Error: ${response.status} - ${error}`, done: true };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { error: 'No response body', done: true };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield { done: true };
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              if (delta) {
                yield {
                  content: delta.content,
                  toolCalls: delta.tool_calls,
                  done: false
                };
              }
            } catch {
              // Ignore parse errors for incomplete JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      yield { error: 'Stream aborted', done: true };
    } else {
      yield { error: error instanceof Error ? error.message : 'Unknown error', done: true };
    }
  }
}

export async function listModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      }
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.data?.map((m: any) => m.id) || [];
  } catch {
    return [];
  }
}

export async function checkHealth(baseUrl: string): Promise<{ healthy: boolean; latency?: number }> {
  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}/v1/models`, { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return { healthy: response.ok, latency: Date.now() - start };
  } catch {
    return { healthy: false };
  }
}