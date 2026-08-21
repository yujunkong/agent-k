/**
 * MODEL-011 — Resolve per-model context window from provider / known maps.
 * Inject fetchImpl (host CSP bypass); OpenCode types omitted (PROVIDER-015 skipped).
 */
import type { ProviderType } from './types';

export interface ModelContextInfo {
  model: string;
  providerType: ProviderType;
  maxInputTokens: number;
  maxOutputTokens?: number;
  source: 'provider' | 'known' | 'catalog' | 'fallback';
}

export interface ResolveModelContextOptions {
  providerType: ProviderType;
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Used only when provider/catalog lookup fails */
  fallbackTokens?: number;
  signal?: AbortSignal;
  /** Injected fetch (defaults to global fetch) */
  fetchImpl?: typeof fetch;
}

const DEFAULT_FALLBACK = 100_000;

/** Well-known cloud model windows (when /v1/models omits limits). */
const KNOWN_MAX_INPUT: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4.1': 1_047_576,
  'gpt-4.1-mini': 1_047_576,
  'gpt-4.1-nano': 1_047_576,
  'gpt-4-turbo': 128_000,
  'gpt-4-turbo-preview': 128_000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  o1: 200_000,
  'o1-mini': 128_000,
  'o1-preview': 128_000,
  o3: 200_000,
  'o3-mini': 200_000,
  'o4-mini': 200_000,
  'claude-opus-4-20250514': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-3-7-sonnet-20250219': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-opus-20240229': 200_000,
  'claude-3-sonnet-20240229': 200_000,
  'claude-3-haiku-20240307': 200_000,
};

function authHeaders(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

function normalizeBase(baseUrl: string): string {
  return String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '');
}

function pickPositive(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return undefined;
}

function extractFromModelObject(m: Record<string, unknown>): {
  maxInput?: number;
  maxOutput?: number;
} {
  const info =
    m.model_info && typeof m.model_info === 'object'
      ? (m.model_info as Record<string, unknown>)
      : undefined;
  const meta =
    m.meta && typeof m.meta === 'object' ? (m.meta as Record<string, unknown>) : undefined;

  const maxInput = pickPositive(
    m.max_input_tokens,
    m.max_model_len,
    m.context_length,
    m.context_window,
    m.contextLength,
    info?.max_input_tokens,
    info?.max_tokens,
    info?.context_length,
    meta?.max_input_tokens,
    meta?.n_ctx_train,
    meta?.context_length,
  );

  const maxOutput = pickPositive(
    m.max_output_tokens,
    info?.max_output_tokens,
    meta?.max_output_tokens,
    m.max_tokens !== m.max_input_tokens ? m.max_tokens : undefined,
  );

  return { maxInput, maxOutput };
}

function modelIdMatches(candidate: string, target: string): boolean {
  const a = candidate.toLowerCase();
  const b = target.toLowerCase();
  if (a === b) return true;
  if (a.endsWith(`/${b}`) || b.endsWith(`/${a}`)) return true;
  const aBase = a.split('/').pop() || a;
  const bBase = b.split('/').pop() || b;
  return aBase === bBase;
}

type FetchFn = typeof fetch;

