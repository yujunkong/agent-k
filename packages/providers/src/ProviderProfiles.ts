// ConfigManager remains in src/core until @agent-k/core lands.
import { configManager } from '../../../src/core/ConfigManager';
import { normalizeModelId } from './normalizeModelId';
import type { ProviderType } from './types';

export const PROVIDER_PROFILES_KEY = 'agent-k.provider.profiles';
export const ACTIVE_PROFILE_KEY = 'agent-k.provider.activeProfileId';

export interface ProviderProfile {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey?: string;
  model: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  /** ProviderConnections 레지스트리의 연결 id (없으면 레거시 per-model 프로필) */
  connectionId?: string;
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
    /* non-webview context */
  }
}

function readProfiles(): ProviderProfile[] {
  const raw = configManager.get(PROVIDER_PROFILES_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is ProviderProfile =>
    !!p && typeof p === 'object' &&
    typeof (p as ProviderProfile).id === 'string' &&
    typeof (p as ProviderProfile).type === 'string' &&
    typeof (p as ProviderProfile).baseUrl === 'string' &&
    typeof (p as ProviderProfile).model === 'string'
  );
}

function writeProfiles(profiles: ProviderProfile[]): void {
  configManager.update({ [PROVIDER_PROFILES_KEY]: profiles });
  persistToHost({ [PROVIDER_PROFILES_KEY]: profiles });
}

export function getProviderProfiles(): ProviderProfile[] {
  return [...readProfiles()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getActiveProviderProfileId(): string | null {
  const id = String(configManager.get(ACTIVE_PROFILE_KEY) || '').trim();
  return id || null;
}

export function makeProviderProfileId(type: ProviderType, model: string): string {
  const safe = `${type}-${model}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safe || `${type}-${Date.now()}`;
}

export function upsertProviderProfile(input: Partial<ProviderProfile> & {
  type: ProviderType;
  baseUrl: string;
  model: string;
  id?: string;
  name?: string;
}): ProviderProfile {
  const now = Date.now();
  const current = readProfiles();
  const id = input.id || makeProviderProfileId(input.type, input.model);
  const existing = current.find((p) => p.id === id);
  const profile: ProviderProfile = {
    id,
    name: input.name || existing?.name || `${input.type} / ${input.model}`,
    type: input.type,
    baseUrl: input.baseUrl.replace(/\/$/, ''),
    apiKey: input.apiKey,
    model: input.model,
    enabled: input.enabled ?? existing?.enabled ?? true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    connectionId: input.connectionId ?? existing?.connectionId
  };
  const next = existing
    ? current.map((p) => p.id === id ? profile : p)
    : [...current, profile];
  writeProfiles(next);
  return profile;
}

export function removeProviderProfile(profileId: string): boolean {
  const current = readProfiles();
  const next = current.filter((p) => p.id !== profileId);
  if (next.length === current.length) return false;
  writeProfiles(next);

  if (getActiveProviderProfileId() === profileId) {
    const nextActive = next.find((p) => p.enabled)?.id || '';
    configManager.update({ [ACTIVE_PROFILE_KEY]: nextActive });
    persistToHost({ [ACTIVE_PROFILE_KEY]: nextActive });
    if (nextActive) activateProviderProfile(nextActive);
  }
  return true;
}

export function activateProviderProfile(profileId: string): ProviderProfile | undefined {
  const profile = readProfiles().find((p) => p.id === profileId && p.enabled);
  if (!profile) return undefined;

  const apiKeys = configManager.get('agent-k.provider.apiKeys');
  const nextApiKeys: Record<string, string> =
    apiKeys && typeof apiKeys === 'object' && !Array.isArray(apiKeys)
      ? { ...(apiKeys as Record<string, string>) }
      : {};
  if (profile.apiKey) nextApiKeys[profile.type] = profile.apiKey;

  const values: Record<string, unknown> = {
    [ACTIVE_PROFILE_KEY]: profile.id,
    'agent-k.provider.type': profile.type,
    'agent-k.provider.baseUrl': profile.baseUrl,
    'agent-k.provider.model': profile.model,
    'agent-k.provider.apiKey': profile.apiKey || '',
    'agent-k.provider.apiKeys': nextApiKeys
  };
  configManager.update(values);
  persistToHost(values);
  return profile;
}

export function findProviderProfileForModel(model: string): ProviderProfile | undefined {
  const enabled = readProfiles().filter((p) => p.enabled);
  const exact = enabled.filter((p) => p.model === model);
  const canon = normalizeModelId(model);
  const profiles = exact.length > 0
    ? exact
    : enabled.filter((p) => canon && normalizeModelId(p.model) === canon);
  if (profiles.length === 0) return undefined;
  const active = getActiveProviderProfileId();
  return profiles.find((p) => p.id === active) || profiles[0];
}
