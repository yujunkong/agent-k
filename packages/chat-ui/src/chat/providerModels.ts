/**
 * Persistent provider/model catalog for the Composer.
 * Connections own models; Composer shows a unified (normalized) list.
 * Selecting a model activates the resolved connection (Local > recent > user order).
 */
import { configManager } from '../core/ConfigManager';
import {
  applyProbeToConnection,
  findConnectionByEndpoint,
  getProviderConnections
} from '../providers/ProviderConnections';
import { listUnifiedModels, type UnifiedModel } from '../providers/ModelRegistry';
import { normalizeModelId } from '../providers/normalizeModelId';
import { resolveAndActivateModel } from '../providers/ModelResolver';
import { classifyProbeResult, type ProviderHealthStatus } from '../providers/providerStatus';
import {
  activateProviderProfile,
  findProviderProfileForModel,
} from '../providers/ProviderProfiles';

const AVAILABLE_KEY = 'agent-k.provider.availableModels';
const LEGACY_REGISTERED_KEY = 'agent-k.provider.models';

function getVsCodeApi(): { postMessage: (msg: unknown) => void } | null {
  try {
    const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    return api?.postMessage ? api : null;
  } catch { return null; }
}

function persistToHost(values: Record<string, unknown>): void {
  const api = getVsCodeApi();
  if (api) { api.postMessage({ type: 'config.update', values }); return; }
  try { window.parent.postMessage({ type: 'config.update', values }, '*'); } catch {}
}

function uniqSorted(ids: string[]): string[] {
  return [...new Set(ids.filter((x) => typeof x === 'string' && x.trim()))].sort((a, b) => a.localeCompare(b));
}

function syncCatalogFromUnified(): string[] {
  const unified = listUnifiedModels();
  if (unified.length > 0) {
    const ids = uniqSorted(unified.map((m) => m.canonicalId));
    configManager.update({ [AVAILABLE_KEY]: ids, [LEGACY_REGISTERED_KEY]: ids });
    persistToHost({ [AVAILABLE_KEY]: ids, [LEGACY_REGISTERED_KEY]: ids });
    return ids;
  }
  const connections = getProviderConnections();
  const fromConnections = connections.flatMap((c) => [
    ...(Array.isArray(c.discoveredModels) ? c.discoveredModels : []),
    ...(Array.isArray(c.manualModels) ? c.manualModels : []),
  ]);
  const current = String(configManager.get('agent-k.provider.model') || '').trim();
  return uniqSorted([
    ...fromConnections.filter((x): x is string => typeof x === 'string'),
    ...(current ? [current] : []),
  ]);
}

/** Canonical model ids for the Composer dropdown (deduped). */
export function getComposerModels(): string[] {
  const unified = listUnifiedModels();
  if (unified.length > 0) return uniqSorted(unified.map((m) => m.canonicalId));
  return syncCatalogFromUnified();
}

export function getUnifiedComposerModels(): UnifiedModel[] {
  return listUnifiedModels();
}

export function setAvailableModels(ids: string[]): string[] {
  const unique = uniqSorted(ids);
  configManager.update({ [AVAILABLE_KEY]: unique, [LEGACY_REGISTERED_KEY]: unique });
  persistToHost({ [AVAILABLE_KEY]: unique, [LEGACY_REGISTERED_KEY]: unique });
  return unique;
}

export function mergeAvailableModels(ids: string[]): string[] {
  return setAvailableModels([...getComposerModels(), ...ids.map((id) => normalizeModelId(id) || id)]);
}

export function shouldReplaceComposerCatalog(providerType?: string): boolean {
  const type = String(providerType ?? configManager.get('agent-k.provider.type') ?? '');
  return type === 'opencode-zen' || type === 'opencode-go';
}

/** Activate the resolved connection for a (possibly canonical) model id. */
export function persistProviderModel(model: string): void {
  const requested = String(model || '').trim();
  if (!requested) return;
  const activated = resolveAndActivateModel(requested);
  if (!activated) {
    const profile = findProviderProfileForModel(requested);
    if (profile) activateProviderProfile(profile.id);
  }
  // Comment: activate writes profile.model — always re-stamp the user's pick afterward
  configManager.update({ 'agent-k.provider.model': requested });
  persistToHost({ 'agent-k.provider.model': requested });
  syncCatalogFromUnified();
}

function setActiveProviderModel(model: string): void {
  persistProviderModel(model);
}

