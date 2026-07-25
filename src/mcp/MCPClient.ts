/**
 * MCPClient — MCP JSON-RPC bridge → Tool Registry (C7-T17 / SearXNG-ready)
 *
 * - stdio: NDJSON (custom Python) + Content-Length (official MCP)
 * - http: best-effort REST fallback (non-spec)
 * - Tool names: mcp_<server>_<tool>
 */
import { z } from 'zod';
import { StdioMcpSession, type McpFraming } from './StdioMcpSession';

export type { McpFraming };

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
  /** Unprefixed tool name on the MCP server */
  serverToolName: string;
  serverName: string;
}

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
  url?: string;
  framing?: McpFraming;
  enabled?: boolean;
}

export class MCPClient {
  private servers: Map<string, MCPServerConfig> = new Map();
  private tools: Map<string, MCPToolDefinition> = new Map();
  private sessions: Map<string, StdioMcpSession> = new Map();
  private toolPrefix: string;

  constructor(toolPrefix: string = 'mcp_') {
    this.toolPrefix = toolPrefix;
  }

  /** Register (or replace) an MCP server config without connecting */
  registerServer(config: MCPServerConfig): void {
    this.servers.set(config.name, config);
  }

  getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }

  getServerConfig(name: string): MCPServerConfig | undefined {
    return this.servers.get(name);
  }

  /**
   * Connect to a server and fetch its tools.
   * Keeps the stdio process alive for subsequent tools/call.
   */
  async connect(serverName: string): Promise<MCPToolDefinition[]> {
    const config = this.servers.get(serverName);
    if (!config) throw new Error(`MCP server not registered: ${serverName}`);

    // Replace existing session for this server
    await this.disconnect(serverName);

    const serverTools = await this.fetchTools(config);
    const prefixedTools = serverTools.map((tool) => ({
      ...tool,
      name: `${this.toolPrefix}${serverName}_${tool.name}`,
      serverToolName: tool.name,
      serverName,
    }));

    for (const tool of prefixedTools) {
      this.tools.set(tool.name, tool);
    }

    return prefixedTools;
  }

  getAllTools(): MCPToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): MCPToolDefinition | undefined {
    return this.tools.get(name);
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`MCP tool not found: ${toolName}`);
    return await tool.handler(args);
  }

  isConnected(serverName: string): boolean {
    const session = this.sessions.get(serverName);
    if (session?.isAlive()) return true;
    const prefix = `${this.toolPrefix}${serverName}_`;
    return Array.from(this.tools.keys()).some((name) => name.startsWith(prefix));
  }

  /** Status snapshot for settings UI / logging */
  getStatus(): Array<{ name: string; connected: boolean; toolCount: number; command: string }> {
    return Array.from(this.servers.entries()).map(([name, cfg]) => {
      const prefix = `${this.toolPrefix}${name}_`;
      const toolCount = Array.from(this.tools.keys()).filter((t) => t.startsWith(prefix)).length;
      return {
        name,
        connected: this.isConnected(name),
        toolCount,
        command: [cfg.command, ...(cfg.args || [])].filter(Boolean).join(' '),
      };
    });
  }

  generateSchemas(): Record<string, z.ZodObject<any>> {
    const schemas: Record<string, z.ZodObject<any>> = {};

    for (const [name, tool] of this.tools) {
      const shape: Record<string, z.ZodTypeAny> = {};
      const schema = tool.inputSchema as Record<string, unknown> | undefined;

      if (schema?.properties && typeof schema.properties === 'object') {
        const props = schema.properties as Record<string, { type: string; description?: string }>;
        for (const [key, prop] of Object.entries(props)) {
          let zodType: z.ZodTypeAny;
          switch (prop.type) {
            case 'string':
              zodType = z.string();
              break;
            case 'number':
            case 'integer':
              zodType = z.number();
              break;
            case 'boolean':
              zodType = z.boolean();
              break;
            case 'array':
              zodType = z.array(z.unknown());
              break;
            case 'object':
              zodType = z.record(z.string(), z.unknown());
              break;
            default:
              zodType = z.unknown();
          }
          if (prop.description) {
            zodType = zodType.describe(prop.description);
          }
          shape[key] = zodType;
        }
      }

      schemas[name] = z.object(shape).describe(tool.description);
    }

    return schemas;
  }

  getToolMeta(): Array<{ name: string; description: string; tierAccess: string; category: string }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      tierAccess: 'B',
      category: 'mcp',
    }));
  }

  private async fetchTools(config: MCPServerConfig): Promise<Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }>> {
    if (config.transport === 'http' || (config.url && !config.command)) {
      return this.fetchToolsHTTP(config);
    }
    return this.fetchToolsStdio(config);
  }

  private async fetchToolsStdio(config: MCPServerConfig) {
    if (!config.command) {
      throw new Error(`MCP server "${config.name}" has no command`);
    }

    const session = await StdioMcpSession.connect({
      name: config.name,
      command: config.command,
      args: config.args || [],
      env: config.env,
      framing: config.framing,
    });
    this.sessions.set(config.name, session);

    const listed = await session.listTools();
    return listed.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {},
      handler: async (args: Record<string, unknown>) => {
        const live = this.sessions.get(config.name);
        if (!live?.isAlive()) {
          throw new Error(`MCP server "${config.name}" is not connected`);
        }
        return live.callTool(t.name, args);
      },
    }));
  }

  private async fetchToolsHTTP(config: MCPServerConfig) {
    const baseUrl = config.url || 'http://localhost:3000';
    try {
      const response = await fetch(`${baseUrl}/tools/list`, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as any;
      return (data.tools || []).map((t: any) => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || {},
        handler: async (args: Record<string, unknown>) => {
          const callResp = await fetch(`${baseUrl}/tools/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: t.name, arguments: args }),
          });
          if (!callResp.ok) throw new Error(`MCP tool call failed: HTTP ${callResp.status}`);
          return await callResp.json();
        },
      }));
    } catch (err) {
      throw new Error(
        `MCP server "${config.name}" HTTP connection failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Disconnect one server and drop its tools */
  async disconnect(serverName: string): Promise<void> {
    const session = this.sessions.get(serverName);
    if (session) {
      session.close();
      this.sessions.delete(serverName);
    }
    const prefix = `${this.toolPrefix}${serverName}_`;
    for (const name of Array.from(this.tools.keys())) {
      if (name.startsWith(prefix)) this.tools.delete(name);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const name of Array.from(this.sessions.keys())) {
      await this.disconnect(name);
    }
    this.tools.clear();
  }
}
