/**
 * Settings → AI Providers
 *
 * 표준 Provider 프리셋(OpenAI, Claude, OpenAI Compatible, OpenRouter, Ollama, LM Studio 등)으로
 * Name + Base URL + API Key 를 채운 뒤 Test / Save. Type 은 URL 자동 감지, 애매할 때만 수동 지정.
 * /models 실패 시 수동 모델 추가. Integrations(GitHub/PR) 블록은 이 탭에서 제거.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { fetchProviderModels } from '../../chat/providerModels';
import { detectProviderType, isLocalBaseUrl } from '../../providers/detectProviderType';
import {
  addManualModel,
  applyProbeToConnection,
  connectionModelIds,
  getProviderConnection,
  getProviderConnections,
  removeProviderConnection,
  reorderProviderConnections,
  upsertProviderConnection,
  type ProviderConnection
} from '../../providers/ProviderConnections';
import { PROVIDER_FIELDS, PROVIDER_LABELS, isProviderType } from '../../providers/providerFields';
import { PROVIDER_PRESETS } from '../../providers/providerPresets';
import { formatProviderStatusLine } from '../../providers/providerStatus';
import type { ProviderType } from '../../providers/types';
import { activateProviderProfile, getProviderProfiles } from '../../providers/ProviderProfiles';
import { configManager } from '../../core/ConfigManager';

function parseHeaders(raw: string): Record<string, string> | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function headersToText(headers?: Record<string, string>): string {
  if (!headers) return '';
  return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n');
}

type FormMode = 'closed' | 'create' | 'edit';

export function ModelsTab() {
  const [connections, setConnections] = useState<ProviderConnection[]>(() => getProviderConnections());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [apiKeyReveal, setApiKeyReveal] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [typeManual, setTypeManual] = useState(false);
  const [providerType, setProviderType] = useState<ProviderType>('litellm');
  const [headersText, setHeadersText] = useState('');

  // busy: idle | testing | saving — Save 가 연결 저장+프로브
  const [busy, setBusy] = useState<'idle' | 'testing' | 'saving'>('idle');
  const [preview, setPreview] = useState<{ ok: boolean; detail: string } | null>(null);
  const [manualModel, setManualModel] = useState('');
  const [showManualModels, setShowManualModels] = useState(false);
  const [formError, setFormError] = useState('');

  const detection = useMemo(() => detectProviderType(baseUrl), [baseUrl]);
  const effectiveType: ProviderType = typeManual && isProviderType(providerType) ? providerType : detection.type;
  const fields = PROVIDER_FIELDS[effectiveType] || PROVIDER_FIELDS.litellm;

  const reload = () => setConnections(getProviderConnections());
  useEffect(() => {
    // HOST config.hydrate → ConfigManager → same store Settings reads.
    const off = configManager.on('agent-k.provider.connections', () => reload());
    const off2 = configManager.on('agent-k.provider.availableModels', () => reload());
    reload();
    return () => { off(); off2(); };
  }, []);

  useEffect(() => {
    // 레거시 per-model 프로필 → 연결 단위 승격 후 목록 동기화
    reload();
  }, []);

  const resetForm = () => {
    setName(''); setBaseUrl(''); setApiKey(''); setHasStoredKey(false);
    setApiKeyReveal(false); setAdvancedOpen(false); setTypeManual(false);
    setProviderType('litellm'); setHeadersText('');
    setBusy('idle'); setPreview(null); setManualModel(''); setShowManualModels(false);
    setFormError(''); setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setFormMode('create');
    setExpandedId(null);
  };

  const openEdit = (conn: ProviderConnection) => {
    setFormMode('edit');
    setEditingId(conn.id);
    setExpandedId(conn.id);
    setName(conn.name);
    setBaseUrl(conn.baseUrl);
    setApiKey('');
    setHasStoredKey(Boolean(conn.apiKey));
    setApiKeyReveal(false);
    setTypeManual(conn.typeSource === 'manual');
    setProviderType(conn.type);
    setHeadersText(headersToText(conn.extraHeaders));
    setAdvancedOpen(conn.typeSource === 'manual' || Boolean(conn.extraHeaders));
    setPreview(null);
    setShowManualModels(connectionModelIds(conn).length === 0);
    setFormError('');
  };

  const applyPreset = (presetId: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setTypeManual(true);
    setProviderType(preset.type);
    setAdvancedOpen(false);
    setPreview(null);
    setFormError('');
  };

  const resolvedKey = (conn?: ProviderConnection | null) => {
    if (apiKey.trim()) return apiKey.trim();
    return conn?.apiKey || '';
  };

  const probeOpts = (conn?: ProviderConnection | null) => ({
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey: resolvedKey(conn),
    extraHeaders: parseHeaders(headersText)
  });

  const handleTest = async () => {
    if (!baseUrl.trim()) { setFormError('Base URL is required.'); return; }
    setBusy('testing'); setFormError(''); setPreview(null);
    const result = await fetchProviderModels(probeOpts());
    setPreview({ ok: result.ok, detail: result.detail });
    setShowManualModels(!result.ok || result.modelIds.length === 0);
    setBusy('idle');
  };

  /** 연결 저장 + /models 프로브 (이전 Connect 동작) */
  const handleSave = async () => {
    if (!baseUrl.trim()) { setFormError('Base URL is required.'); return; }
    let displayName = name.trim();
    if (!displayName) {
      try {
        const href = /^[a-z][a-z0-9+.-]*:\/\//i.test(baseUrl) ? baseUrl : `http://${baseUrl}`;
        displayName = isLocalBaseUrl(baseUrl) ? 'Local' : new URL(href).hostname;
      } catch {
        displayName = 'Provider';
      }
    }
    setBusy('saving'); setFormError('');
    const existing = editingId ? getProviderConnection(editingId) : undefined;
    const saved = upsertProviderConnection({
      id: editingId || undefined,
      name: displayName,
      type: effectiveType,
      typeSource: typeManual ? 'manual' : 'auto',
      baseUrl: baseUrl.replace(/\/$/, ''),
      apiKey: resolvedKey(existing),
      extraHeaders: parseHeaders(headersText),
      discoveredModels: existing?.discoveredModels,
      manualModels: existing?.manualModels,
      status: 'unknown'
    });
    const result = await fetchProviderModels(probeOpts(saved));
    const updated = applyProbeToConnection(saved.id, result);
    if (result.ok && result.modelIds[0]) {
      const profiles = getProviderProfiles().filter((p) => p.connectionId === saved.id);
      if (profiles[0]) activateProviderProfile(profiles[0].id);
    }
    setShowManualModels(!result.ok || result.modelIds.length === 0);
    setPreview({ ok: result.ok, detail: result.detail });
    setEditingId(saved.id);
    setFormMode('edit');
    setHasStoredKey(Boolean(updated?.apiKey || saved.apiKey));
    setApiKey('');
    reload();
    setBusy('idle');
    if (!result.ok) setFormError(result.detail);
  };

  const handleRetry = async (conn: ProviderConnection) => {
    const result = await fetchProviderModels({
      baseUrl: conn.baseUrl,
      apiKey: conn.apiKey,
      extraHeaders: conn.extraHeaders
    });
    applyProbeToConnection(conn.id, result);
    reload();
  };

  const handleAddManual = (connectionId: string, modelId: string) => {
    const id = modelId.trim();
    if (!id) return;
    addManualModel(connectionId, id);
    setManualModel('');
    reload();
  };

  const handleDelete = (id: string) => {
    removeProviderConnection(id);
    if (editingId === id) { resetForm(); setFormMode('closed'); }
    if (expandedId === id) setExpandedId(null);
    reload();
  };

  const onDrop = (targetId: string, sourceId: string) => {
    if (!sourceId || sourceId === targetId) return;
    const ids = connections.map((c) => c.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, sourceId);
    setConnections(reorderProviderConnections(ids));
  };

  return (
    <div className="settings-tab-content">
      <h3>AI Providers</h3>
      <p className="settings-hint">
        Add a standard provider (OpenAI, Claude, OpenAI Compatible, OpenRouter, Ollama, LM Studio, …), then Save. Agent K detects the type, loads models, and prefers a healthy endpoint when the same model exists in more than one place.
      </p>

      <div className="provider-list" role="list">
        {connections.length === 0 ? (
          <div className="settings-hint">No providers yet. Add one to start.</div>
        ) : connections.map((conn) => {
          const count = connectionModelIds(conn).length;
          const status = formatProviderStatusLine({
            status: conn.status,
            modelCount: count,
            isLocal: isLocalBaseUrl(conn.baseUrl),
            modelsFetchedAt: conn.modelsFetchedAt
          });
          const warn = conn.status === 'offline' || conn.status === 'auth_failed' || conn.status === 'rate_limited';
          const open = expandedId === conn.id && formMode !== 'create';
          return (
            <div
              key={conn.id}
              className={`provider-card${open ? ' is-open' : ''}${warn ? ' is-warn' : ''}`}
              role="listitem"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', conn.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(conn.id, e.dataTransfer.getData('text/plain'));
              }}
            >
              <button
                type="button"
                className="provider-card__row"
                onClick={() => {
                  setExpandedId(open ? null : conn.id);
                  if (!open) openEdit(conn);
                }}
              >
                <span className="provider-card__dot" aria-hidden>{warn ? '⚠' : '●'}</span>
                <span className="provider-card__body">
                  <span className="provider-card__name">{conn.name}</span>
                  <span className="provider-card__status">{status}</span>
                </span>
              </button>
              {open ? (
                <div className="provider-card__detail">
                  {conn.lastError ? <div className="settings-error">{conn.lastError}</div> : null}
                  <div className="settings-actions">
                    <button type="button" className="settings-btn secondary" onClick={() => void handleRetry(conn)}>
                      {warn ? 'Reconnect' : 'Refresh models'}
                    </button>
                    <button type="button" className="settings-btn secondary settings-btn--danger" onClick={() => handleDelete(conn.id)}>Delete</button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {formMode === 'closed' ? (
        <button type="button" className="settings-btn" onClick={openCreate}>＋ Add Provider</button>
      ) : (
        <div className="settings-section">
          <div className="settings-section__head">
            <p className="settings-section__title">{formMode === 'edit' ? 'Edit Provider' : 'Add Provider'}</p>
            <p className="settings-section__desc">Pick a preset or enter name, base URL, and API key, then Save.</p>
          </div>
          <div className="settings-section__body">
            <div className="preset-row" aria-label="Provider presets">
              {PROVIDER_PRESETS.map((p) => (
                <button key={p.id} type="button" className="settings-btn secondary settings-btn--tiny" onClick={() => applyPreset(p.id)}>{p.name}</button>
              ))}
            </div>
            <div className="settings-field">
              <label>Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="OpenAI" />
            </div>
            <div className="settings-field">
              <label>Base URL</label>
              <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={fields.defaultBaseUrl} />
              {baseUrl ? (
                <span className="settings-field__hint">
                  {typeManual ? `Type: ${PROVIDER_LABELS[effectiveType]} (manual)` : `Detected: ${PROVIDER_LABELS[detection.type]}${detection.ambiguous ? ' — override in Advanced if this is a gateway/proxy' : ''}`}
                </span>
              ) : null}
            </div>
            {fields.needsApiKey !== false ? (
              <div className="settings-field">
                <label>
                  API Key{fields.apiKeyOptional ? ' (optional)' : ''}
                  {hasStoredKey ? <span className="settings-stored-badge"> stored</span> : null}
                </label>
                <div className="settings-secret-row">
                  <input
                    type={apiKeyReveal ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasStoredKey ? '•••••••• stored — enter to replace' : 'sk-…'}
                    autoComplete="off"
                  />
                  <button type="button" className="settings-btn secondary settings-btn--tiny" onClick={() => setApiKeyReveal((v) => !v)}>{apiKeyReveal ? 'Hide' : 'Show'}</button>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              className="settings-btn secondary settings-btn--tiny"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen ? '▾ Advanced settings' : '▸ Advanced settings'}
            </button>
            {advancedOpen ? (
              <div className="settings-section__body">
                <div className="settings-field">
                  <label>Provider Type</label>
                  <select
                    value={effectiveType}
                    onChange={(e) => {
                      setTypeManual(true);
                      setProviderType(e.target.value as ProviderType);
                    }}
                  >
                    {(Object.keys(PROVIDER_LABELS) as ProviderType[]).map((t) => (
                      <option key={t} value={t}>{PROVIDER_LABELS[t]}</option>
                    ))}
                  </select>
                  <span className="settings-field__hint">Leave on auto-detect unless the URL is a gateway, Azure, or a custom proxy.</span>
                </div>
                <div className="settings-field">
                  <label>Extra headers (optional, one per line: Name: value)</label>
                  <textarea value={headersText} onChange={(e) => setHeadersText(e.target.value)} rows={3} placeholder="x-api-key: …" />
                </div>
              </div>
            ) : null}

            <div className="settings-actions">
              <button type="button" className="settings-btn secondary" onClick={() => void handleTest()} disabled={busy !== 'idle'}>
                {busy === 'testing' ? 'Testing…' : 'Test'}
              </button>
              <button type="button" className="settings-btn" onClick={() => void handleSave()} disabled={busy !== 'idle'}>
                {busy === 'saving' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="settings-btn secondary" onClick={() => { resetForm(); setFormMode('closed'); }}>Cancel</button>
            </div>
            {preview ? (
              <div className={preview.ok ? 'settings-success' : 'settings-error'}>{preview.detail}</div>
            ) : null}
            {formError ? <div className="settings-error">{formError}</div> : null}

            {showManualModels && editingId ? (
              <div className="settings-field">
                <label>This endpoint did not return /models. Add a model name manually.</label>
                <div className="settings-secret-row">
                  <input
                    type="text"
                    value={manualModel}
                    onChange={(e) => setManualModel(e.target.value)}
                    placeholder="model id from your server"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleAddManual(editingId, manualModel); }
                    }}
                  />
                  <button type="button" className="settings-btn secondary settings-btn--tiny" onClick={() => handleAddManual(editingId, manualModel)}>Add</button>
                </div>
              </div>
            ) : null}

            {(() => {
              const editing = editingId ? getProviderConnection(editingId) : undefined;
              const count = editing ? connectionModelIds(editing).length : 0;
              return count > 0 ? (
                <p className="settings-hint">{count} models available in Composer.</p>
              ) : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
