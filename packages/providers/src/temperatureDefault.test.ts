/**
 * V31-MODEL-01 — tier temperature defaults (no 0.7 drift).
 *
 * Contract: `streamChat` without an explicit `temperature` must send the
 * tier-B policy temperature (0.2), never the legacy 0.7 default. Callers
 * (host) pass the tier temperature explicitly; this is the fallback guard.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiteLLMProvider } from './LiteLLMProvider';
import { getPolicyForTier } from './ModelTiers';
import type { LLMProviderConfig, StreamChatOptions } from './types';

const config: LLMProviderConfig = {
  id: 'v31-model-01-test',
  name: 'V31-MODEL-01 test provider',
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

/** Drain streamChat and return the JSON request body sent to fetch. */
async function collectRequestBody(
  provider: LiteLLMProvider,
  options: StreamChatOptions,
): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body ?? '{}')) as Record<
        string,
        unknown
      >;
      return sseResponse('data: [DONE]\n\n');
    }),
  );
  for await (const _chunk of provider.streamChat(options)) {
    // drain
  }
  return captured;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('V31-MODEL-01 tier temperature defaults', () => {
  it('streamChat WITHOUT temperature sends tier-B default 0.2', async () => {
    const body = await collectRequestBody(new LiteLLMProvider(config), {
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(body.temperature).toBe(0.2);
    expect(body.temperature).not.toBe(0.7);
  });

  it('streamChat WITH temperature: 0.1 sends 0.1 (caller wins)', async () => {
    const body = await collectRequestBody(new LiteLLMProvider(config), {
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0.1,
    });
    expect(body.temperature).toBe(0.1);
    expect(body.temperature).not.toBe(0.7);
  });

  it('getPolicyForTier temperatures are exactly 0.1 / 0.2 / 0.0', () => {
    expect(getPolicyForTier('A').modelParams.temperature).toBe(0.1);
    expect(getPolicyForTier('B').modelParams.temperature).toBe(0.2);
    expect(getPolicyForTier('C').modelParams.temperature).toBe(0.0);
  });

  it('no tier policy path yields 0.7', () => {
    const temps = (['A', 'B', 'C'] as const).map(
      (tier) => getPolicyForTier(tier).modelParams.temperature,
    );
    expect(temps).not.toContain(0.7);
    expect(temps.every((t) => t !== 0.7)).toBe(true);
  });
});
