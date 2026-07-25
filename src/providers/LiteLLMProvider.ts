/**
 * LiteLLM / OpenAI 호환 Provider 구현
 * 
 * OpenAI 호환 API (/v1/chat/completions, /v1/models)를 통해
 * LiteLLM, Ollama, LM Studio 등 모든 OpenAI 호환 서버와 통신
 */
import type { LLMProviderConfig, LLMProviderInterface, StreamChatOptions, StreamChunk } from './types';

export class LiteLLMProvider implements LLMProviderInterface {
  readonly id: string;
  readonly name: string;
  readonly type = 'litellm' as const;
  readonly config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
  }

  async authenticate(): Promise<boolean> {
    // For OpenAI-compatible APIs, authentication is just checking if we can reach the server
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async *streamChat(options: StreamChatOptions): AsyncGenerator<StreamChunk> {
    const { messages, model, temperature = 0.7, maxTokens = 4096, signal, tools } = options;
    const modelName = model || this.config.model;
    // Tool turns keep thinking ON for Thought UI, but AgentLoop truncates/nudges
    // so Qwen does not get stuck in plan-only loops.
    const enableThinking = options.enableThinking ?? true;

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          stream: true,
          temperature,
          max_tokens: maxTokens,
          enable_thinking: enableThinking,
          ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {})
        }),
        signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        yield { error: `API Error (${response.status}): ${errorText}`, done: true };
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
            if (!line.startsWith('data: ')) continue;

            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield { done: true };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              const usage = parsed.usage;

              if (delta?.content) {
                yield { content: delta.content };
              }

              // Some local servers (exo/MLX Qwen) stream reasoning separately
              if (delta?.reasoning_content) {
                yield { reasoning_content: delta.reasoning_content } as StreamChunk;
              }
              if (delta?.reasoning) {
                yield { reasoning_content: String(delta.reasoning) } as StreamChunk;
              }

              if (delta?.tool_calls) {
                yield { toolCalls: delta.tool_calls };
              }

              // Usage alone must NOT end the stream — content may still follow on some servers
              if (usage) {
                yield {
                  usage: {
                    promptTokens: usage.prompt_tokens,
                    completionTokens: usage.completion_tokens
                  }
                };
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        yield { error: 'Stream aborted', done: true };
      } else {
        yield { error: error?.message || 'Unknown error', done: true };
      }
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) return [];
      const data = await response.json();
      return data.data?.map((m: any) => m.id) || [];
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latency?: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000)
      });
      return {
        healthy: response.ok,
        latency: Date.now() - start
      };
    } catch {
      return { healthy: false };
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }
}
