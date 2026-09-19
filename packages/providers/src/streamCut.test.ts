/**
 * HOST-002 — stream-cut contract regression (docs/HOST-002-RCA.md).
 *
 * Contract: `streamChat` yields `{done: true}` only on SSE `[DONE]`.
 * When the server closes the SSE stream without `[DONE]`, the provider must
 * surface `{done: true, incomplete: true}` so the host can log the precise
 * cut signature (log-only; never auto-retry — deltas already streamed).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiteLLMProvider } from './LiteLLMProvider';
import type { LLMProviderConfig, StreamChunk } from './types';

const config: LLMProviderConfig = {
  id: 'host002-test',
  name: 'HOST-002 test provider',
  type: 'litellm',
  baseUrl: 'http://127.0.0.1:9',
  model: 'test-model',
};

function sseResponse(body: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function collect(provider: LiteLLMProvider): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of provider.streamChat({
    messages: [{ role: 'user', content: 'ping' }],
  })) {
    chunks.push(chunk);
  }
  return chunks;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HOST-002 stream-cut contract', () => {
  it('normal close with [DONE] yields done without incomplete marker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(
          'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n' +
            'data: [DONE]\n\n',
        ),
      ),
    );

    const chunks = await collect(new LiteLLMProvider(config));
    expect(chunks.some((c) => c.content === 'hello')).toBe(true);
    const done = chunks.find((c) => c.done);
    expect(done).toBeDefined();
    expect(done?.incomplete).toBeUndefined();
  });

  it('SSE close without [DONE] yields done + incomplete signature', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
      ),
    );

    const chunks = await collect(new LiteLLMProvider(config));
    expect(chunks.some((c) => c.content === 'partial')).toBe(true);
    const done = chunks.find((c) => c.done);
    expect(done).toBeDefined();
    expect(done?.incomplete).toBe(true);
  });

  it('HTTP error still yields done without incomplete marker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );

    const chunks = await collect(new LiteLLMProvider(config));
    const done = chunks.find((c) => c.done);
    expect(done).toBeDefined();
    expect(done?.error).toContain('API Error (500)');
    expect(done?.incomplete).toBeUndefined();
  });
});
