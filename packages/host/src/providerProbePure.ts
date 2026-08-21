/**
 * HOST-010 — Pure probe helpers (no vscode).
 */

import type { ProviderProbeHealth } from '@agent-k/shared';

/** Map HTTP probe outcome → health label (PROVIDER-007 subset). */
export function classifyProbeResult(
  ok: boolean,
  status: number,
): ProviderProbeHealth {
  if (ok) return 'healthy';
  if (status === 401 || status === 403) return 'degraded';
  if (status === 429) return 'degraded';
  if (status >= 500) return 'offline';
  if (status === 0) return 'offline';
  return 'unknown';
}

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
