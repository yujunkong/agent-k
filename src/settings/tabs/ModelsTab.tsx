import React, { useMemo, useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import { PROVIDER_FIELDS, PROVIDER_LABELS, isProviderType, type ProviderFieldMeta } from '../../providers/providerFields';
import { activateProviderProfile, getActiveProviderProfileId, getProviderProfiles, makeProviderProfileId, removeProviderProfile, upsertProviderProfile, type ProviderProfile } from '../../providers/ProviderProfiles';
import type { ProviderType } from '../../providers/types';
import { refreshComposerModels } from '../../chat/providerModels';

function persistToHost(values: Record<string, unknown>): void {
  try {
    const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    if (api?.postMessage) { api.postMessage({ type: 'config.update', values }); return; }
  } catch {}
  try { window.parent.postMessage({ type: 'config.update', values }, '*'); } catch {}
}
function metaFor(type: string): ProviderFieldMeta { return isProviderType(type) ? PROVIDER_FIELDS[type] : PROVIDER_FIELDS.litellm; }
function readApiKeyMap(): Record<string, string> {
  const raw = configManager.get('agent-k.provider.apiKeys');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === 'string' && !!v.trim())) as Record<string, string>;
}
function shortModel(model: string): string { const s = model.split('/').pop() || model; return s.length > 38 ? `${s.slice(0, 35)}…` : s; }

