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
  const [model, setModel] = useState<string>(
    configManager.get('agent-k.provider.model') || initialMeta.defaultModel
  );
  const [apiKey, setApiKey] = useState<string>(configManager.get('agent-k.provider.apiKey') || '');
  const [registered, setRegistered] = useState<string[]>(() => getRegisteredModels());
  const [serverModels, setServerModels] = useState<string[]>([]);
  const [addPick, setAddPick] = useState('');
  const [manualId, setManualId] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testDetail, setTestDetail] = useState('');

  const fields = useMemo(() => metaFor(providerType), [providerType]);

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
    if (!configManager.get('agent-k.provider.model')) {
      setModel(meta.defaultModel);
    }
    if (!meta.needsApiKey) {
      setApiKey('');
    }
    setServerModels([]);
    setAddPick('');
    setTestStatus('idle');
    setTestDetail('');
  };

  const handleSave = () => {
    const meta = metaFor(providerType);
    const models = registered.includes(model)
      ? registered
      : [...registered, model].filter(Boolean);
    setRegisteredModels(models);
    setRegistered(models);
    const values: Record<string, unknown> = {
      'agent-k.provider.type': providerType,
      'agent-k.provider.model': model,
      'agent-k.provider.models': models
    };
    if (meta.needsBaseUrl) {
      values['agent-k.provider.baseUrl'] = baseUrl.replace(/\/$/, '');
    } else {
      values['agent-k.provider.baseUrl'] = meta.defaultBaseUrl.replace(/\/$/, '');
    }
    if (meta.needsApiKey) {
      values['agent-k.provider.apiKey'] = apiKey;
    } else {
      values['agent-k.provider.apiKey'] = '';
    }
    configManager.update(values);
    persistToHost({
      'agent-k.provider.type': values['agent-k.provider.type'],
      'agent-k.provider.model': values['agent-k.provider.model'],
      'agent-k.provider.baseUrl': values['agent-k.provider.baseUrl'],
      'agent-k.provider.apiKey': values['agent-k.provider.apiKey']
    });
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestDetail('');
    const meta = metaFor(providerType);
    const url = meta.needsBaseUrl ? baseUrl : meta.defaultBaseUrl;
    const key = meta.needsApiKey ? apiKey : '';

    const result = await fetchProviderModels({
      baseUrl: url,
      apiKey: key,
      model
    });

    if (!result.ok) {
      setTestStatus('error');
      setTestDetail(formatHttp401Hint(result.status, result.detail));
      return;
    }

    // Server catalog stays local for "Add" — not dumped into Composer
    setServerModels(result.modelIds);
    setTestStatus('success');
    setTestDetail(result.detail);
  };

  const handleAddFromServer = () => {
    if (!addPick) return;
    const next = addRegisteredModel(addPick);
    setRegistered(next);
    setModel(addPick);
    setAddPick('');
  };

  const handleAddManual = () => {
    const id = manualId.trim();
    if (!id) return;
    const next = addRegisteredModel(id);
    setRegistered(next);
    setModel(id);
    setManualId('');
  };

  const handleRemove = (id: string) => {
    const next = removeRegisteredModel(id);
    setRegistered(next);
    if (model === id && next[0]) {
      setModel(next[0]);
    }
  };

  const serverChoices = useMemo(
    () => serverModels.filter((id) => !registered.includes(id)),
    [serverModels, registered]
  );

  return (
    <div className="settings-tab-content">
      <h3>Provider Configuration</h3>
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
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={fields.apiKeyOptional ? 'sk-… or empty' : 'sk-…'}
            autoComplete="off"
          />
        </div>
      ) : null}

      <div className="settings-field">
        <label>Active model</label>
        <select
          value={registered.includes(model) ? model : registered[0] || model}
          onChange={(e) => setModel(e.target.value)}
          disabled={registered.length === 0}
        >
          {(registered.length ? registered : model ? [model] : []).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-field">
        <label>Registered models (Composer list)</label>
        <p className="settings-hint" style={{ marginTop: 0 }}>
          Only these appear in the chat model dropdown — not the full server catalog.
        </p>
        {registered.length === 0 ? (
          <p className="settings-hint">None yet — add a model below.</p>
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

      <div className="settings-actions">
        <button type="button" onClick={handleTest} className="settings-btn secondary">
          {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
        <button type="button" onClick={handleSave} className="settings-btn">
          Save
        </button>
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
