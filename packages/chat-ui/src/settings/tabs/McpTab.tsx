/**
 * McpTab — configured MCP servers + schema budget.
 * Connection runs in extension host (activate / agent-k.mcp.reload).
 */
import React, { useMemo, useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import { parseMcpServersMap } from '../../mcp/parseMcpServers';
import {
  SettingsActions,
  SettingsField,
  SettingsSection,
  SettingsStatus,
  persistToHost,
} from '../components/SettingsUI';

function postHost(type: string, payload: Record<string, unknown> = {}): void {
  try {
    const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
    if (api?.postMessage) {
      api.postMessage({ type, ...payload });
      return;
    }
  } catch {
    /* ignore */
  }
  window.parent.postMessage({ type, ...payload }, '*');
}

export function McpTab() {
  const servers = useMemo(() => {
    const raw = configManager.get('agent-k.mcp.servers');
    return parseMcpServersMap(raw);
  }, []);

  const [maxSchemaTokens, setMaxSchemaTokens] = useState(
    Number(configManager.get('agent-k.mcp.maxSchemaTokens')) || 8000
  );
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  const handleSaveBudget = () => {
    const tokens = Math.min(
      200000,
      Math.max(500, Math.floor(maxSchemaTokens) || 8000)
    );
    setMaxSchemaTokens(tokens);
    const values = { 'agent-k.mcp.maxSchemaTokens': tokens };
    configManager.update(values);
    persistToHost(values);
    setStatus('saved');
  };

  const handleReload = () => {
    postHost('mcp.reload');
    // Also try command via host message pattern used elsewhere
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'command', command: 'agent-k.mcp.reload' });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="settings-tab-content">
      <SettingsSection
        title="MCP servers"
        description="Edit agent-k.mcp.servers in VS Code Settings or Settings → JSON (.agentk/settings.json). Host connects on activate / MCP Reload."
      >
        {servers.length === 0 ? (
          <p className="settings-field__hint" style={{ margin: 0 }}>
            No servers configured. Add entries under <code>mcp.servers</code>, then
            reload.
          </p>
        ) : (
          <ul className="settings-model-list">
            {servers.map((s) => (
              <li key={s.name}>
                <span>
                  <strong>{s.name}</strong>
                  <span className="settings-field__hint" style={{ display: 'block' }}>
                    {[s.command, ...(s.args || [])].filter(Boolean).join(' ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <SettingsActions>
          <button type="button" className="settings-btn secondary" onClick={handleReload}>
            Reload MCP
          </button>
        </SettingsActions>
      </SettingsSection>

      <SettingsSection
        title="Schema budget"
        description="ADDON-T15 — servers whose tool schema estimate exceeds this stay deferred (lazy-loaded)."
      >
        <SettingsField label="Max schema tokens" hint="500 – 200000">
          <input
            type="number"
            value={maxSchemaTokens}
            min={500}
            max={200000}
            step={500}
            onChange={(e) => {
              setMaxSchemaTokens(parseInt(e.target.value, 10) || 8000);
              setStatus('idle');
            }}
          />
        </SettingsField>
        <SettingsActions>
          <button
            type="button"
            className="settings-btn primary"
            onClick={handleSaveBudget}
          >
            Save budget
          </button>
        </SettingsActions>
        {status === 'saved' ? (
          <SettingsStatus kind="success">Schema budget saved.</SettingsStatus>
        ) : null}
      </SettingsSection>
    </div>
  );
}
