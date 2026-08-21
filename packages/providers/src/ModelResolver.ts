/**
 * MODEL-002 / UXPROV-006 — Resolve which connection serves a logical model.
 * Default rank: Local > recent success > drag priority (preferUserOrder overrides).
 */
import { isLocalBaseUrl } from './detectProviderType';
import { findConnectionsForModel } from './ModelRegistry';
import {
  getPreferUserOrder,
  getProviderConnections,
  profileIdForConnectionModel,
  type ProviderConnection,
} from './ProviderConnections';
import {
  activateProviderProfile,
  findProviderProfileForModel,
  getActiveProviderProfileId,
  getProviderProfiles,
  type ProviderProfile,
} from './ProviderProfiles';

/** Rank candidate connections for the same model (local-first unless preferUserOrder). */
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

export function resolveConnectionForModel(modelOrCanonical: string):
  | {
      connection: ProviderConnection;
      originalModelId: string;
    }
  | undefined {
  const hits = findConnectionsForModel(modelOrCanonical);
  if (hits.length === 0) return undefined;
  const ranked = rankConnections(hits.map((h) => h.connection));
  const picked = ranked[0];
  const hit = hits.find((h) => h.connection.id === picked.id) || hits[0];
  return { connection: hit.connection, originalModelId: hit.originalModelId };
}

/** Activate the profile for the resolved connection+model (MODEL-007 persistence path). */
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
