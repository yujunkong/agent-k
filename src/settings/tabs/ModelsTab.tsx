import React, { useMemo, useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  PROVIDER_FIELDS,
  PROVIDER_LABELS,
  isProviderType,
  type ProviderFieldMeta
} from '../../providers/providerFields';
import type { ProviderType } from '../../providers/types';
import { refreshComposerModels } from '../../chat/providerModels';

/** Persist settings to extension host (VS Code configuration) */
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

function formatHttp401Hint(status?: number, detail?: string): string {
  if (status === 401 || detail?.includes('401')) {
    return (
      detail ||
      'HTTP 401 — API key required or invalid for this provider.'
    );
  }
  return detail || 'Connection failed';
}

function metaFor(type: string): ProviderFieldMeta {
  return isProviderType(type) ? PROVIDER_FIELDS[type] : PROVIDER_FIELDS.litellm;
}

function readApiKeyMap(): Record<string, string> {
  const raw = configManager.get('agent-k.provider.apiKeys');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out;
}

/** Prefer per-type key; fall back to active apiKey when types match. */
function resolveApiKeyForType(type: string, map: Record<string, string>): string {
  if (map[type]) return map[type];
  const activeType = String(configManager.get('agent-k.provider.type') || '');
  const activeKey = String(configManager.get('agent-k.provider.apiKey') || '');
  if (activeType === type && activeKey) return activeKey;
  return '';
}

