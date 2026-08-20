/**
 * Provider Connection 레지스트리.
 *
 * UX 엔티티는 "연결" 단위 (Name + Base URL + API Key).
 * 모델은 discovered/manual 리스트로 붙고, 기존 ProviderProfile 은
 * 호스트 활성화용으로 동기화한다 (type/baseUrl/apiKey/model).
 */
// ConfigManager remains in src/core until @agent-k/core lands.
import { configManager } from '../../../src/core/ConfigManager';
import { isLocalBaseUrl } from './detectProviderType';
import { modelIdsMatch, normalizeModelId } from './normalizeModelId';
import {
  activateProviderProfile,
  getProviderProfiles,
  removeProviderProfile,
  upsertProviderProfile,
  type ProviderProfile
} from './ProviderProfiles';
import {
  classifyProbeResult,
  effectiveHealthStatus,
  type ProviderHealthStatus
} from './providerStatus';
import type { ProviderType } from './types';

export const PROVIDER_CONNECTIONS_KEY = 'agent-k.provider.connections';
export const PREFER_USER_ORDER_KEY = 'agent-k.provider.preferUserOrder';

export interface ProviderConnection {
  id: string;
  name: string;
  type: ProviderType;
  /** auto = Base URL 감지, manual = 고급 설정에서 사용자가 지정 */
  typeSource: 'auto' | 'manual';
  baseUrl: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
  discoveredModels: string[];
  manualModels: string[];
  status: ProviderHealthStatus;
  lastError?: string;
  lastCheckedAt?: number;
  modelsFetchedAt?: number;
  lastSuccessAt?: number;
  /** 낮을수록 우선 (드래그 순서). 기본은 추가 순 */
  priority: number;
  createdAt: number;
  updatedAt: number;
}

function vscodeApi(): { postMessage: (msg: unknown) => void } | null {
  try {
    const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    return api?.postMessage ? api : null;
  } catch {
    return null;
  }
}

function persistToHost(values: Record<string, unknown>): void {
  const api = vscodeApi();
  if (api) {
    api.postMessage({ type: 'config.update', values });
    return;
  }
  try {
    window.parent.postMessage({ type: 'config.update', values }, '*');
  } catch {
    /* non-webview */
  }
}

function isConnection(p: unknown): p is ProviderConnection {
  if (!p || typeof p !== 'object') return false;
  const o = p as ProviderConnection;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.type === 'string' &&
    typeof o.baseUrl === 'string' &&
    Array.isArray(o.discoveredModels) &&
    Array.isArray(o.manualModels)
  );
}

function readConnections(): ProviderConnection[] {
  const raw = configManager.get(PROVIDER_CONNECTIONS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isConnection).map((c) => ({
    ...c,
    typeSource: c.typeSource === 'manual' ? 'manual' : 'auto',
    discoveredModels: c.discoveredModels.filter((m) => typeof m === 'string'),
    manualModels: c.manualModels.filter((m) => typeof m === 'string'),
    priority: typeof c.priority === 'number' ? c.priority : 0,
    status: c.status || 'unknown',
    extraHeaders: c.extraHeaders && typeof c.extraHeaders === 'object' ? c.extraHeaders : undefined
  }));
}

function writeConnections(connections: ProviderConnection[]): void {
  configManager.update({ [PROVIDER_CONNECTIONS_KEY]: connections });
  persistToHost({ [PROVIDER_CONNECTIONS_KEY]: connections });
}

export function getPreferUserOrder(): boolean {
  return Boolean(configManager.get(PREFER_USER_ORDER_KEY));
}

export function setPreferUserOrder(value: boolean): void {
  configManager.update({ [PREFER_USER_ORDER_KEY]: value });
  persistToHost({ [PREFER_USER_ORDER_KEY]: value });
}

