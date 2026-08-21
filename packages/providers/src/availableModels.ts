/**
 * MODEL-006 / MODEL-007 / UXPROV-002 — Available model catalog + composer persistence.
 * Domain-only: uses ProviderConfigStore + probe; no vscode / postMessage.
 */
import { getProviderConfigStore } from './configStore';
import { listUnifiedModels, type UnifiedModel } from './ModelRegistry';
import { resolveAndActivateModel } from './ModelResolver';
import { normalizeModelId } from './normalizeModelId';
import {
  applyProbeToConnection,
  findConnectionByEndpoint,
  getProviderConnections,
} from './ProviderConnections';
import {
  activateProviderProfile,
  findProviderProfileForModel,
  getProviderProfiles,
} from './ProviderProfiles';
import { probeProviderEndpoint, type ProviderProbeResult } from './providerProbe';
import { classifyProbeResult, type ProviderHealthStatus } from './providerStatus';

export const AVAILABLE_MODELS_KEY = 'agent-k.provider.availableModels';
export const LEGACY_REGISTERED_MODELS_KEY = 'agent-k.provider.models';
export const ACTIVE_MODEL_KEY = 'agent-k.provider.model';
export const ACTIVE_PROVIDER_TYPE_KEY = 'agent-k.provider.type';
export const ACTIVE_BASE_URL_KEY = 'agent-k.provider.baseUrl';
export const ACTIVE_API_KEY_KEY = 'agent-k.provider.apiKey';

