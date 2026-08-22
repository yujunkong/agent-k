/**
 * SET-006 — MCP tab UI (v2.1 layout; host wiring later).
 */
import { useMemo, useState, type JSX } from 'react';
import { configStore, persistToHost } from '../configStore';
import { SettingsActions, SettingsField, SettingsSection, SettingsStatus } from '../SettingsUI';

type McpServer = { name: string; command: string; args: string; enabled: boolean };

function parseServers(raw: unknown): McpServer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      name: String(x.name || ''),
      command: String(x.command || ''),
      args: Array.isArray(x.args) ? (x.args as string[]).join(' ') : String(x.args || ''),
      enabled: x.enabled !== false,
    }))
    .filter((s) => s.name);
}

export function McpTab(): JSX.Element {
  const [servers, setServers] = useState<McpServer[]>(() =>
    parseServers(configStore.get('agent-k.mcp.servers')),
  );
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const count = useMemo(() => servers.length, [servers]);

  const addServer = () => {
    const n = name.trim();
    const c = command.trim();
    if (!n || !c) return;
    setServers((prev) => [
      ...prev.filter((s) => s.name !== n),
      { name: n, command: c, args: args.trim(), enabled: true },
    ]);
    setName(''); setCommand(''); setArgs(''); setStatus('idle');
  };

  const handleSave = () => {
    persistToHost({
      'agent-k.mcp.servers': servers.map((s) => ({
        name: s.name,
        command: s.command,
        args: s.args ? s.args.split(/\s+/).filter(Boolean) : [],
        enabled: s.enabled,
      })),
    });
    setStatus('saved');
  };

  return (
    <div className="settings-tab-content" data-testid="settings-mcp-tab">
      <SettingsSection title="MCP servers" description={`${count} server(s). stdio servers for tools.`}>
        <ul className="settings-model-list">
          {servers.length === 0 ? <li className="settings-hint">No MCP servers yet.</li> : null}
          {servers.map((s) => (
            <li key={s.name}>
              <label className="settings-toggle" style={{ width: '100%' }}>
                <div className="settings-toggle__text">
                  <span className="settings-toggle__label">{s.name}</span>
                  <span className="settings-toggle__desc">{s.command} {s.args}</span>
                </div>
                <input type="checkbox" checked={s.enabled}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setServers((prev) => prev.map((x) => (x.name === s.name ? { ...x, enabled: on } : x)));
                    setStatus('idle');
                  }} />
              </label>
              <button type="button" className="settings-btn secondary"
                onClick={() => { setServers((prev) => prev.filter((x) => x.name !== s.name)); setStatus('idle'); }}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </SettingsSection>
      <SettingsSection title="Add server">
        <SettingsField label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="filesystem" /></SettingsField>
        <SettingsField label="Command"><input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" /></SettingsField>
        <SettingsField label="Args" hint="Space-separated">
          <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem ." />
        </SettingsField>
        <SettingsActions>
          <button type="button" className="settings-btn secondary" onClick={addServer}>Add</button>
        </SettingsActions>
      </SettingsSection>
      <SettingsActions>
        <button type="button" className="settings-btn primary" onClick={handleSave}>Save</button>
      </SettingsActions>
      {status === 'saved' ? <SettingsStatus kind="success">MCP servers saved.</SettingsStatus> : null}
    </div>
  );
}