async function fetchJson(
  fetchImpl: FetchFn,
  url: string,
  init: RequestInit,
): Promise<unknown | null> {
  try {
    const res = await fetchImpl(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function timeoutSignal(ms: number, outer?: AbortSignal): AbortSignal {
  if (outer) return outer;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

/** LiteLLM proxy: GET /model/info (or /v1/model/info) */
async function fromLiteLLMModelInfo(
  fetchImpl: FetchFn,
  root: string,
  apiKey: string | undefined,
  model: string,
  signal?: AbortSignal,
): Promise<{ maxInput?: number; maxOutput?: number } | null> {
  const headers = authHeaders(apiKey);
  for (const path of ['/model/info', '/v1/model/info']) {
    const data = await fetchJson(fetchImpl, `${root}${path}`, {
      method: 'GET',
      headers,
      signal: timeoutSignal(8000, signal),
    });
    if (!data || typeof data !== 'object') continue;
    const rows = Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : Array.isArray(data)
        ? data
        : [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const name = String(r.model_name || r.id || r.model || '');
      if (name && !modelIdMatches(name, model)) continue;
      const info =
        r.model_info && typeof r.model_info === 'object'
          ? (r.model_info as Record<string, unknown>)
          : r;
      const maxInput = pickPositive(
        info.max_input_tokens,
        info.max_tokens,
        r.max_input_tokens,
      );
      const maxOutput = pickPositive(info.max_output_tokens, r.max_output_tokens);
      if (maxInput) return { maxInput, maxOutput };
    }
  }
  return null;
}

/** OpenAI-compatible GET /v1/models */
async function fromOpenAIModels(
  fetchImpl: FetchFn,
  root: string,
  apiKey: string | undefined,
  model: string,
  signal?: AbortSignal,
): Promise<{ maxInput?: number; maxOutput?: number } | null> {
  const data = await fetchJson(fetchImpl, `${root}/v1/models`, {
    method: 'GET',
    headers: authHeaders(apiKey),
    signal: timeoutSignal(8000, signal),
  });
  if (!data || typeof data !== 'object') return null;
  const rows = Array.isArray((data as { data?: unknown }).data)
    ? (data as { data: unknown[] }).data
    : [];
  let fallback: { maxInput?: number; maxOutput?: number } | null = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || r.model || '');
    const extracted = extractFromModelObject(r);
    if (!extracted.maxInput) continue;
    if (id && modelIdMatches(id, model)) return extracted;
    if (!fallback) fallback = extracted;
  }
  if (rows.length === 1 && fallback) return fallback;
  return null;
}

/** Ollama native: POST /api/show */
async function fromOllamaShow(
  fetchImpl: FetchFn,
  root: string,
  model: string,
  signal?: AbortSignal,
): Promise<{ maxInput?: number; maxOutput?: number } | null> {
  const data = await fetchJson(fetchImpl, `${root}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name: model }),
    signal: timeoutSignal(8000, signal),
  });
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const info =
    obj.model_info && typeof obj.model_info === 'object'
      ? (obj.model_info as Record<string, unknown>)
      : obj;

  const params =
    obj.parameters && typeof obj.parameters === 'object'
      ? (obj.parameters as Record<string, unknown>)
      : undefined;

  const maxInput = pickPositive(
    info['llama.context_length'],
    info['qwen.context_length'],
    info['qwen2.context_length'],
    info['gemma.context_length'],
    info.context_length,
    obj.context_length,
    params?.num_ctx,
  );
  return maxInput ? { maxInput } : null;
}

function fromKnownMap(model: string): { maxInput?: number } | null {
  const direct = KNOWN_MAX_INPUT[model];
  if (direct) return { maxInput: direct };
  const base = model.split('/').pop() || model;
  if (KNOWN_MAX_INPUT[base]) return { maxInput: KNOWN_MAX_INPUT[base] };
  for (const [key, val] of Object.entries(KNOWN_MAX_INPUT)) {
    if (base.startsWith(key) || model.startsWith(key)) return { maxInput: val };
  }
  return null;
}

/** LiteLLM public catalog (best-effort; offline/local models usually miss). */
async function fromLiteLLMCatalog(
  fetchImpl: FetchFn,
  model: string,
  signal?: AbortSignal,
): Promise<{ maxInput?: number; maxOutput?: number } | null> {
  const candidates = [model, model.split('/').pop() || model].filter(Boolean);
  for (const id of candidates) {
    const data = await fetchJson(
      fetchImpl,
      `https://api.litellm.ai/model_catalog/${encodeURIComponent(id)}`,
      { method: 'GET', signal: timeoutSignal(6000, signal) },
    );
    if (!data || typeof data !== 'object') continue;
    const obj = data as Record<string, unknown>;
    const nested =
      obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : undefined;
    const maxInput = pickPositive(obj.max_input_tokens, nested?.max_input_tokens);
    const maxOutput = pickPositive(obj.max_output_tokens, nested?.max_output_tokens);
    if (maxInput) return { maxInput, maxOutput };
  }
  return null;
}

const cache = new Map<string, ModelContextInfo>();

function cacheKey(opts: ResolveModelContextOptions): string {
  return `${opts.providerType}|${normalizeBase(opts.baseUrl)}|${opts.model}`;
}

export function clearModelContextCache(): void {
  cache.clear();
}

/**
 * Resolve max context tokens for the selected provider + model.
 */
export async function resolveModelContextInfo(
  opts: ResolveModelContextOptions,
): Promise<ModelContextInfo> {
  const key = cacheKey(opts);
  const hit = cache.get(key);
  if (hit) return hit;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const root = normalizeBase(opts.baseUrl);
  const fallback = pickPositive(opts.fallbackTokens) || DEFAULT_FALLBACK;
  const type = opts.providerType;
  let found: { maxInput?: number; maxOutput?: number } | null = null;
  let source: ModelContextInfo['source'] = 'fallback';

  try {
    switch (type) {
      case 'ollama': {
        found = await fromOllamaShow(fetchImpl, root, opts.model, opts.signal);
        if (found?.maxInput) source = 'provider';
        if (!found?.maxInput) {
          found = await fromOpenAIModels(fetchImpl, root, opts.apiKey, opts.model, opts.signal);
          if (found?.maxInput) source = 'provider';
        }
        break;
      }
      case 'litellm': {
        found = await fromLiteLLMModelInfo(fetchImpl, root, opts.apiKey, opts.model, opts.signal);
        if (found?.maxInput) source = 'provider';
        if (!found?.maxInput) {
          found = await fromOpenAIModels(fetchImpl, root, opts.apiKey, opts.model, opts.signal);
          if (found?.maxInput) source = 'provider';
        }
        break;
      }
      case 'openai':
      case 'lmstudio':
      case 'anthropic': {
        if (type === 'anthropic') {
          found = await fromLiteLLMModelInfo(
            fetchImpl,
            root,
            opts.apiKey,
            opts.model,
            opts.signal,
          );
          if (found?.maxInput) source = 'provider';
        }
        if (!found?.maxInput) {
          found = await fromOpenAIModels(fetchImpl, root, opts.apiKey, opts.model, opts.signal);
          if (found?.maxInput) source = 'provider';
        }
        break;
      }
      default:
        found = await fromOpenAIModels(fetchImpl, root, opts.apiKey, opts.model, opts.signal);
        if (found?.maxInput) source = 'provider';
    }

    if (!found?.maxInput) {
      const known = fromKnownMap(opts.model);
      if (known?.maxInput) {
        found = known;
        source = 'known';
      }
    }

    if (!found?.maxInput && (type === 'openai' || type === 'anthropic' || type === 'litellm')) {
      const catalog = await fromLiteLLMCatalog(fetchImpl, opts.model, opts.signal);
      if (catalog?.maxInput) {
        found = catalog;
        source = 'catalog';
      }
    }
  } catch {
    /* non-fatal */
  }

  const info: ModelContextInfo = {
    model: opts.model,
    providerType: type,
    maxInputTokens: found?.maxInput || fallback,
    maxOutputTokens: found?.maxOutput,
    source: found?.maxInput ? source : 'fallback',
  };
  cache.set(key, info);
  return info;
}
