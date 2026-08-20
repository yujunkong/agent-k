/**
 * Model Resolver — 같은 모델의 여러 Provider 중 하나를 고른다.
 * 기본: Local > 최근 성공 > 사용자 지정(드래그) > 기타
 * 사용자가 목록을 드래그하면 preferUserOrder 가 켜지고 그 순서를 따른다.
 */
import { isLocalBaseUrl } from './detectProviderType';
import { findConnectionsForModel } from './ModelRegistry';
import {
  getPreferUserOrder,
  getProviderConnections,
  profileIdForConnectionModel,
  type ProviderConnection
} from './ProviderConnections';
import {
  activateProviderProfile,
  findProviderProfileForModel,
  getActiveProviderProfileId,
  getProviderProfiles,
  type ProviderProfile
} from './ProviderProfiles';

export function rankConnections(candidates: ProviderConnection[]): ProviderConnection[] {
  if (candidates.length <= 1) return [...candidates];
  if (getPreferUserOrder()) {
    return [...candidates].sort((a, b) => a.priority - b.priority);
  }
  return [...candidates].sort((a, b) => {
    const localA = isLocalBaseUrl(a.baseUrl) ? 0 : 1;
    const localB = isLocalBaseUrl(b.baseUrl) ? 0 : 1;
    if (localA !== localB) return localA - localB;
    const recentA = a.lastSuccessAt || 0;
    const recentB = b.lastSuccessAt || 0;
    if (recentA !== recentB) return recentB - recentA;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name);
  });
}

export function resolveConnectionForModel(modelOrCanonical: string): {
  connection: ProviderConnection;
  originalModelId: string;
} | undefined {
  const hits = findConnectionsForModel(modelOrCanonical);
  if (hits.length === 0) return undefined;
  const ranked = rankConnections(hits.map((h) => h.connection));
  const picked = ranked[0];
  const hit = hits.find((h) => h.connection.id === picked.id) || hits[0];
  return { connection: hit.connection, originalModelId: hit.originalModelId };
}

export function resolveAndActivateModel(modelOrCanonical: string): ProviderProfile | undefined {
  const resolved = resolveConnectionForModel(modelOrCanonical);
  if (!resolved) {
    return findProviderProfileForModel(modelOrCanonical);
  }
  const profileId = profileIdForConnectionModel(resolved.connection.id, resolved.originalModelId);
  const profile =
    getProviderProfiles().find((p) => p.id === profileId) ||
    findProviderProfileForModel(resolved.originalModelId);
  if (!profile) return undefined;
  return activateProviderProfile(profile.id);
}

export function getActiveProviderName(): string | undefined {
  const connections = getProviderConnections();
  const id = getActiveProviderProfileId();
  const profile = getProviderProfiles().find((p) => p.id === id);
  if (!profile) return undefined;
  const conn = connections.find((c) => c.id === profile.connectionId);
  return conn?.name || profile.name.split('/')[0]?.trim();
}