export function ModelsTab() {
  const initialType = String(configManager.get('agent-k.provider.type') || 'litellm');
  const [providerType, setProviderType] = useState<string>(initialType);
  const initialMeta = metaFor(initialType);
  const [baseUrl, setBaseUrl] = useState<string>(
    configManager.get('agent-k.provider.baseUrl') || initialMeta.defaultBaseUrl
  );
  const [apiKeyMap, setApiKeyMap] = useState<Record<string, string>>(() => readApiKeyMap());
  const [apiKey, setApiKey] = useState<string>(() =>
    resolveApiKeyForType(initialType, readApiKeyMap())
  );
  const [apiKeyReveal, setApiKeyReveal] = useState(false);
  const [githubToken, setGithubToken] = useState<string>(
    configManager.get('agent-k.github.token') || ''
  );
  const [githubReveal, setGithubReveal] = useState(false);
  const [githubStored, setGithubStored] = useState(
    () => !!configManager.get('agent-k.github.token')
  );
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testDetail, setTestDetail] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const fields = useMemo(() => metaFor(providerType), [providerType]);
  const apiKeyStored =
    !!apiKeyMap[providerType] ||
    !!apiKey ||
    (String(configManager.get('agent-k.provider.type') || '') === providerType &&
      !!configManager.get('agent-k.provider.apiKey'));

  const handleProviderTypeChange = (next: string) => {
    // Keep Zen / Go (and other) keys separate when switching
    setApiKeyMap((prev) => {
      const nextMap = { ...prev };
      if (apiKey.trim()) nextMap[providerType] = apiKey.trim();
      setApiKey(resolveApiKeyForType(next, nextMap));
      return nextMap;
    });
    setProviderType(next);
    const meta = metaFor(next);
    setBaseUrl(meta.defaultBaseUrl);
    if (!meta.needsApiKey) {
      setApiKey('');
    }
    setApiKeyReveal(false);
    setTestStatus('idle');
    setTestDetail('');
  };

  const handleSave = () => {
    const meta = metaFor(providerType);
    const activeModel = String(
      configManager.get('agent-k.provider.model') || meta.defaultModel || ''
    ).trim();
    const nextMap = { ...apiKeyMap };
    if (meta.needsApiKey) {
      if (apiKey.trim()) nextMap[providerType] = apiKey.trim();
    } else {
      delete nextMap[providerType];
    }
    const activeKey = meta.needsApiKey
      ? apiKey.trim() || nextMap[providerType] || ''
      : '';
    const values: Record<string, unknown> = {
      'agent-k.provider.type': providerType,
      'agent-k.provider.model': activeModel || meta.defaultModel,
      'agent-k.provider.apiKeys': nextMap,
      'agent-k.provider.apiKey': activeKey
    };
    if (meta.needsBaseUrl) {
      values['agent-k.provider.baseUrl'] = baseUrl.replace(/\/$/, '');
    } else {
      values['agent-k.provider.baseUrl'] = meta.defaultBaseUrl.replace(/\/$/, '');
    }
    if (githubToken) {
      values['agent-k.github.token'] = githubToken;
    } else if (!githubStored) {
      values['agent-k.github.token'] = '';
    }
    setApiKeyMap(nextMap);
    configManager.update(values);
    const hostPayload: Record<string, unknown> = {
      'agent-k.provider.type': values['agent-k.provider.type'],
      'agent-k.provider.model': values['agent-k.provider.model'],
      'agent-k.provider.baseUrl': values['agent-k.provider.baseUrl'],
      'agent-k.provider.apiKey': activeKey,
      'agent-k.provider.apiKeys': nextMap
    };
    if ('agent-k.github.token' in values) {
      hostPayload['agent-k.github.token'] = values['agent-k.github.token'];
      setGithubStored(!!values['agent-k.github.token']);
    }
    persistToHost(hostPayload);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestDetail('');
    const meta = metaFor(providerType);
    const url = meta.needsBaseUrl ? baseUrl : meta.defaultBaseUrl;
    const key = meta.needsApiKey ? apiKey : '';
    const probeModel =
      String(configManager.get('agent-k.provider.model') || '') || meta.defaultModel;

    const result = await refreshComposerModels({
      baseUrl: url,
      apiKey: key,
      model: probeModel
    });

    if (!result.ok) {
      setTestStatus('error');
      setTestDetail(formatHttp401Hint(result.status, result.detail));
      return;
    }

    setTestStatus('success');
    setTestDetail(
      result.modelIds.length > 0
        ? `OK — ${result.modelIds.length} models available in Composer`
        : result.detail
    );
  };

  return (
    <div className="settings-tab-content">
      <h3>Provider &amp; credentials</h3>
      <p className="settings-hint">
        {fields.hint} Connect once — models from the server appear in the chat Composer dropdown.
      </p>

      <div className="settings-field">
        <label>Provider Type</label>
        <select value={providerType} onChange={(e) => handleProviderTypeChange(e.target.value)}>
          {(Object.keys(PROVIDER_FIELDS) as ProviderType[]).map((t) => (
            <option key={t} value={t}>
              {PROVIDER_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {fields.needsBaseUrl ? (
        <div className="settings-field">
          <label>Base URL (no trailing /v1)</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={fields.defaultBaseUrl}
          />
        </div>
      ) : null}

      {fields.needsApiKey ? (
        <div className="settings-field">
          <label>
            {providerType === 'opencode-zen'
              ? 'Zen API Key'
              : providerType === 'opencode-go'
                ? 'Go API Key'
                : `API Key${fields.apiKeyOptional ? ' (optional)' : ''}`}
            {apiKeyStored && !apiKeyReveal ? (
              <span className="settings-stored-badge"> stored</span>
            ) : null}
          </label>
          <div className="settings-secret-row">
            <input
              type={apiKeyReveal ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                apiKeyStored && !apiKey
                  ? '•••••••• (leave blank to keep, or type to replace)'
                  : providerType === 'opencode-zen'
                    ? 'Zen sk-…'
                    : providerType === 'opencode-go'
                      ? 'Go sk-…'
                      : fields.apiKeyOptional
                        ? 'sk-… or empty'
                        : 'sk-…'
              }
              autoComplete="off"
            />
            <button
              type="button"
              className="settings-btn secondary settings-btn--tiny"
              onClick={() => setApiKeyReveal((v) => !v)}
              title={apiKeyReveal ? 'Hide' : 'Show'}
            >
              {apiKeyReveal ? 'Hide' : 'Show'}
            </button>
            {apiKey || apiKeyStored ? (
              <button
                type="button"
                className="settings-btn secondary settings-btn--tiny settings-btn--danger"
                onClick={() => {
                  setApiKey('');
                  const nextMap = { ...apiKeyMap };
                  delete nextMap[providerType];
                  setApiKeyMap(nextMap);
                  configManager.update({
                    'agent-k.provider.apiKey': '',
                    'agent-k.provider.apiKeys': nextMap
                  });
                  persistToHost({
                    'agent-k.provider.apiKey': '',
                    'agent-k.provider.apiKeys': nextMap
                  });
                }}
                title="Clear API key"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <h3 style={{ marginTop: 28 }}>Integrations</h3>
      <p className="settings-hint">Optional credentials for SCM / PR features.</p>
      <div className="settings-field">
        <label>
          GitHub Token
          {(githubStored || githubToken) && !githubReveal ? (
            <span className="settings-stored-badge"> stored</span>
          ) : null}
        </label>
        <div className="settings-secret-row">
          <input
            type={githubReveal ? 'text' : 'password'}
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder={
              githubStored && !githubToken
                ? '•••••••• (leave blank to keep, or type to replace)'
                : 'ghp_…'
            }
            autoComplete="off"
          />
          <button
            type="button"
            className="settings-btn secondary settings-btn--tiny"
            onClick={() => setGithubReveal((v) => !v)}
            title={githubReveal ? 'Hide' : 'Show'}
          >
            {githubReveal ? 'Hide' : 'Show'}
          </button>
          {githubToken || githubStored ? (
            <button
              type="button"
              className="settings-btn secondary settings-btn--tiny settings-btn--danger"
              onClick={() => {
                setGithubToken('');
                setGithubStored(false);
                configManager.update({ 'agent-k.github.token': '' });
                persistToHost({ 'agent-k.github.token': '' });
              }}
              title="Clear GitHub token"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="settings-actions">
        <button type="button" onClick={handleTest} className="settings-btn secondary">
          {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
        <button type="button" onClick={handleSave} className="settings-btn">
          Save
        </button>
        {savedFlash ? (
          <span className="settings-hint" style={{ color: '#22c55e', margin: 0 }}>
            Saved
          </span>
        ) : null}
      </div>

      {testStatus === 'success' && (
        <div className="settings-hint" style={{ color: '#22c55e' }}>
          {testDetail || 'Connection successful'}
        </div>
      )}
      {testStatus === 'error' && (
        <div className="settings-hint" style={{ color: '#f87171' }}>
          {testDetail || 'Connection failed'}
        </div>
      )}
    </div>
  );
}
