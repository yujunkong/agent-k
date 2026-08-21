/**
 * PROVIDER-007 — Connection health classification (auth / rate-limit / stale).
 */

export type ProviderHealthStatus =
  | 'connected'
  | 'stale'
  | 'auth_failed'
  | 'rate_limited'
  | 'offline'
  | 'unknown';

/** Model list cache TTL (event-driven refresh; no forced polling) */
export const MODEL_LIST_STALE_MS = 24 * 60 * 60 * 1000;

export function classifyProbeFailure(status?: number): ProviderHealthStatus {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 429) return 'rate_limited';
  return 'offline';
}

export function classifyProbeResult(ok: boolean, status?: number): ProviderHealthStatus {
  if (ok) return 'connected';
  return classifyProbeFailure(status);
}

export function isModelListStale(
  fetchedAt?: number,
  now = Date.now(),
  ttlMs = MODEL_LIST_STALE_MS,
): boolean {
  if (!fetchedAt || fetchedAt <= 0) return true;
  return now - fetchedAt > ttlMs;
}

export function effectiveHealthStatus(
  status: ProviderHealthStatus,
  modelsFetchedAt?: number,
  now = Date.now(),
): ProviderHealthStatus {
  if (status === 'connected' && isModelListStale(modelsFetchedAt, now)) return 'stale';
  return status;
}

export function formatProviderStatusLine(opts: {
  status: ProviderHealthStatus;
  modelCount: number;
  isLocal?: boolean;
  modelsFetchedAt?: number;
  now?: number;
}): string {
  const local = opts.isLocal ? ' · Local' : '';
  switch (effectiveHealthStatus(opts.status, opts.modelsFetchedAt, opts.now)) {
    case 'connected':
      return `Connected · ${opts.modelCount} model${opts.modelCount === 1 ? '' : 's'}${local}`;
    case 'stale':
      return `Connected · model list stale${local}`;
    case 'auth_failed':
      return 'Auth failed';
    case 'rate_limited':
      return 'Rate limited';
    case 'offline':
      return 'Offline';
    default:
      return 'Not connected';
  }
}
