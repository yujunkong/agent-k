/**
 * PROVIDER-010 — LiteLLM / OpenAI-compatible HTTP client.
 * Also backs PROVIDER-011…014 (OpenAI, Anthropic, Ollama, LM Studio) at the wire level.
 */
import { parseThinkingEffort, thinkingEffortToProviderOpts } from './thinkingEffort';
import type {
  LLMProviderConfig,
  LLMProviderInterface,
  StreamChatOptions,
  StreamChunk,
} from './types';

export class LiteLLMProvider implements LLMProviderInterface {
  readonly id: string;
  readonly name: string;
  readonly type: LLMProviderConfig['type'];
  readonly config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.config = config;
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async *streamChat(options: StreamChatOptions): AsyncGenerator<StreamChunk> {
    const {
      messages,
      model,
      temperature = 0.7,
      // Reasoning models (hy3) burn completion budget on thinking — keep headroom for final prose.
      maxTokens = 32768,
      signal,
      tools,
      responseFormat,
    } = options;
    const modelName = model || this.config.model;
    const effort = parseThinkingEffort(options.thinkingEffort);
    const mapped = thinkingEffortToProviderOpts(effort);
    const enableThinking =
      options.enableThinking !== undefined
        ? options.enableThinking
        : options.thinkingEffort !== undefined
          ? mapped.enableThinking
          : false;

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          stream: true,
          temperature,
          max_tokens: maxTokens,
          // Only send thinking flags when explicitly requested — defaulting to
          // enable_thinking:true made some Zen free models return contentLen=0.
          ...(options.thinkingEffort !== undefined ||
          options.enableThinking !== undefined
            ? {
                enable_thinking: enableThinking,
                ...(mapped.reasoningEffort
                  ? { reasoning_effort: mapped.reasoningEffort }
                  : {}),
                ...(mapped.thinkingBudget != null && enableThinking
                  ? { thinking_budget: mapped.thinkingBudget }
                  : {}),
              }
            : {}),
          ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
        signal,
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
              const parsed = JSON.parse(data) as {
                choices?: Array<{
                  delta?: {
                    content?: string;
                    reasoning_content?: string;
                    reasoning?: unknown;
                    tool_calls?: unknown[];
                  };
                  finish_reason?: string;
                }>;
                usage?: { prompt_tokens?: number; completion_tokens?: number };
              };
              const choice = parsed.choices?.[0];
              const delta = choice?.delta;
              const usage = parsed.usage;
              const finishReason = choice?.finish_reason;

              if (delta?.content) yield { content: delta.content };
              if (delta?.reasoning_content) {
                yield { reasoning_content: delta.reasoning_content };
              }
              if (delta?.reasoning) {
                yield { reasoning_content: String(delta.reasoning) };
              }
              if (delta?.tool_calls) yield { toolCalls: delta.tool_calls };
              // Comment: surface any finish_reason (stop/length/tool_calls) — Zen often omits length
              if (finishReason) yield { finishReason: String(finishReason) };
              if (usage) {
                yield {
                  usage: {
                    promptTokens: usage.prompt_tokens,
                    completionTokens: usage.completion_tokens,
                  },
                };
              }
            } catch {
              // Skip malformed SSE JSON chunks
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        yield { error: 'Stream aborted', done: true };
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        yield { error: message, done: true };
      }
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { data?: Array<{ id?: string }> };
      return (data.data || []).map((m) => m.id).filter((id): id is string => !!id);
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latency?: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return { healthy: response.ok, latency: Date.now() - start };
    } catch {
      return { healthy: false };
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }
}
