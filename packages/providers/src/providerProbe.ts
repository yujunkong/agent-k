/**
 * PROVIDER-009 — Domain probe layer (no vscode).
 * Host keeps CSP-bypass fetch + postMessage; this module classifies results
 * and can run a pure /v1/models probe when fetch is available.
 */
import { classifyProbeResult, type ProviderHealthStatus } from './providerStatus';

export interface ProviderProbeRequest {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  extraHeaders?: Record<string, string>;
}

export interface ProviderProbeResult {
  ok: boolean;
  status?: number;
  detail: string;
  modelIds?: string[];
  health: ProviderHealthStatus;
}

/** Merge Bearer auth into probe headers when not already set. */
export function mergeProbeHeaders(
  apiKey?: string,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...(extraHeaders || {}) };
  if (
    apiKey &&
    !headers.Authorization &&
    !headers['x-api-key'] &&
    !headers['X-Api-Key']
  ) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Probe `{baseUrl}/v1/models` (OpenAI Compatible).
 * Used by registry tests and can be called from host without vscode deps.
 */
export async function probeProviderEndpoint(
  request: ProviderProbeRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderProbeResult> {
  const root = String(request.baseUrl || '').replace(/\/$/, '');
  if (!root) {
    return { ok: false, detail: 'Base URL is empty', health: 'offline' };
  }

  try {
    const headers = mergeProbeHeaders(request.apiKey, request.extraHeaders);
    const response = await fetchImpl(`${root}/v1/models`, { headers });
    const status = response.status;
    const health = classifyProbeResult(response.ok, status);

    if (!response.ok) {
      let detail = `HTTP ${status}`;
      if (status === 401 || status === 403) {
        detail +=
          ' — Auth failed. Check API Key, or use a local endpoint that does not require auth.';
      } else if (status === 429) {
        detail += ' — Rate limited. Retry in a moment.';
      }
      return { ok: false, status, detail, health };
    }

    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const modelIds = (data?.data || []).map((m) => m.id).filter((id): id is string => !!id);
    const found = request.model ? modelIds.includes(request.model) : false;
    const detail =
      request.model && found
        ? `OK — model "${request.model}" listed (${modelIds.length} models)`
        : modelIds.length > 0
          ? `OK — server reachable (${modelIds.length} models).`
          : 'OK — server reachable (no models in list). Add a model name manually.';

    return { ok: true, status, detail, modelIds, health };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg || 'Connection failed', health: 'offline' };
  }
}
