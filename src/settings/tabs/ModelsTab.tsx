import React, { useEffect, useMemo, useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import {
  PROVIDER_FIELDS,
  isProviderType,
  type ProviderFieldMeta
} from '../../providers/providerFields';
import type { ProviderType } from '../../providers/types';
import {
  addRegisteredModel,
  fetchProviderModels,
  getRegisteredModels,
  removeRegisteredModel,
  setRegisteredModels
} from '../../chat/providerModels';

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

function shortId(id: string): string {
  const base = id.split('/').pop() || id;
  return base.length > 40 ? `${base.slice(0, 38)}…` : base;
}

export function ModelsTab() {
  const initialType = String(configManager.get('agent-k.provider.type') || 'litellm');
  const [providerType, setProviderType] = useState<string>(initialType);
  const initialMeta = metaFor(initialType);
  const [baseUrl, setBaseUrl] = useState<string>(
    configManager.get('agent-k.provider.baseUrl') || initialMeta.defaultBaseUrl
  );
  const [apiKey, setApiKey] = useState<string>(
    configManager.get('agent-k.provider.apiKey') || ''
  );
  const [apiKeyReveal, setApiKeyReveal] = useState(false);
  const [githubToken, setGithubToken] = useState<string>(
    configManager.get('agent-k.github.token') || ''
  );
  const [githubReveal, setGithubReveal] = useState(false);
  const [githubStored, setGithubStored] = useState(
    () => !!configManager.get('agent-k.github.token')
  );
  const [registered, setRegistered] = useState<string[]>(() => getRegisteredModels());
  const [serverModels, setServerModels] = useState<string[]>([]);
  const [addPick, setAddPick] = useState('');
  const [manualId, setManualId] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testDetail, setTestDetail] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const fields = useMemo(() => metaFor(providerType), [providerType]);
  const apiKeyStored = !!configManager.get('agent-k.provider.apiKey') || !!apiKey;

  useEffect(() => {
    const unsub = configManager.on('agent-k.provider.models', () => {
      setRegistered(getRegisteredModels());
    });
    return unsub;
  }, []);

  const handleProviderTypeChange = (next: string) => {
    setProviderType(next);
    const meta = metaFor(next);
    setBaseUrl(meta.defaultBaseUrl);
    if (!meta.needsApiKey) {
      setApiKey('');
    }
    setServerModels([]);
    setAddPick('');
    setTestStatus('idle');
    setTestDetail('');
  };

  const resolveActiveModel = (models: string[]): string => {
    const current = String(configManager.get('agent-k.provider.model') || '').trim();
    if (current && models.includes(current)) return current;
    return models[0] || current || fields.defaultModel;
  };

  const handleSave = () => {
    const meta = metaFor(providerType);
    const models = registered.filter(Boolean);
    setRegisteredModels(models);
    setRegistered(models);
    const activeModel = resolveActiveModel(models);
    const values: Record<string, unknown> = {
      'agent-k.provider.type': providerType,
      'agent-k.provider.model': activeModel,
      'agent-k.provider.models': models
    };
    if (meta.needsBaseUrl) {
      values['agent-k.provider.baseUrl'] = baseUrl.replace(/\/$/, '');
    } else {
      values['agent-k.provider.baseUrl'] = meta.defaultBaseUrl.replace(/\/$/, '');
    }
    if (meta.needsApiKey) {
      if (apiKey) {
        values['agent-k.provider.apiKey'] = apiKey;
      }
      // blank + previously stored → keep existing (Clear already persisted '')
    } else {
      values['agent-k.provider.apiKey'] = '';
    }
    if (githubToken) {
      values['agent-k.github.token'] = githubToken;
    } else if (!githubStored) {
      values['agent-k.github.token'] = '';
    }
    configManager.update(values);
    const hostPayload: Record<string, unknown> = {
      'agent-k.provider.type': values['agent-k.provider.type'],
      'agent-k.provider.model': values['agent-k.provider.model'],
      'agent-k.provider.baseUrl': values['agent-k.provider.baseUrl']
    };
    if ('agent-k.provider.apiKey' in values) {
      hostPayload['agent-k.provider.apiKey'] = values['agent-k.provider.apiKey'];
    }
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
      registered[0] ||
      String(configManager.get('agent-k.provider.model') || '') ||
      meta.defaultModel;

    const result = await fetchProviderModels({
      baseUrl: url,
      apiKey: key,
      model: probeModel
    });

    if (!result.ok) {
      setTestStatus('error');
      setTestDetail(formatHttp401Hint(result.status, result.detail));
      return;
    }

    setServerModels(result.modelIds);
    setTestStatus('success');
    setTestDetail(result.detail);
  };

  const handleAddFromServer = () => {
    if (!addPick) return;
    const next = addRegisteredModel(addPick);
    setRegistered(next);
    setAddPick('');
  };

  const handleAddManual = () => {
    const id = manualId.trim();
    if (!id) return;
    const next = addRegisteredModel(id);
    setRegistered(next);
    setManualId('');
  };

  const handleRemove = (id: string) => {
    const next = removeRegisteredModel(id);
    setRegistered(next);
  };

  const serverChoices = useMemo(
    () => serverModels.filter((id) => !registered.includes(id)),
    [serverModels, registered]
  );

  return (
    <div className="settings-tab-content">
      <h3>Provider &amp; credentials</h3>
      <p className="settings-hint">{fields.hint}</p>

      <div className="settings-field">
        <label>Provider Type</label>
        <select value={providerType} onChange={(e) => handleProviderTypeChange(e.target.value)}>
          {(Object.keys(PROVIDER_FIELDS) as ProviderType[]).map((t) => (
            <option key={t} value={t}>
              {t === 'litellm'
                ? 'LiteLLM / OpenAI-compatible'
                : t === 'openai'
                  ? 'OpenAI'
                  : t === 'anthropic'
                    ? 'Anthropic'
                    : t === 'ollama'
                      ? 'Ollama'
                      : 'LM Studio'}
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
            API Key{fields.apiKeyOptional ? ' (optional)' : ''}
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
                  configManager.update({ 'agent-k.provider.apiKey': '' });
                  persistToHost({ 'agent-k.provider.apiKey': '' });
                }}
                title="Clear API key"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="settings-field">
        <label>Registered models (Composer dropdown)</label>
        <p className="settings-hint" style={{ marginTop: 0 }}>
          Active model is chosen in the chat composer. Only these IDs appear there — not the full
          server catalog.
        </p>
        {registered.length === 0 ? (
          <p className="settings-hint">None yet — add a model below or Test Connection.</p>
        ) : (
          <ul className="settings-model-list">
            {registered.map((id) => (
              <li key={id}>
                <span title={id}>{shortId(id)}</span>
                <button
                  type="button"
                  className="settings-btn secondary settings-btn--tiny"
                  onClick={() => handleRemove(id)}
                  disabled={registered.length <= 1}
                  title="Remove from list"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="settings-inline-add">
          <input
            type="text"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="model id…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddManual();
              }
            }}
          />
          <button type="button" className="settings-btn secondary" onClick={handleAddManual}>
            Add
          </button>
        </div>
      </div>

      {serverChoices.length > 0 ? (
        <div className="settings-field">
          <label>Add from server ({serverChoices.length} available)</label>
          <div className="settings-inline-add">
            <select value={addPick} onChange={(e) => setAddPick(e.target.value)}>
              <option value="">Select a model…</option>
              {serverChoices.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="settings-btn secondary"
              onClick={handleAddFromServer}
              disabled={!addPick}
            >
              Add
            </button>
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
