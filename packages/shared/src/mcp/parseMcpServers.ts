/**
 * MCP-006 — Parse Continue / OpenCode-style MCP server map into MCPServerConfig[].
 */
import type { MCPServerConfig, McpFraming } from './types';

/** Raw entry as stored in VS Code settings / Continue mcp block. */
export interface McpServerEntryRaw {
  type?: string;
  command?: string | string[];
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  transport?: 'stdio' | 'http';
  url?: string;
  framing?: McpFraming;
  id?: string;
  name?: string;
}

/** Parse settings bag into enabled MCPServerConfig[]. */
export function parseMcpServersMap(
  raw: Record<string, McpServerEntryRaw> | McpServerEntryRaw[] | undefined | null,
): MCPServerConfig[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((entry, i) =>
        normalizeEntry(entry.id || entry.name || `server-${i}`, entry),
      )
      .filter((c): c is MCPServerConfig => !!c);
  }

  const out: MCPServerConfig[] = [];
  for (const [key, entry] of Object.entries(raw)) {
    const cfg = normalizeEntry(key, entry);
    if (cfg) out.push(cfg);
  }
  return out;
}

function normalizeEntry(
  key: string,
  entry: McpServerEntryRaw | undefined,
): MCPServerConfig | null {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.enabled === false) return null;

  const name = entry.name || entry.id || key;
  const transport = entry.transport || (entry.url ? 'http' : 'stdio');
  const framing = entry.framing;

  if (Array.isArray(entry.command) && entry.command.length > 0) {
    const [cmd, ...rest] = entry.command.map(String);
    return {
      name,
      command: cmd,
      args: [...rest, ...(entry.args || []).map(String)],
      env: entry.env,
      transport,
      url: entry.url,
      framing,
      enabled: true,
    };
  }

  if (typeof entry.command === 'string' && entry.command.trim()) {
    return {
      name,
      command: entry.command.trim(),
      args: (entry.args || []).map(String),
      env: entry.env,
      transport,
      url: entry.url,
      framing,
      enabled: true,
    };
  }

  if (entry.url) {
    return {
      name,
      command: '',
      args: [],
      env: entry.env,
      transport: 'http',
      url: entry.url,
      framing,
      enabled: true,
    };
  }

  return null;
}
