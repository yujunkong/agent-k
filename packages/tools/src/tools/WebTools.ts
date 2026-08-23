/**
 * Web tools — web_fetch (real HTTP) + web_search (optional SearXNG / stub).
 */

import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch an http(s) URL and return truncated text body.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'http or https URL' },
      href: { type: 'string', description: 'Alias for url' },
      maxLength: {
        type: 'number',
        description: 'Max body chars (default 80000, max 200000)',
      },
      timeout: { type: 'number', description: 'Timeout ms (default 20000)' },
    },
    required: ['url'],
  },
  permissionHint: 'network',
  timeoutMs: 30_000,
  cancelSupported: true,
  timelineEventType: 'browsing',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'web',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const url = String(input.url ?? input.href ?? '').trim();
      if (!url) return { success: false, error: 'web_fetch requires url' };
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { success: false, error: `Invalid URL: ${url}` };
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, error: 'web_fetch only supports http/https' };
      }
      const timeout = Number(input.timeout) || 20_000;
      const max = Math.min(Number(input.maxLength) || 80_000, 200_000);
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      ctx.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Agent-K/1.0',
            Accept: 'text/*,application/json,*/*',
          },
        });
        const text = await res.text();
        return {
          success: res.ok,
          data: {
            url,
            status: res.status,
            contentType: res.headers.get('content-type'),
            body: text.slice(0, max),
            truncated: text.length > max,
          },
          error: res.ok ? undefined : `HTTP ${res.status}`,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'web_fetch failed',
        };
      } finally {
        clearTimeout(timer);
        ctx.signal?.removeEventListener('abort', onAbort);
      }
    });
  },
};

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description:
    'Web search. Uses SEARXNG_URL when set; otherwise returns a stub directing to web_fetch with known URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Max results (default 5)' },
    },
    required: ['query'],
  },
  permissionHint: 'network',
  timeoutMs: 30_000,
  cancelSupported: true,
  timelineEventType: 'searching',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'web',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const query = String(input.query ?? '').trim();
      if (!query) return { success: false, error: 'web_search requires query' };
      const maxResults = Math.min(10, Math.max(1, Number(input.maxResults) || 5));
      const base = String(process.env.SEARXNG_URL || '').replace(/\/$/, '');
      if (!base) {
        return {
          success: true,
          data: {
            query,
            results: [],
            count: 0,
            note: 'SEARXNG_URL not set — use web_fetch with a concrete URL, or configure SearXNG.',
          },
        };
      }
      const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      ctx.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await fetch(url, { signal: controller.signal });
        const json = (await res.json()) as {
          results?: Array<{ title?: string; url?: string; content?: string }>;
        };
        const results = (json.results || []).slice(0, maxResults).map((r) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.content || '',
        }));
        return {
          success: res.ok,
          data: { query, results, count: results.length },
          error: res.ok ? undefined : `HTTP ${res.status}`,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'web_search failed',
        };
      } finally {
        ctx.signal?.removeEventListener('abort', onAbort);
      }
    });
  },
};
