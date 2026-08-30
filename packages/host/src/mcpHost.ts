/**
 * MCP host bridge — bootstrap / reload / connect / disconnect (MCP-002…004).
 */
import * as vscode from 'vscode';
import {
  bootstrapMcp,
  MCPClient,
  type McpPermissionPolicy,
} from '@agent-k/core';
import { parseMcpServersMap, type McpServerRuntimeInfo } from '@agent-k/shared';
import { hostLog, hostLogError } from './hostLog';

let client: MCPClient | null = null;
let lastStatus: McpServerRuntimeInfo[] = [];

export function getMcpClient(): MCPClient | null {
  return client;
}

export function getMcpStatus(): McpServerRuntimeInfo[] {
  return lastStatus;
}

/** ToolContext.mcp adapter — empty no-op when client missing. */
export function getMcpToolBridge(): {
  listTools: (
    server?: string,
  ) => Promise<Array<{ name: string; description?: string; server?: string }>>;
  callTool: (
    server: string,
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<unknown>;
} {
  if (!client) {
    return {
      listTools: async () => [],
      callTool: async () => {
        throw new Error('MCP client not wired on host.');
      },
    };
  }
  return client.asToolBridge();
}

function readMcpSettings(): {
  servers: ReturnType<typeof parseMcpServersMap>;
  maxSchemaTokens: number;
  featureEnabled: boolean;
  permission: McpPermissionPolicy;
} {
  const cfg = vscode.workspace.getConfiguration('agent-k');
  const featureEnabled = cfg.get('features.mcp') !== false;
  const maxSchemaTokens = Number(cfg.get('mcp.maxSchemaTokens')) || 8000;
  const serversRaw = cfg.get('mcp.servers') as
    | Record<string, unknown>
    | unknown[]
    | undefined;
  const servers = parseMcpServersMap(
    serversRaw as Parameters<typeof parseMcpServersMap>[0],
  );
  const permission: McpPermissionPolicy = {
    enabled: featureEnabled,
  };
  return { servers, maxSchemaTokens, featureEnabled, permission };
}

/** MCP-002 — disconnect + reconnect from current settings. */
export async function reloadMcpFromSettings(): Promise<McpServerRuntimeInfo[]> {
  try {
    if (client) {
      await client.disconnectAll();
    }
    const { servers, maxSchemaTokens, featureEnabled, permission } =
      readMcpSettings();
    const result = await bootstrapMcp({
      configs: servers,
      maxSchemaTokens,
      featureEnabled,
      clientOptions: { permission },
    });
    client = result.client;
    lastStatus = result.status;
    hostLog(
      'MCP',
      `reload servers=${servers.length} status=${JSON.stringify(
        lastStatus.map((s) => `${s.name}:${s.status}`),
      )}`,
    );
    return lastStatus;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    hostLogError('MCP', `reload failed: ${msg}`);
    throw err;
  }
}

/** MCP-003 — connect one server by name (from settings). */
export async function connectMcpServer(
  name?: string,
): Promise<McpServerRuntimeInfo | undefined> {
  const { servers, maxSchemaTokens, featureEnabled, permission } =
    readMcpSettings();
  if (!featureEnabled) {
    void vscode.window.showWarningMessage('MCP feature is disabled.');
    return undefined;
  }
  if (!client) {
    client = new MCPClient({ maxSchemaTokens, permission });
  } else {
    client.setMaxSchemaTokens(maxSchemaTokens);
    client.setPermissionPolicy(permission);
  }

  let target = name;
  if (!target) {
    if (servers.length === 0) {
      void vscode.window.showInformationMessage('No MCP servers configured.');
      return undefined;
    }
    target = await vscode.window.showQuickPick(
      servers.map((s) => s.name),
      { title: 'Connect MCP server' },
    );
    if (!target) return undefined;
  }

  const cfg = servers.find((s) => s.name === target);
  if (!cfg) {
    void vscode.window.showErrorMessage(`MCP server "${target}" not in settings.`);
    return undefined;
  }
  const info = await client.connectOne(cfg);
  lastStatus = client.getStatus();
  void vscode.window.showInformationMessage(
    `MCP ${info.name}: ${info.status}${info.error ? ` — ${info.error}` : ''}`,
  );
  return info;
}

/** MCP-004 — disconnect all (or one). */
export async function disconnectMcp(name?: string): Promise<void> {
  if (!client) {
    void vscode.window.showInformationMessage('No MCP client active.');
    return;
  }
  if (name) {
    await client.disconnectOne(name);
  } else {
    await client.disconnectAll();
  }
  lastStatus = client.getStatus();
  void vscode.window.showInformationMessage(
    name ? `MCP disconnected: ${name}` : 'All MCP servers disconnected',
  );
}

/** Activate-time bootstrap (best-effort). */
export async function bootstrapMcpOnActivate(): Promise<void> {
  try {
    await reloadMcpFromSettings();
  } catch {
    /* non-fatal on activate */
  }
}

export async function shutdownMcp(): Promise<void> {
  if (!client) return;
  await client.disconnectAll();
  client = null;
  lastStatus = [];
}
