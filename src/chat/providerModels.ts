/**
 * Registered models for Composer dropdown + Settings.
 * Server /v1/models is only a picker source in Settings — never dumped into the chat UI.
 */
import { configManager } from '../core/ConfigManager';

const REGISTERED_KEY = 'agent-k.provider.models';
/** @deprecated leftover from dumping /v1/models into the UI */
const LEGACY_AVAILABLE_KEY = 'agent-k.provider.availableModels';

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

/** Models the user explicitly registered (Composer dropdown source). */
export function getRegisteredModels(): string[] {
  const raw = configManager.get(REGISTERED_KEY);
  const current = String(configManager.get('agent-k.provider.model') || '').trim();
  let ids: string[] = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : [];

  // Migrate: old sessions cached the entire /v1/models catalog — drop it
  const legacy = configManager.get(LEGACY_AVAILABLE_KEY);
  if (Array.isArray(legacy) && legacy.length > 20 && ids.length === 0) {
    ids = current ? [current] : [];
    configManager.set(REGISTERED_KEY, ids);
    configManager.set(LEGACY_AVAILABLE_KEY, []);
  } else if (ids.length === 0 && current) {
    ids = [current];
  } else if (current && !ids.includes(current)) {
    ids = [...ids, current];
  }

  return uniqSorted(ids);
}

export function setRegisteredModels(ids: string[]): void {
  const unique = uniqSorted(ids);
  configManager.set(REGISTERED_KEY, unique);
  // Clear legacy dump so it can't leak back into the UI
  if (configManager.get(LEGACY_AVAILABLE_KEY)) {
    configManager.set(LEGACY_AVAILABLE_KEY, []);
  }
}

export function addRegisteredModel(id: string): string[] {
  const next = uniqSorted([...getRegisteredModels(), id]);
  setRegisteredModels(next);
  return next;
}

export function removeRegisteredModel(id: string): string[] {
  const next = getRegisteredModels().filter((m) => m !== id);
  setRegisteredModels(next);
  return next;
}

export function persistProviderModel(model: string): void {
  const registered = getRegisteredModels();
  const models = registered.includes(model) ? registered : uniqSorted([...registered, model]);
  const values: Record<string, unknown> = {
    'agent-k.provider.model': model,
    [REGISTERED_KEY]: models
  };
  configManager.update(values);
  persistToHost({ 'agent-k.provider.model': model });
}

/** @deprecated use getRegisteredModels */
export function getCachedAvailableModels(): string[] {
  return getRegisteredModels();
}

/** @deprecated no-op for full catalog; use setRegisteredModels / addRegisteredModel */
export function setCachedAvailableModels(ids: string[]): void {
  // Intentionally do not store full server catalogs
  void ids;
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
      ? `OK — model "${model}" listed (${modelIds.length} models on server)`
      : modelIds.length > 0
        ? `OK — server reachable (${modelIds.length} models on server). Add only the ones you need below.`
        : 'OK — server reachable (no models in list).';

  return { ok: found || modelIds.length > 0 || !model, status: response.status, detail, modelIds };
}

export type ProviderModelsResult = {
  ok: boolean;
  status?: number;
  detail: string;
  modelIds: string[];
};

/**
 * Probe the provider. Returns server model ids for Settings "Add" picker only —
 * does NOT write them into the Composer registered list.
 */
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
