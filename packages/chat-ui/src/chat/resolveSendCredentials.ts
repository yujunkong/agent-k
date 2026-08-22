/**
 * Resolve baseUrl / apiKey / model for a chat.send (tab-scoped).
 * Prefer connection registry → profile → optional activate → config fallback.
 * Multi-tab safe: does not require activate unless every other path is empty.
 */
import { configManager } from '../core/ConfigManager';
import { resolveAndActivateModel, resolveConnectionForModel } from '../providers/ModelResolver';
import { findProviderProfileForModel } from '../providers/ProviderProfiles';

export interface SendCredentials {
  model: string;
  baseUrl: string;
  apiKey: string;
  type: string;
}

export interface SendCredentialHints {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  type?: string;
}

/**
 * Fill chat.send endpoint fields for the active tab model.
 * Returns empty baseUrl when nothing is configured (caller must paint onError).
 */
export function resolveSendCredentials(hints: SendCredentialHints = {}): SendCredentials {
  const requestedModel = String(hints.model || '').trim();
  const resolved = requestedModel
    ? resolveConnectionForModel(requestedModel)
    : undefined;
  const profile = findProviderProfileForModel(
    resolved?.originalModelId || requestedModel
  );

  let model = String(
    resolved?.originalModelId || profile?.model || requestedModel || ''
  ).trim();
  let type = String(
    resolved?.connection.type ||
      profile?.type ||
      hints.type ||
      configManager.get('agent-k.provider.type') ||
      'litellm'
  );
  let baseUrl = String(
    resolved?.connection.baseUrl ||
      profile?.baseUrl ||
      hints.baseUrl ||
      ''
  ).replace(/\/$/, '');
  let apiKey = String(
    resolved?.connection.apiKey ??
      profile?.apiKey ??
      hints.apiKey ??
      ''
  );

  // Last resort: activate profile so global keys + host fallback work.
  // Only when still missing endpoint — avoids stomping other tabs' React state.
  if ((!baseUrl || !model) && (requestedModel || model)) {
    const activated = resolveAndActivateModel(requestedModel || model);
    if (activated) {
      model = String(activated.model || model).trim();
      type = String(activated.type || type);
      baseUrl = String(activated.baseUrl || baseUrl).replace(/\/$/, '');
      apiKey = String(activated.apiKey ?? apiKey);
    }
  }

  if (!baseUrl) {
    baseUrl = String(configManager.get('agent-k.provider.baseUrl') || '').replace(
      /\/$/,
      ''
    );
  }
  if (!apiKey) {
    apiKey = String(configManager.get('agent-k.provider.apiKey') ?? '');
  }
  if (!model) {
    model = String(configManager.get('agent-k.provider.model') || '').trim();
  }

  return { model, baseUrl, apiKey, type };
}
