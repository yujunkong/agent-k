/**
 * SET-002 — Models / AI Providers tab UI (v2.1 density; local connection list).
 * Full ProviderConnections registry lands with PROVIDER-* host wiring.
 */
import { useMemo, useState, type JSX } from 'react';
import { configStore, persistToHost } from '../configStore';
import {
  SettingsActions,
  SettingsField,
  SettingsSection,
  SettingsStatus,
} from '../SettingsUI';

type ProviderDraft = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

const PRESETS: Array<{ id: string; name: string; baseUrl: string; model: string }> = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-4.5' },
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2' },
  { id: 'lmstudio', name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', model: 'local-model' },
  { id: 'litellm', name: 'LiteLLM', baseUrl: 'http://127.0.0.1:4000', model: 'gpt-4o-mini' },
];

function readProviders(): ProviderDraft[] {
  const raw = configStore.get('agent-k.providers.list');
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x, i) => ({
      id: String(x.id || `p_${i}`),
      name: String(x.name || 'Provider'),
      baseUrl: String(x.baseUrl || ''),
      apiKey: String(x.apiKey || ''),
      model: String(x.model || ''),
    }));
}

export type ModelsTabProps = {
  /** Optional controlled defaults from ChatApp model settings. */
  initialModel?: string;
  initialBaseUrl?: string;
  initialApiKey?: string;
  onSaveDefault?: (next: { model: string; baseUrl: string; apiKey: string }) => void;
  saving?: boolean;
};

export function ModelsTab(props: ModelsTabProps): JSX.Element {
  const {
    initialModel = '',
    initialBaseUrl = '',
    initialApiKey = '',
    onSaveDefault,
    saving,
  } = props;
  const [providers, setProviders] = useState<ProviderDraft[]>(readProviders);
  const [model, setModel] = useState(initialModel || String(configStore.get('agent-k.provider.model') || ''));
  const [baseUrl, setBaseUrl] = useState(
    initialBaseUrl || String(configStore.get('agent-k.provider.baseUrl') || ''),
  );
  const [apiKey, setApiKey] = useState(
    initialApiKey || String(configStore.get('agent-k.provider.apiKey') || ''),
  );
  const [name, setName] = useState('Default');
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const [formError, setFormError] = useState('');

  const presetButtons = useMemo(() => PRESETS, []);

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setName(p.name);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setStatus('idle');
    setFormError('');
  };

  const handleSaveDefault = () => {
    const m = model.trim();
    if (!m) {
      setFormError('Model id is required.');
      return;
    }
    setFormError('');
    persistToHost({
      'agent-k.provider.model': m,
      'agent-k.provider.baseUrl': baseUrl.trim(),
      'agent-k.provider.apiKey': apiKey.trim(),
      'agent-k.providers.list': providers,
    });
    onSaveDefault?.({ model: m, baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
    setStatus('saved');
  };

  const addFromForm = () => {
    if (!baseUrl.trim() || !model.trim()) {
      setFormError('Base URL and model are required to add a provider card.');
      return;
    }
    const id = `p_${Date.now()}`;
    setProviders((prev) => [
      ...prev,
      {
        id,
        name: name.trim() || 'Provider',
        baseUrl: baseUrl.trim().replace(/\/$/, ''),
        apiKey: apiKey.trim(),
        model: model.trim(),
      },
    ]);
    setStatus('idle');
    setFormError('');
  };

  return (
    <div className="settings-tab-content">
      <h3>AI Providers</h3>
      <p className="settings-hint">
        Add a provider preset, set model / base URL / API key, then Save. Live /models probe
        arrives with PROVIDER-* host wiring.
      </p>

      <SettingsSection title="Presets" description="Fill the form from a common endpoint.">
        <div className="settings-actions" style={{ flexWrap: 'wrap' }}>
          {presetButtons.map((p) => (
            <button key={p.id} type="button" className="settings-btn secondary" onClick={() => applyPreset(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Default model" description="Used for chat.send (`agent-k.provider.*`).">
        <SettingsField label="Display name">
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
        </SettingsField>
        <SettingsField label="Model id">
          <input
            data-testid="settings-model"
            value={model}
            placeholder="e.g. gpt-4o-mini"
            disabled={saving}
            onChange={(e) => { setModel(e.target.value); setStatus('idle'); }}
            autoFocus
          />
        </SettingsField>
        <SettingsField label="Base URL" hint="OpenAI-compatible endpoint">
          <input
            data-testid="settings-base-url"
            type="url"
            value={baseUrl}
            placeholder="http://127.0.0.1:4000"
            disabled={saving}
            onChange={(e) => { setBaseUrl(e.target.value); setStatus('idle'); }}
          />
        </SettingsField>
        <SettingsField label="API key (optional)">
          <input
            data-testid="settings-api-key"
            type="password"
            value={apiKey}
            placeholder="leave blank for local"
            disabled={saving}
            autoComplete="off"
            onChange={(e) => { setApiKey(e.target.value); setStatus('idle'); }}
          />
        </SettingsField>
        {formError ? <SettingsStatus kind="error">{formError}</SettingsStatus> : null}
        <SettingsActions>
          <button type="button" className="settings-btn secondary" onClick={addFromForm}>
            Add to list
          </button>
          <button
            type="button"
            className="settings-btn primary"
            data-testid="settings-save"
            disabled={saving || !model.trim()}
            onClick={handleSaveDefault}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </SettingsActions>
        {status === 'saved' ? <SettingsStatus kind="success">Provider settings saved.</SettingsStatus> : null}
      </SettingsSection>

      <SettingsSection title="Saved providers" description={`${providers.length} connection(s)`}>
        <ul className="settings-model-list">
          {providers.length === 0 ? <li className="settings-hint">No saved providers yet.</li> : null}
          {providers.map((p) => (
            <li key={p.id}>
              <span>
                <strong>{p.name}</strong> · {p.model}
                <br />
                <span className="settings-hint">{p.baseUrl}</span>
              </span>
              <button
                type="button"
                className="settings-btn secondary"
                onClick={() => {
                  setProviders((prev) => prev.filter((x) => x.id !== p.id));
                  setStatus('idle');
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
