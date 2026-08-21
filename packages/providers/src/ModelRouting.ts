/**
 * MODEL-003 — Role → model-profile routing (chat/plan/coding/…).
 * Persists via ProviderConfigStore (CFG-008); no vscode / window postMessage.
 */
import { getProviderConfigStore } from './configStore';
import { getProviderProfiles, type ProviderProfile } from './ProviderProfiles';

export const AI_CONFIGURATION_KEY = 'agent-k.ai.configuration';

export type ModelRole = 'chat' | 'plan' | 'coding' | 'review' | 'debug' | 'research';

export interface ModelProfile {
  id: string;
  name: string;
  providerProfileId: string;
  enabled: boolean;
  temperature?: number;
  thinkingEffort?: 'low' | 'medium' | 'high' | 'max';
  maxTokens?: number;
  createdAt: number;
  updatedAt: number;
}

export interface RoutingRule {
  role: ModelRole;
  primaryProfileId: string;
  fallbackProfileIds: string[];
  fallback: {
    onTimeout: boolean;
    onRateLimit: boolean;
    onUnavailable: boolean;
    onContextOverflow: boolean;
    onAuthError: boolean;
  };
  enabled: boolean;
}

export interface AIConfiguration {
  version: 1;
  profiles: ModelProfile[];
  routing: Partial<Record<ModelRole, RoutingRule>>;
}

const DEFAULT_FALLBACK = {
  onTimeout: true,
  onRateLimit: true,
  onUnavailable: true,
  onContextOverflow: true,
  onAuthError: false,
};

function read(): AIConfiguration {
  const raw = getProviderConfigStore().get(AI_CONFIGURATION_KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1, profiles: [], routing: {} };
  }
  const value = raw as Partial<AIConfiguration>;
  return {
    version: 1,
    profiles: Array.isArray(value.profiles) ? value.profiles : [],
    routing: value.routing && typeof value.routing === 'object' ? value.routing : {},
  };
}

function write(value: AIConfiguration): void {
  getProviderConfigStore().update({ [AI_CONFIGURATION_KEY]: value });
}

export function getAIConfiguration(): AIConfiguration {
  return read();
}

export function getModelProfiles(): ModelProfile[] {
  return [...read().profiles].sort((a, b) => a.name.localeCompare(b.name));
}

export function upsertModelProfile(
  input: Omit<Partial<ModelProfile>, 'createdAt' | 'updatedAt'> & {
    providerProfileId: string;
    name: string;
    id?: string;
  },
): ModelProfile {
  const now = Date.now();
  const config = read();
  const id = input.id || `${input.providerProfileId}-profile`;
  const existing = config.profiles.find((p) => p.id === id);
  const profile: ModelProfile = {
    id,
    name: input.name,
    providerProfileId: input.providerProfileId,
    enabled: input.enabled ?? existing?.enabled ?? true,
    temperature: input.temperature ?? existing?.temperature,
    thinkingEffort: input.thinkingEffort ?? existing?.thinkingEffort,
    maxTokens: input.maxTokens ?? existing?.maxTokens,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  config.profiles = existing
    ? config.profiles.map((p) => (p.id === id ? profile : p))
    : [...config.profiles, profile];
  write(config);
  return profile;
}

export function removeModelProfile(profileId: string): boolean {
  const config = read();
  const next = config.profiles.filter((p) => p.id !== profileId);
  if (next.length === config.profiles.length) return false;
  config.profiles = next;
  for (const role of Object.keys(config.routing) as ModelRole[]) {
    const rule = config.routing[role];
    if (!rule) continue;
    if (rule.primaryProfileId === profileId) delete config.routing[role];
    else rule.fallbackProfileIds = rule.fallbackProfileIds.filter((id) => id !== profileId);
  }
  write(config);
  return true;
}

export function setRoutingRule(
  role: ModelRole,
  primaryProfileId: string,
  fallbackProfileIds: string[] = [],
  fallback = DEFAULT_FALLBACK,
): RoutingRule {
  const config = read();
  const rule: RoutingRule = {
    role,
    primaryProfileId,
    fallbackProfileIds: [...new Set(fallbackProfileIds)].filter((id) => id !== primaryProfileId),
    fallback: { ...DEFAULT_FALLBACK, ...fallback },
    enabled: true,
  };
  config.routing[role] = rule;
  write(config);
  return rule;
}

export function getRoutingRule(role: ModelRole): RoutingRule | undefined {
  return read().routing[role];
}

export function resolveModelProfiles(role: ModelRole): ModelProfile[] {
  const config = read();
  const rule = config.routing[role];
  if (!rule) return [];
  const ids = [rule.primaryProfileId, ...rule.fallbackProfileIds];
  return ids
    .map((id) => config.profiles.find((p) => p.id === id && p.enabled))
    .filter((p): p is ModelProfile => Boolean(p));
}

export function resolveProviderProfile(profile: ModelProfile): ProviderProfile | undefined {
  return getProviderProfiles().find(
    (provider) => provider.id === profile.providerProfileId && provider.enabled,
  );
}

/** Seed AIConfiguration from enabled provider profiles when empty. */
export function migrateLegacyProviderProfiles(): AIConfiguration {
  const config = read();
  if (config.profiles.length > 0) return config;
  const legacy = getProviderProfiles().filter((p) => p.enabled);
  if (legacy.length === 0) return config;
  const now = Date.now();
  config.profiles = legacy.map((provider) => ({
    id: `${provider.id}-profile`,
    name: provider.name,
    providerProfileId: provider.id,
    enabled: true,
    createdAt: provider.createdAt || now,
    updatedAt: now,
  }));
  const first = config.profiles[0];
  if (first) {
    for (const role of ['chat', 'plan', 'coding', 'review', 'debug', 'research'] as ModelRole[]) {
      config.routing[role] = {
        role,
        primaryProfileId: first.id,
        fallbackProfileIds: [],
        fallback: { ...DEFAULT_FALLBACK },
        enabled: true,
      };
    }
  }
  write(config);
  return config;
}