function uniqSorted(ids: string[]): string[] {
  return [...new Set(ids.filter((x) => typeof x === 'string' && x.trim()))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function readStringList(key: string): string[] {
  const raw = getProviderConfigStore().get(key);
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : [];
}

/** Sync persisted catalog from unified registry (or profiles/legacy fallback). */
export function syncCatalogFromUnified(): string[] {
  const store = getProviderConfigStore();
  const unified = listUnifiedModels();
  if (unified.length > 0) {
    const ids = uniqSorted(unified.map((m) => m.canonicalId));
    store.update({ [AVAILABLE_MODELS_KEY]: ids, [LEGACY_REGISTERED_MODELS_KEY]: ids });
    return ids;
  }
  const profileModels = getProviderProfiles()
    .filter((p) => p.enabled)
    .map((p) => p.model);
  const current = String(store.get(ACTIVE_MODEL_KEY) || '').trim();
  return uniqSorted([
    ...profileModels,
    ...readStringList(AVAILABLE_MODELS_KEY),
    ...readStringList(LEGACY_REGISTERED_MODELS_KEY),
    ...(current ? [current] : []),
  ]);
}

/** Canonical model ids for Composer dropdown (deduped). */
export function getComposerModels(): string[] {
  const unified = listUnifiedModels();
  if (unified.length > 0) return uniqSorted(unified.map((m) => m.canonicalId));
  return syncCatalogFromUnified();
}

export function getAvailableModels(): string[] {
  return getComposerModels();
}

export function getUnifiedComposerModels(): UnifiedModel[] {
  return listUnifiedModels();
}

export function setAvailableModels(ids: string[]): string[] {
  const unique = uniqSorted(ids);
  getProviderConfigStore().update({
    [AVAILABLE_MODELS_KEY]: unique,
    [LEGACY_REGISTERED_MODELS_KEY]: unique,
  });
  return unique;
}

export function mergeAvailableModels(ids: string[]): string[] {
  return setAvailableModels([
    ...getComposerModels(),
    ...ids.map((id) => normalizeModelId(id) || id),
  ]);
}

/** OpenCode catalog replace heuristic omitted (PROVIDER-015 skipped). */
export function shouldReplaceComposerCatalog(_providerType?: string): boolean {
  return false;
}

/** Persist selected model + activate resolved connection (MODEL-007). */
export function persistSelectedModel(model: string): void {
  const activated = resolveAndActivateModel(model);
  if (!activated) {
    const profile = findProviderProfileForModel(model);
    if (profile) activateProviderProfile(profile.id);
    else getProviderConfigStore().update({ [ACTIVE_MODEL_KEY]: model });
  }
  syncCatalogFromUnified();
}

/** @deprecated alias — prefer persistSelectedModel */
export function persistProviderModel(model: string): void {
  persistSelectedModel(model);
}

export function getRegisteredModels(): string[] {
  return getComposerModels();
}
export function setRegisteredModels(ids: string[]): void {
  setAvailableModels(ids);
}
export function addRegisteredModel(id: string): string[] {
  return mergeAvailableModels([id]);
}
export function removeRegisteredModel(id: string): string[] {
  return setAvailableModels(getComposerModels().filter((m) => m !== id));
}
export function getCachedAvailableModels(): string[] {
  return getComposerModels();
}
export function setCachedAvailableModels(ids: string[]): void {
  setAvailableModels(ids);
}

export type ProviderModelsResult = {
  ok: boolean;
  status?: number;
  detail: string;
  modelIds: string[];
  health: ProviderHealthStatus;
};

function withHealth(
  result: { ok: boolean; status?: number; detail: string; modelIds: string[] },
): ProviderModelsResult {
  return { ...result, health: classifyProbeResult(result.ok, result.status) };
}

/**
 * UXPROV-001 — Connection / model-list probe (inject fetch for host CSP bypass).
 */
export async function testProviderConnection(opts?: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): Promise<ProviderModelsResult> {
  const store = getProviderConfigStore();
  const baseUrl = String(opts?.baseUrl ?? store.get(ACTIVE_BASE_URL_KEY) ?? '').replace(/\/$/, '');
  const apiKey = String(opts?.apiKey ?? store.get(ACTIVE_API_KEY_KEY) ?? '');
  const model = String(opts?.model ?? '');
  if (!baseUrl) return withHealth({ ok: false, detail: 'Base URL is empty', modelIds: [] });

  const probe: ProviderProbeResult = await probeProviderEndpoint(
    {
      baseUrl,
      apiKey: apiKey || undefined,
      model: model || undefined,
      extraHeaders: opts?.extraHeaders,
    },
    opts?.fetchImpl ?? fetch,
  );
  return withHealth({
    ok: probe.ok,
    status: probe.status,
    detail: probe.detail,
    modelIds: probe.modelIds || [],
  });
}

/** @deprecated alias for UXPROV-001 */
export async function fetchProviderModels(
  opts?: Parameters<typeof testProviderConnection>[0],
): Promise<ProviderModelsResult> {
  return testProviderConnection(opts);
}

/**
 * UXPROV-002 — Probe then refresh connection discovered models + catalog.
 */
export async function refreshAvailableModels(opts?: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  replace?: boolean;
  providerType?: string;
  extraHeaders?: Record<string, string>;
  connectionId?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProviderModelsResult> {
  const store = getProviderConfigStore();
  const result = await testProviderConnection(opts);
  const conn =
    (opts?.connectionId
      ? getProviderConnections().find((c) => c.id === opts.connectionId)
      : undefined) ||
    findConnectionByEndpoint(
      String(opts?.baseUrl || store.get(ACTIVE_BASE_URL_KEY) || ''),
      opts?.providerType,
    );

  if (conn) {
    applyProbeToConnection(conn.id, result);
  } else if (result.ok && result.modelIds.length > 0) {
    const active = String(opts?.model ?? store.get(ACTIVE_MODEL_KEY) ?? '').trim();
    const replace =
      opts?.replace === true ||
      (opts?.replace !== false && shouldReplaceComposerCatalog(opts?.providerType));
    if (replace) {
      setAvailableModels(result.modelIds);
      if (!active || !result.modelIds.includes(active)) persistSelectedModel(result.modelIds[0]);
    } else {
      mergeAvailableModels(
        active && !result.modelIds.includes(active) ? [active, ...result.modelIds] : result.modelIds,
      );
      if (!active && result.modelIds[0]) persistSelectedModel(result.modelIds[0]);
    }
  }

  return { ...result, modelIds: result.ok ? getComposerModels() : result.modelIds };
}

/** @deprecated alias — prefer refreshAvailableModels */
export async function refreshComposerModels(
  opts?: Parameters<typeof refreshAvailableModels>[0],
): Promise<ProviderModelsResult> {
  return refreshAvailableModels(opts);
}
