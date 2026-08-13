/**
 * Provider model catalog for Composer dropdown.
 * Persisted to VS Code settings so reconnect / webview reload does not wipe picks.
 */
import { configManager } from '../core/ConfigManager';

const AVAILABLE_KEY = 'agent-k.provider.availableModels';
/** @deprecated was a manual register list; migrated into availableModels */
const LEGACY_REGISTERED_KEY = 'agent-k.provider.models';

function getVsCodeApi(): { postMessage: (msg: unknown) => void } | null {
  try {
    const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    return api?.postMessage ? api : null;
  } catch {
    return null;
  }
}

function persistToHost(values: Record<string, unknown>): void {
  try {
    const vscodeApi = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    if (vscodeApi?.postMessage) {
      vscodeApi.postMessage({ type: 'config.update', values });
      return;
    }
  } catch {
    /* ignore */
  }
  window.parent.postMessage({ type: 'config.update', values }, '*');
}

function uniqSorted(ids: string[]): string[] {
  return [...new Set(ids.filter((x) => typeof x === 'string' && x.trim()))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function readStringList(key: string): string[] {
  const raw = configManager.get(key);
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : [];
}

/** Models shown in the chat Composer dropdown (from last successful /v1/models). */
export function getComposerModels(): string[] {
  const current = String(configManager.get('agent-k.provider.model') || '').trim();
  let ids = readStringList(AVAILABLE_KEY);

  // One-time migrate: old manual register list → composer catalog
  if (ids.length === 0) {
    const legacy = readStringList(LEGACY_REGISTERED_KEY);
    if (legacy.length > 0) {
      ids = legacy;
      configManager.set(AVAILABLE_KEY, ids);
    }
  }

  if (ids.length === 0 && current) {
    ids = [current];
  } else if (current && !ids.includes(current)) {
    ids = [current, ...ids];
  }

  return uniqSorted(ids);
}

/** Cache server catalog for Composer — always persist to host settings. */
export function setAvailableModels(ids: string[]): string[] {
  const unique = uniqSorted(ids);
  configManager.update({
    [AVAILABLE_KEY]: unique,
    [LEGACY_REGISTERED_KEY]: unique
  });
  persistToHost({
    [AVAILABLE_KEY]: unique,
    [LEGACY_REGISTERED_KEY]: unique
  });
  return unique;
}

/**
 * Union existing catalog with new ids (never drop models the user already had).
 */
export function mergeAvailableModels(ids: string[]): string[] {
  return setAvailableModels([...getComposerModels(), ...ids]);
}

/**
 * OpenCode Zen / Go expose a curated remote catalog — keep Composer in sync
 * by replacing the previous list (e.g. leftover local MLX ids) instead of merging.
 */
export function shouldReplaceComposerCatalog(providerType?: string): boolean {
  const type = (
    providerType ??
    configManager.get('agent-k.provider.type') ??
    ''
  ).toString();
  return type === 'opencode-zen' || type === 'opencode-go';
}

export function persistProviderModel(model: string): void {
  const nextModels = uniqSorted([model, ...getComposerModels()]);
  configManager.update({
    'agent-k.provider.model': model,
    [AVAILABLE_KEY]: nextModels,
    [LEGACY_REGISTERED_KEY]: nextModels
  });
  persistToHost({
    'agent-k.provider.model': model,
    [AVAILABLE_KEY]: nextModels,
    [LEGACY_REGISTERED_KEY]: nextModels
  });
}

/** Set active model without growing the catalog (used after a replace refresh). */
function setActiveProviderModel(model: string): void {
  configManager.update({ 'agent-k.provider.model': model });
  persistToHost({ 'agent-k.provider.model': model });
}

/** @deprecated use getComposerModels */
export function getRegisteredModels(): string[] {
  return getComposerModels();
}

/** @deprecated use setAvailableModels */
export function setRegisteredModels(ids: string[]): void {
  setAvailableModels(ids);
}

/** @deprecated */
export function addRegisteredModel(id: string): string[] {
  return mergeAvailableModels([id]);
}

/** @deprecated */
export function removeRegisteredModel(id: string): string[] {
  return setAvailableModels(getComposerModels().filter((m) => m !== id));
}

/** @deprecated use getComposerModels */
export function getCachedAvailableModels(): string[] {
  return getComposerModels();
}

/** @deprecated use setAvailableModels */
export function setCachedAvailableModels(ids: string[]): void {
  setAvailableModels(ids);
}

function testViaExtensionHost(
  baseUrl: string,
  apiKey: string,
  model?: string
): Promise<{ ok: boolean; status?: number; detail: string; modelIds?: string[] }> {
  return new Promise((resolve, reject) => {
    const requestId = `provider-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const api = getVsCodeApi();
    if (!api) {
      reject(new Error('VS Code API unavailable'));
      return;
    }

    const timeoutMs = 12000;
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Connection test timed out (extension host)'));
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'provider.test.result' || data.requestId !== requestId) {
        return;
      }
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve({
        ok: Boolean(data.ok),
        status: data.status,
        detail: String(data.detail ?? ''),
        modelIds: Array.isArray(data.modelIds) ? data.modelIds : undefined
      });
    };

    window.addEventListener('message', onMessage);
    api.postMessage({
      type: 'provider.test',
      requestId,
      baseUrl,
      apiKey: apiKey || undefined,
      model: model || undefined
    });
  });
}

async function testViaDirectFetch(
  baseUrl: string,
  apiKey: string,
  model?: string
): Promise<{ ok: boolean; status?: number; detail: string; modelIds?: string[] }> {
  const root = baseUrl.replace(/\/$/, '');
  const response = await fetch(`${root}/v1/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    if (response.status === 401) {
      detail +=
        ' — Unauthorized. Check API Key, or use a local endpoint that does not require auth.';
    }
    return { ok: false, status: response.status, detail };
  }

  const data = await response.json();
  const modelIds: string[] = (data?.data || []).map((m: { id?: string }) => m.id).filter(Boolean);
  const found = model ? modelIds.includes(model) : false;
  const detail =
    model && found
      ? `OK — model "${model}" listed (${modelIds.length} models)`
      : modelIds.length > 0
        ? `OK — ${modelIds.length} models loaded into Composer`
        : 'OK — server reachable (no models in list).';

  return { ok: found || modelIds.length > 0 || !model, status: response.status, detail, modelIds };
}

export type ProviderModelsResult = {
  ok: boolean;
  status?: number;
  detail: string;
  modelIds: string[];
};

/** Probe the provider and return /v1/models ids. */
export async function fetchProviderModels(opts?: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}): Promise<ProviderModelsResult> {
  const baseUrl = (
    opts?.baseUrl ??
    configManager.get('agent-k.provider.baseUrl') ??
    ''
  )
    .toString()
    .replace(/\/$/, '');
  const apiKey = (
    opts?.apiKey ??
    configManager.get('agent-k.provider.apiKey') ??
    ''
  ).toString();
  const model = (opts?.model ?? configManager.get('agent-k.provider.model') ?? '').toString();

  if (!baseUrl) {
    return { ok: false, detail: 'Base URL is empty', modelIds: [] };
  }

  try {
    let result: { ok: boolean; status?: number; detail: string; modelIds?: string[] };
    const api = getVsCodeApi();
    if (api) {
      result = await testViaExtensionHost(baseUrl, apiKey, model || undefined);
    } else {
      await new Promise((r) => setTimeout(r, 100));
      const apiRetry = getVsCodeApi();
      if (apiRetry) {
        result = await testViaExtensionHost(baseUrl, apiKey, model || undefined);
      } else {
        result = await testViaDirectFetch(baseUrl, apiKey, model || undefined);
      }
    }

    return {
      ok: result.ok,
      status: result.status,
      detail: result.detail,
      modelIds: result.modelIds || []
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('extension host') || msg.includes('VS Code API')) {
      try {
        const fallback = await testViaDirectFetch(baseUrl, apiKey, model || undefined);
        return {
          ok: fallback.ok,
          status: fallback.status,
          detail: fallback.detail,
          modelIds: fallback.modelIds || []
        };
      } catch (inner: unknown) {
        return {
          ok: false,
          detail: inner instanceof Error ? inner.message : 'Connection failed',
          modelIds: []
        };
      }
    }
    return { ok: false, detail: msg || 'Connection failed', modelIds: [] };
  }
}

/**
 * Fetch /v1/models into the Composer catalog.
 * Default: merge (keep prior picks). Pass `replace: true` (or OpenCode Zen/Go)
 * to wipe the previous catalog and keep only server models.
 */
export async function refreshComposerModels(opts?: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** When true, replace catalog instead of merging. Defaults for OpenCode Zen/Go. */
  replace?: boolean;
  providerType?: string;
}): Promise<ProviderModelsResult> {
  const result = await fetchProviderModels(opts);
  if (result.ok && result.modelIds.length > 0) {
    const active = String(
      opts?.model ?? configManager.get('agent-k.provider.model') ?? ''
    ).trim();
    const replace =
      opts?.replace === true ||
      (opts?.replace !== false &&
        shouldReplaceComposerCatalog(opts?.providerType));

    if (replace) {
      setAvailableModels(result.modelIds);
      if (!active || !result.modelIds.includes(active)) {
        setActiveProviderModel(result.modelIds[0]);
      }
    } else {
      mergeAvailableModels(
        active && !result.modelIds.includes(active)
          ? [active, ...result.modelIds]
          : result.modelIds
      );
      // Only pick a default when nothing is selected yet
      if (!active && result.modelIds[0]) {
        persistProviderModel(result.modelIds[0]);
      }
    }
  }
  return {
    ...result,
    modelIds: result.ok ? getComposerModels() : result.modelIds
  };
}
