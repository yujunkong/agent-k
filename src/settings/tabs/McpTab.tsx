/**
 * McpTab — shows configured MCP servers (agent-k.mcp.servers) and wiring hints.
 * Connection runs in the extension host on activate / agent-k.mcp.reload.
 */
import React, { useMemo } from 'react';
import { configManager } from '../../core/ConfigManager';
import { parseMcpServersMap } from '../../mcp/parseMcpServers';

export function McpTab() {
  const servers = useMemo(() => {
    const raw =
      configManager.get('agent-k.mcp.servers') ||
      // Fallback: defaults mirror package.json (webview may not have VS Code bridge yet)
      undefined;
    return parseMcpServersMap(raw);
  }, []);

  return (
    <div className="settings-tab-content">
      <h3>MCP Server Configuration</h3>
      <p className="settings-hint">
        Edit <code>agent-k.mcp.servers</code> in VS Code Settings (JSON). Continue/OpenCode-style map:
        command as argv array, <code>enabled</code> flag. Host auto-connects on activate.
      </p>
      {servers.length === 0 ? (
        <p className="settings-empty">
          No MCP servers configured. Add e.g. searxng under <code>agent-k.mcp.servers</code>, then run
          command <code>Agent K: MCP Reload</code> (agent-k.mcp.reload).
        </p>
      ) : (
        <ul className="settings-list">
          {servers.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong>
              <div className="settings-muted">
                {[s.command, ...(s.args || [])].filter(Boolean).join(' ')}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="settings-actions">
        <p className="settings-muted">
          Tools register as <code>mcp_&lt;server&gt;_&lt;tool&gt;</code> (e.g.{' '}
          <code>mcp_searxng_web_search</code>). Use Command Palette → MCP Reload after edits.
        </p>
      </div>
    </div>
  );
}