export function connectionModelIds(conn: Pick<ProviderConnection, 'discoveredModels' | 'manualModels'>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...conn.discoveredModels, ...conn.manualModels]) {
    const key = normalizeModelId(id) || id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

export function getProviderConnections(): ProviderConnection[] {
  migrateProfilesToConnections();
  return [...readConnections()].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export function getProviderConnection(id: string): ProviderConnection | undefined {
  return readConnections().find((c) => c.id === id);
}

export function makeConnectionId(name: string, baseUrl: string): string {
  const slug = `${name}-${baseUrl}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `pc-${slug || 'provider'}-${Date.now().toString(36)}`;
}

function nextPriority(existing: ProviderConnection[], baseUrl: string): number {
  if (existing.length === 0) return 0;
  if (isLocalBaseUrl(baseUrl)) {
    const locals = existing.filter((c) => isLocalBaseUrl(c.baseUrl));
    return locals.length === 0 ? 0 : Math.max(...locals.map((c) => c.priority)) + 1;
  }
  return Math.max(...existing.map((c) => c.priority)) + 1;
}

export function profileIdForConnectionModel(connectionId: string, model: string): string {
  const safe = normalizeModelId(model) || model.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  return `conn-${connectionId}-${safe}`.slice(0, 96);
}

/** 연결의 모델 목록을 기존 호스트 활성화용 ProviderProfile 로 투영 */
export function syncProfilesForConnection(conn: ProviderConnection): void {
  const models = connectionModelIds(conn);
  const existing = getProviderProfiles().filter((p) => p.connectionId === conn.id);
  const keep = new Set(models.map((m) => profileIdForConnectionModel(conn.id, m)));
  for (const profile of existing) {
    if (!keep.has(profile.id)) removeProviderProfile(profile.id);
  }
  for (const model of models) {
    upsertProviderProfile({
      id: profileIdForConnectionModel(conn.id, model),
      name: `${conn.name} / ${model.split('/').pop() || model}`,
      type: conn.type,
      baseUrl: conn.baseUrl,
      apiKey: conn.apiKey,
      model,
      enabled: true,
      connectionId: conn.id
    });
  }
}

export function upsertProviderConnection(
  input: Partial<ProviderConnection> & { name: string; type: ProviderType; baseUrl: string }
): ProviderConnection {
  const now = Date.now();
  const current = readConnections();
  const id = input.id || makeConnectionId(input.name, input.baseUrl);
  const existing = current.find((c) => c.id === id);
  const baseUrl = input.baseUrl.replace(/\/$/, '');
  const conn: ProviderConnection = {
    id,
    name: input.name.trim() || existing?.name || 'Provider',
    type: input.type,
    typeSource: input.typeSource || existing?.typeSource || 'auto',
    baseUrl,
    apiKey: input.apiKey !== undefined ? input.apiKey : existing?.apiKey,
    extraHeaders: input.extraHeaders !== undefined ? input.extraHeaders : existing?.extraHeaders,
    discoveredModels: input.discoveredModels ?? existing?.discoveredModels ?? [],
    manualModels: input.manualModels ?? existing?.manualModels ?? [],
    status: input.status ?? existing?.status ?? 'unknown',
    lastError: input.lastError !== undefined ? input.lastError : existing?.lastError,
    lastCheckedAt: input.lastCheckedAt ?? existing?.lastCheckedAt,
    modelsFetchedAt: input.modelsFetchedAt ?? existing?.modelsFetchedAt,
    lastSuccessAt: input.lastSuccessAt ?? existing?.lastSuccessAt,
    priority: input.priority ?? existing?.priority ?? nextPriority(current, baseUrl),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const next = existing ? current.map((c) => (c.id === id ? conn : c)) : [...current, conn];
  writeConnections(next);
  syncProfilesForConnection(conn);
  return conn;
}

export function removeProviderConnection(id: string): boolean {
  const current = readConnections();
  const next = current.filter((c) => c.id !== id);
  if (next.length === current.length) return false;
  writeConnections(next);
  for (const profile of getProviderProfiles().filter((p) => p.connectionId === id)) {
    removeProviderProfile(profile.id);
  }
  return true;
}

export function reorderProviderConnections(orderedIds: string[]): ProviderConnection[] {
  const current = readConnections();
  const byId = new Map(current.map((c) => [c.id, c]));
  const next: ProviderConnection[] = [];
  let priority = 0;
  for (const id of orderedIds) {
    const conn = byId.get(id);
    if (!conn) continue;
    next.push({ ...conn, priority, updatedAt: Date.now() });
    byId.delete(id);
    priority += 1;
  }
  for (const leftover of byId.values()) {
    next.push({ ...leftover, priority, updatedAt: Date.now() });
    priority += 1;
  }
  writeConnections(next);
  setPreferUserOrder(true);
  return getProviderConnections();
}

export function applyProbeToConnection(
  id: string,
  result: { ok: boolean; status?: number; detail?: string; modelIds?: string[] }
): ProviderConnection | undefined {
  const conn = readConnections().find((c) => c.id === id);
  if (!conn) return undefined;
  const now = Date.now();
  const status = classifyProbeResult(result.ok, result.status);
  const modelIds = (result.modelIds || []).filter((m) => typeof m === 'string' && m.trim());
  return upsertProviderConnection({
    ...conn,
    status,
    lastError: result.ok ? undefined : result.detail || 'Connection failed',
    lastCheckedAt: now,
    modelsFetchedAt: result.ok && modelIds.length > 0 ? now : conn.modelsFetchedAt,
    lastSuccessAt: result.ok ? now : conn.lastSuccessAt,
    discoveredModels: result.ok && modelIds.length > 0 ? modelIds : conn.discoveredModels
  });
}

export function addManualModel(connectionId: string, modelId: string): ProviderConnection | undefined {
  const id = modelId.trim();
  if (!id) return undefined;
  const conn = readConnections().find((c) => c.id === connectionId);
  if (!conn) return undefined;
  const already = connectionModelIds(conn).some((m) => modelIdsMatch(m, id));
  if (already) return conn;
  return upsertProviderConnection({
    ...conn,
    manualModels: [...conn.manualModels, id]
  });
}

export function removeManualModel(connectionId: string, modelId: string): ProviderConnection | undefined {
  const conn = readConnections().find((c) => c.id === connectionId);
  if (!conn) return undefined;
  return upsertProviderConnection({
    ...conn,
    manualModels: conn.manualModels.filter((m) => !modelIdsMatch(m, modelId)),
    discoveredModels: conn.discoveredModels.filter((m) => !modelIdsMatch(m, modelId))
  });
}

export function findConnectionByEndpoint(baseUrl: string, type?: string): ProviderConnection | undefined {
  const root = String(baseUrl || '').replace(/\/$/, '');
  if (!root) return undefined;
  const all = readConnections();
  const sameUrl = all.filter((c) => c.baseUrl.replace(/\/$/, '') === root);
  if (type) {
    const typed = sameUrl.find((c) => c.type === type);
    if (typed) return typed;
  }
  return sameUrl[0];
}

export function findConnectionForProfile(profile: ProviderProfile): ProviderConnection | undefined {
  if (profile.connectionId) return readConnections().find((c) => c.id === profile.connectionId);
  return readConnections().find(
    (c) => c.type === profile.type && c.baseUrl.replace(/\/$/, '') === profile.baseUrl.replace(/\/$/, '')
  );
}

/**
 * 기존 per-model ProviderProfile 을 연결 단위로 한 번만 승격.
 * 이미 connections 가 있으면 no-op.
 */
export function migrateProfilesToConnections(): void {
  const existing = readConnections();
  if (existing.length > 0) return;
  const profiles = getProviderProfiles().filter((p) => p.enabled);
  if (profiles.length === 0) return;
  const groups = new Map<string, ProviderProfile[]>();
  for (const profile of profiles) {
    const key = `${profile.type}::${profile.baseUrl.replace(/\/$/, '')}`;
    const list = groups.get(key) || [];
    list.push(profile);
    groups.set(key, list);
  }
  const now = Date.now();
  const migrated: ProviderConnection[] = [];
  let priority = 0;
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const urlA = a.split('::')[1] || '';
    const urlB = b.split('::')[1] || '';
    const localA = isLocalBaseUrl(urlA) ? 0 : 1;
    const localB = isLocalBaseUrl(urlB) ? 0 : 1;
    return localA - localB;
  });
  for (const key of sortedKeys) {
    const group = groups.get(key)!;
    const sample = group[0];
    const models = [...new Set(group.map((p) => p.model).filter(Boolean))];
    const conn: ProviderConnection = {
      id: makeConnectionId(sample.name.split('/')[0]?.trim() || sample.type, sample.baseUrl),
      name: sample.name.includes('/') ? sample.name.split('/')[0].trim() : sample.name,
      type: sample.type,
      typeSource: 'manual',
      baseUrl: sample.baseUrl.replace(/\/$/, ''),
      apiKey: group.find((p) => p.apiKey)?.apiKey,
      discoveredModels: models,
      manualModels: [],
      status: models.length > 0 ? 'connected' : 'unknown',
      lastCheckedAt: now,
      modelsFetchedAt: now,
      priority,
      createdAt: sample.createdAt || now,
      updatedAt: now
    };
    migrated.push(conn);
    priority += 1;
  }
  writeConnections(migrated);
  const oldIds = profiles.map((p) => p.id);
  for (const conn of migrated) syncProfilesForConnection(conn);
  for (const id of oldIds) {
    if (!id.startsWith('conn-')) removeProviderProfile(id);
  }
}

export function connectionHealth(conn: ProviderConnection, now = Date.now()): ProviderHealthStatus {
  return effectiveHealthStatus(conn.status, conn.modelsFetchedAt, now);
}
