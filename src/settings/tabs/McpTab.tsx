import React from 'react';

export function McpTab() {
  const [mcpServers, setMcpServers] = React.useState<{ name: string; command: string; args: string[] }[]>([]);

  return (
    <div className="settings-tab-content">
      <h3>MCP Server Configuration</h3>
      {mcpServers.length === 0 && (
        <p className="settings-empty">No MCP servers configured yet. MCP support will be available in C7.</p>
      )}
      <div className="settings-actions">
        <button className="settings-btn" disabled>Add MCP Server</button>
      </div>
    </div>
  );
}
