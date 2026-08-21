/**
 * CFG-008 — Provider configuration keys (type, URL, model, keys, connections, order).
 * Host injects ProviderConfigStore that maps these to vscode settings / secrets.
 */
import { getProviderConfigStore } from './configStore';
import {
  ACTIVE_API_KEY_KEY,
  ACTIVE_BASE_URL_KEY,
  ACTIVE_MODEL_KEY,
  ACTIVE_PROVIDER_TYPE_KEY,
  AVAILABLE_MODELS_KEY,
} from './availableModels';
import { AI_CONFIGURATION_KEY } from './ModelRouting';
import {
  PREFER_USER_ORDER_KEY,
  PROVIDER_CONNECTIONS_KEY,
  getPreferUserOrder,
  getProviderConnections,
} from './ProviderConnections';
import {
  ACTIVE_PROFILE_KEY,
  PROVIDER_PROFILES_KEY,
  getActiveProviderProfileId,
  getProviderProfiles,
} from './ProviderProfiles';
import type { ProviderType } from './types';

/** Canonical CFG-008 key catalog for documentation + host wiring. */
export const PROVIDER_CONFIG_KEYS = {
  type: ACTIVE_PROVIDER_TYPE_KEY,
  baseUrl: ACTIVE_BASE_URL_KEY,
  model: ACTIVE_MODEL_KEY,
  apiKey: ACTIVE_API_KEY_KEY,
  apiKeys: 'agent-k.provider.apiKeys',
  connections: PROVIDER_CONNECTIONS_KEY,
  preferUserOrder: PREFER_USER_ORDER_KEY,
  profiles: PROVIDER_PROFILES_KEY,
  activeProfileId: ACTIVE_PROFILE_KEY,
  availableModels: AVAILABLE_MODELS_KEY,
  aiConfiguration: AI_CONFIGURATION_KEY,
} as const;

export interface ProviderConfigurationSnapshot {
  type?: ProviderType | string;
  baseUrl: string;
  model: string;
  /** Opaque; host may redact when serializing */
  apiKey?: string;
  connectionCount: number;
  preferUserOrder: boolean;
  activeProfileId: string | null;
  profileCount: number;
  availableModelCount: number;
}

/** Read active provider fields from the injected store (CFG-008). */
export function getProviderConfiguration(): ProviderConfigurationSnapshot {
  const store = getProviderConfigStore();
  const available = store.get(AVAILABLE_MODELS_KEY);
  return {
    type: String(store.get(ACTIVE_PROVIDER_TYPE_KEY) || '') || undefined,
    baseUrl: String(store.get(ACTIVE_BASE_URL_KEY) || '').replace(/\/$/, ''),
    model: String(store.get(ACTIVE_MODEL_KEY) || '').trim(),
    apiKey: String(store.get(ACTIVE_API_KEY_KEY) || '') || undefined,
    connectionCount: getProviderConnections().length,
    preferUserOrder: getPreferUserOrder(),
    activeProfileId: getActiveProviderProfileId(),
    profileCount: getProviderProfiles().length,
    availableModelCount: Array.isArray(available) ? available.length : 0,
  };
}

/** Patch active provider fields (does not touch secrets vault — PROVIDER-017 skipped). */
export function updateProviderConfiguration(patch: {
  type?: ProviderType | string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  preferUserOrder?: boolean;
}): void {
  const values: Record<string, unknown> = {};
  if (patch.type !== undefined) values[ACTIVE_PROVIDER_TYPE_KEY] = patch.type;
  if (patch.baseUrl !== undefined) values[ACTIVE_BASE_URL_KEY] = patch.baseUrl.replace(/\/$/, '');
  if (patch.model !== undefined) values[ACTIVE_MODEL_KEY] = patch.model;
  if (patch.apiKey !== undefined) values[ACTIVE_API_KEY_KEY] = patch.apiKey;
  if (patch.preferUserOrder !== undefined) values[PREFER_USER_ORDER_KEY] = patch.preferUserOrder;
  if (Object.keys(values).length > 0) getProviderConfigStore().update(values);
}