export function getRegisteredModels(): string[] { return getComposerModels(); }
export function setRegisteredModels(ids: string[]): void { setAvailableModels(ids); }
export function addRegisteredModel(id: string): string[] { return mergeAvailableModels([id]); }
export function removeRegisteredModel(id: string): string[] { return setAvailableModels(getComposerModels().filter((m) => m !== id)); }
export function getCachedAvailableModels(): string[] { return getComposerModels(); }
export function setCachedAvailableModels(ids: string[]): void { setAvailableModels(ids); }

function testViaExtensionHost(
  baseUrl: string,
  apiKey: string,
  model?: string,
  extraHeaders?: Record<string, string>
): Promise<{ ok: boolean; status?: number; detail: string; modelIds?: string[] }> {
  return new Promise((resolve, reject) => {
    const requestId = `provider-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const api = getVsCodeApi();
    if (!api) { reject(new Error('VS Code API unavailable')); return; }
    const timeoutMs = 12000;
    const timer = window.setTimeout(() => { window.removeEventListener('message', onMessage); reject(new Error('Connection test timed out (extension host)')); }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'provider.test.result' || data.requestId !== requestId) return;
      window.removeEventListener('message', onMessage); window.clearTimeout(timer);
      resolve({ ok: Boolean(data.ok), status: data.status, detail: String(data.detail ?? ''), modelIds: Array.isArray(data.modelIds) ? data.modelIds : undefined });
    };
    window.addEventListener('message', onMessage);
    api.postMessage({
      type: 'provider.test',
      requestId,
      baseUrl,
      apiKey: apiKey || undefined,
      model: model || undefined,
      extraHeaders: extraHeaders && Object.keys(extraHeaders).length ? extraHeaders : undefined
    });
  });
}

export type ProviderModelsResult = {
  ok: boolean;
  status?: number;
  detail: string;
  modelIds: string[];
  health: ProviderHealthStatus;
};

function withHealth(result: { ok: boolean; status?: number; detail: string; modelIds: string[] }): ProviderModelsResult {
  return { ...result, health: classifyProbeResult(result.ok, result.status) };
}

export async function fetchProviderModels(opts?: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  extraHeaders?: Record<string, string>;
}): Promise<ProviderModelsResult> {
  const baseUrl = String(opts?.baseUrl ?? configManager.get('agent-k.provider.baseUrl') ?? '').replace(/\/$/, '');
  const apiKey = String(opts?.apiKey ?? configManager.get('agent-k.provider.apiKey') ?? '');
  const model = String(opts?.model ?? '');
  if (!baseUrl) return withHealth({ ok: false, detail: 'Base URL is empty', modelIds: [] });
  // B-2: no network from the webview — the host owns the provider probe.
  const api = getVsCodeApi();
  if (!api) {
    return withHealth({ ok: false, detail: 'Extension host unavailable', modelIds: [] });
  }
  try {
    const result = await testViaExtensionHost(baseUrl, apiKey, model || undefined, opts?.extraHeaders);
    return withHealth({ ok: result.ok, status: result.status, detail: result.detail, modelIds: result.modelIds || [] });
  } catch (e: unknown) {
    return withHealth({ ok: false, detail: e instanceof Error ? e.message : String(e), modelIds: [] });
  }
}

export async function refreshComposerModels(opts?: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  replace?: boolean;
  providerType?: string;
  extraHeaders?: Record<string, string>;
  connectionId?: string;
}): Promise<ProviderModelsResult> {
  const result = await fetchProviderModels(opts);
  const conn =
    (opts?.connectionId ? getProviderConnections().find((c) => c.id === opts.connectionId) : undefined) ||
    findConnectionByEndpoint(String(opts?.baseUrl || configManager.get('agent-k.provider.baseUrl') || ''), opts?.providerType);
  if (conn) {
    applyProbeToConnection(conn.id, result);
  } else if (result.ok && result.modelIds.length > 0) {
    const active = String(opts?.model ?? configManager.get('agent-k.provider.model') ?? '').trim();
    const replace = opts?.replace === true || (opts?.replace !== false && shouldReplaceComposerCatalog(opts?.providerType));
    if (replace) {
      setAvailableModels(result.modelIds);
      if (!active || !result.modelIds.includes(active)) setActiveProviderModel(result.modelIds[0]);
    } else {
      mergeAvailableModels(active && !result.modelIds.includes(active) ? [active, ...result.modelIds] : result.modelIds);
      if (!active && result.modelIds[0]) persistProviderModel(result.modelIds[0]);
    }
  }
  return { ...result, modelIds: result.ok ? getComposerModels() : result.modelIds };
}