export function ModelsTab() {
  const initialType = String(configManager.get('agent-k.provider.type') || 'litellm');
  const initialModel = String(configManager.get('agent-k.provider.model') || '');
  const [profiles, setProfiles] = useState<ProviderProfile[]>(() => getProviderProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(() => getActiveProviderProfileId());
  const [providerType, setProviderType] = useState<string>(initialType);
  const [baseUrl, setBaseUrl] = useState<string>(String(configManager.get('agent-k.provider.baseUrl') || metaFor(initialType).defaultBaseUrl));
  const [model, setModel] = useState<string>(initialModel);
  const [apiKey, setApiKey] = useState<string>(() => String(configManager.get('agent-k.provider.apiKey') || ''));
  const [apiKeyReveal, setApiKeyReveal] = useState(false);
  const [githubToken, setGithubToken] = useState<string>(() => String(configManager.get('agent-k.github.token') || ''));
  const [githubReveal, setGithubReveal] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testDetail, setTestDetail] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const fields = useMemo(() => metaFor(providerType), [providerType]);

  const selectProfile = (id: string) => {
    const profile = profiles.find((p) => p.id === id); if (!profile) return;
    setSelectedProfileId(id); setProviderType(profile.type); setBaseUrl(profile.baseUrl); setModel(profile.model); setApiKey(profile.apiKey || '');
    activateProviderProfile(id); setTestStatus('idle'); setTestDetail('');
  };
  const newProfile = () => {
    const type = 'litellm'; const meta = metaFor(type);
    setSelectedProfileId(null); setProviderType(type); setBaseUrl(meta.defaultBaseUrl); setModel(meta.defaultModel || ''); setApiKey(''); setTestStatus('idle'); setTestDetail('');
  };
  const saveProfile = () => {
    if (!model.trim()) { setTestStatus('error'); setTestDetail('Model is required.'); return; }
    const nextApiKeys = readApiKeyMap(); if (apiKey.trim()) nextApiKeys[providerType] = apiKey.trim();
    const profile = upsertProviderProfile({
      id: selectedProfileId || makeProviderProfileId(providerType as ProviderType, model.trim()),
      name: `${PROVIDER_LABELS[providerType as ProviderType] || providerType} / ${shortModel(model.trim())}`,
      type: providerType as ProviderType,
      baseUrl: (fields.needsBaseUrl ? baseUrl : fields.defaultBaseUrl).replace(/\/$/, ''),
      apiKey: apiKey.trim(), model: model.trim(), enabled: true
    });
    activateProviderProfile(profile.id); setSelectedProfileId(profile.id); const next = getProviderProfiles(); setProfiles(next);
    const catalog = next.map((p) => p.model);
    configManager.update({ 'agent-k.provider.apiKeys': nextApiKeys, 'agent-k.provider.availableModels': catalog, 'agent-k.provider.models': catalog });
    persistToHost({ 'agent-k.provider.apiKeys': nextApiKeys, 'agent-k.provider.availableModels': catalog, 'agent-k.provider.models': catalog });
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800);
  };
  const deleteProfile = () => {
    if (!selectedProfileId) return;
    removeProviderProfile(selectedProfileId); const next = getProviderProfiles(); setProfiles(next);
    if (next[0]) selectProfile(next[0].id); else newProfile();
  };
  const handleProviderTypeChange = (next: string) => {
    setProviderType(next); const meta = metaFor(next); setBaseUrl(meta.defaultBaseUrl); if (!meta.needsApiKey) setApiKey(''); setTestStatus('idle'); setTestDetail('');
  };
  const handleTest = async () => {
    setTestStatus('testing'); setTestDetail('');
    const meta = metaFor(providerType); const url = meta.needsBaseUrl ? baseUrl : meta.defaultBaseUrl;
    const result = await refreshComposerModels({ baseUrl: url, apiKey: meta.needsApiKey ? apiKey : '', model, providerType, replace: false });
    if (!result.ok) { setTestStatus('error'); setTestDetail(result.detail || 'Connection failed'); return; }
    const modelIds = result.modelIds.length ? result.modelIds : [model].filter(Boolean);
    let selected = selectedProfileId;
    for (const id of modelIds) {
      const existing = getProviderProfiles().find((p) => p.type === providerType && p.baseUrl === url && p.model === id);
      const profile = upsertProviderProfile({ id: existing?.id, name: `${PROVIDER_LABELS[providerType as ProviderType] || providerType} / ${shortModel(id)}`, type: providerType as ProviderType, baseUrl: url, apiKey, model: id, enabled: true });
      if (id === model || !selected) selected = profile.id;
    }
    const next = getProviderProfiles(); setProfiles(next);
    if (selected) { setSelectedProfileId(selected); const active = next.find((p) => p.id === selected); if (active) { setModel(active.model); activateProviderProfile(active.id); } }
    setTestStatus('success'); setTestDetail(`Connected — ${modelIds.length} model${modelIds.length === 1 ? '' : 's'} saved and available.`);
  };

  return (
    <div className="settings-tab-content">
      <h3>Models &amp; Providers</h3>
      <p className="settings-hint">Save multiple provider/model connections once. Agent K keeps them in persistent settings and activates the complete connection when you pick a model.</p>
      <div className="settings-field">
        <label>Saved configurations</label>
        <div style={{ display: 'grid', gap: 6 }}>
          {profiles.length === 0 ? <div className="settings-hint">No saved models yet.</div> : profiles.map((profile) => (
            <button key={profile.id} type="button" className={`settings-btn secondary${selectedProfileId === profile.id ? ' active' : ''}`} style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => selectProfile(profile.id)}>
              <span>{profile.name}</span><span className="settings-hint" style={{ margin: 0 }}>{profile.type}</span>
            </button>
          ))}
          <button type="button" className="settings-btn secondary" onClick={newProfile}>+ Add model / provider</button>
        </div>
      </div>
      <div className="settings-field"><label>Provider Type</label><select value={providerType} onChange={(e) => handleProviderTypeChange(e.target.value)}>{(Object.keys(PROVIDER_FIELDS) as ProviderType[]).map((t) => <option key={t} value={t}>{PROVIDER_LABELS[t]}</option>)}</select></div>
      {fields.needsBaseUrl ? <div className="settings-field"><label>Base URL (no trailing /v1)</label><input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={fields.defaultBaseUrl} /></div> : null}
      <div className="settings-field"><label>Model</label><input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder={fields.defaultModel || 'model-id'} /></div>
      {fields.needsApiKey ? <div className="settings-field"><label>{providerType === 'opencode-zen' ? 'Zen API Key' : providerType === 'opencode-go' ? 'Go API Key' : `API Key${fields.apiKeyOptional ? ' (optional)' : ''}`} {apiKey ? <span className="settings-stored-badge"> stored</span> : null}</label><div className="settings-secret-row"><input type={apiKeyReveal ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" /><button type="button" className="settings-btn secondary settings-btn--tiny" onClick={() => setApiKeyReveal((v) => !v)}>{apiKeyReveal ? 'Hide' : 'Show'}</button></div></div> : null}
      <div className="settings-actions">
        <button type="button" onClick={handleTest} className="settings-btn secondary">{testStatus === 'testing' ? 'Testing…' : 'Test &amp; Save Models'}</button>
        <button type="button" onClick={saveProfile} className="settings-btn">Save Configuration</button>
        {selectedProfileId ? <button type="button" onClick={deleteProfile} className="settings-btn secondary settings-btn--danger">Delete</button> : null}
        {savedFlash ? <span className="settings-hint" style={{ color: '#22c55e', margin: 0 }}>Saved</span> : null}
      </div>
      {testStatus === 'success' ? <div className="settings-hint" style={{ color: '#22c55e' }}>{testDetail}</div> : null}
      {testStatus === 'error' ? <div className="settings-hint" style={{ color: '#f87171' }}>{testDetail}</div> : null}
      <h3 style={{ marginTop: 28 }}>Integrations</h3>
      <p className="settings-hint">Optional credentials for SCM / PR features.</p>
      <div className="settings-field"><label>GitHub Token</label><div className="settings-secret-row"><input type={githubReveal ? 'text' : 'password'} value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="ghp_…" autoComplete="off" /><button type="button" className="settings-btn secondary settings-btn--tiny" onClick={() => setGithubReveal((v) => !v)}>{githubReveal ? 'Hide' : 'Show'}</button><button type="button" className="settings-btn secondary settings-btn--tiny" onClick={() => { configManager.update({ 'agent-k.github.token': githubToken }); persistToHost({ 'agent-k.github.token': githubToken }); }}>Save</button></div></div>
    </div>
  );
}
