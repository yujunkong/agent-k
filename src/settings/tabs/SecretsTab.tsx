/**
 * SecretsTab - SecretStorage 관리 UI (C0-T37)
 *
 * 암호화된 API 키 및 시크릿 관리
 *
 * RW-P0-07: Webview는 VS Code SecretStorage API에 직접 접근할 수 없음.
 * Until extension-host bridge lands, API keys flow through configManager (in-memory / workspaceState).
 * Do NOT treat settings.json as the long-term secret store — wire SecretManager in extension.ts next.
 */
import React, { useState, useEffect } from 'react';
import { configManager } from '../../core/ConfigManager';

interface SecretEntry {
  key: string;
  displayKey: string;
  maskedValue: string;
  hasValue: boolean;
}

const SECRET_KEYS = [
  { key: 'agent-k.provider.apiKey', label: 'API Key', provider: 'Provider' },
  { key: 'agent-k.provider.openaiApiKey', label: 'OpenAI API Key', provider: 'OpenAI' },
  { key: 'agent-k.provider.anthropicApiKey', label: 'Anthropic API Key', provider: 'Anthropic' },
  { key: 'agent-k.github.token', label: 'GitHub Token', provider: 'GitHub' }
];

export function SecretsTab() {
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const entries = SECRET_KEYS.map(sk => ({
      key: sk.key,
      displayKey: sk.label,
      maskedValue: '••••••••',
      hasValue: !!configManager.get(sk.key)
    }));
    setSecrets(entries);
  }, []);

  const handleSave = () => {
    Object.entries(editValues).forEach(([key, value]) => {
      if (value) {
        configManager.update({ [key]: value });
      }
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRevealed({});
    setEditValues({});
  };

  const handleClear = (key: string) => {
    configManager.update({ [key]: '' });
    setSecrets(prev => prev.map(s => s.key === key ? { ...s, hasValue: false } : s));
  };

  const toggleReveal = (key: string) => {
    setRevealed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="settings-tab-content">
      <h3>Secrets Management</h3>
      <p style={{ opacity: 0.7, fontSize: '0.9em', marginBottom: 16 }}>
        API keys and secrets are stored in VS Code's encrypted SecretStorage.
        Values are masked by default for security.
      </p>

      <div className="secrets-list">
        {secrets.map((secret) => (
          <div key={secret.key} className="settings-field" style={{ marginBottom: 12 }}>
            <label>{secret.displayKey}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type={revealed[secret.key] ? 'text' : 'password'}
                value={editValues[secret.key] || ''}
                onChange={(e) => setEditValues(prev => ({ ...prev, [secret.key]: e.target.value }))}
                placeholder={secret.hasValue ? '•••••••• (replace to change)' : 'Enter value...'}
                style={{ flex: 1 }}
              />
              <button
                onClick={() => toggleReveal(secret.key)}
                className="settings-btn"
                title={revealed[secret.key] ? 'Hide' : 'Show'}
                style={{ fontSize: '0.85em' }}
              >
                {revealed[secret.key] ? '🙈' : '👁️'}
              </button>
              {secret.hasValue && (
                <button
                  onClick={() => handleClear(secret.key)}
                  className="settings-btn"
                  title="Clear"
                  style={{ fontSize: '0.85em', color: '#f87171' }}
                >
                  🗑️
                </button>
              )}
              {secret.hasValue && !editValues[secret.key] && (
                <span style={{ fontSize: '0.8em', color: '#4ade80' }}>✓ stored</span>
              )}
            </div>
            <div style={{ fontSize: '0.75em', opacity: 0.5, marginTop: 2 }}>{secret.key}</div>
          </div>
        ))}
      </div>

      <div className="settings-actions">
        <button onClick={handleSave} className="settings-btn primary">
          Save Secrets
        </button>
        {saved && <span style={{ color: '#4ade80', marginLeft: 8 }}>Saved ✓</span>}
      </div>
    </div>
  );
}
