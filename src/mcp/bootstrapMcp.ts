/**
 * Bootstrap MCP servers from VS Code `agent-k.mcp.servers` settings.
 * Registers tools into the ToolRegistry for agent/debug modes.
 */
import * as vscode from 'vscode';
import type { MCPClient, MCPToolDefinition } from './MCPClient';
import { parseMcpServersMap } from './parseMcpServers';
import { toolRegistry } from '../tools/registry';
import { isFeatureEnabled } from '../core/featureFlags';

/** Register MCP tool defs into the shared ToolRegistry (agent/debug only). */
export function registerMcpToolsInRegistry(tools: MCPToolDefinition[]): void {
  for (const t of tools) {
    toolRegistry.registerTool({
      name: t.name,
      description: t.description,
      parameters: (t.inputSchema || { type: 'object', properties: {} }) as Record<string, unknown>,
      category: 'orchestration',
      modeAllowlist: ['agent', 'debug', 'plan'],
    });

    // Convenience: expose SearXNG web_search under the harness allowlist name
    if (t.serverName === 'searxng' && t.serverToolName === 'web_search') {
      toolRegistry.registerTool({
        name: 'web_search',
        description: `${t.description} (alias → ${t.name})`,
        parameters: (t.inputSchema || { type: 'object', properties: {} }) as Record<string, unknown>,
        category: 'web',
        modeAllowlist: ['agent', 'debug', 'plan'],
      });
    }
  }
}

/**
 * Read Continue-style mcp map from settings, connect enabled servers, register tools.
 * Returns a short status line for the output channel.
 */
export async function bootstrapMcpFromSettings(
  mcpClient: MCPClient,
  log: (msg: string) => void
): Promise<string[]> {
  if (!isFeatureEnabled('mcp')) {
    log('[MCP] Skipped — agent-k.features.mcp is disabled');
    return [];
  }

  const raw = vscode.workspace.getConfiguration('agent-k').get('mcp.servers') as
    | Record<string, unknown>
    | unknown[]
    | undefined;

  const configs = parseMcpServersMap(raw as any);
  const lines: string[] = [];

  if (configs.length === 0) {
    log('[MCP] No servers in agent-k.mcp.servers — skip auto-connect');
    return lines;
  }

  for (const cfg of configs) {
    mcpClient.registerServer(cfg);
  }

  for (const cfg of configs) {
    try {
      log(`[MCP] Connecting "${cfg.name}"…`);
      const tools = await mcpClient.connect(cfg.name);
      registerMcpToolsInRegistry(tools);
      const names = tools.map((t) => t.name).join(', ');
      const line = `connected ${cfg.name} (${tools.length}): ${names}`;
      lines.push(line);
      log(`[MCP] ${line}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`FAILED ${cfg.name}: ${msg}`);
      log(`[MCP] Failed "${cfg.name}": ${msg}`);
    }
  }

  return lines;
}
