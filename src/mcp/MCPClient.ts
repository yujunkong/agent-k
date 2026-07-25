/**
 * MCPClient — MCP SDK 브리지 → Tool Registry 등록 (C7-T17)
 *
 * 이름 충돌 시 prefix로 구분 (e.g., mcp_github_*)
 */
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
  url?: string;
}

export class MCPClient {
  private servers: Map<string, MCPServerConfig> = new Map();
  private tools: Map<string, MCPToolDefinition> = new Map();
  private toolPrefix: string;

  constructor(toolPrefix: string = 'mcp_') {
    this.toolPrefix = toolPrefix;
  }

  /**
   * Register an MCP server
   */
  registerServer(config: MCPServerConfig): void {
    this.servers.set(config.name, config);
  }

  /**
   * Connect to a server and fetch its tools
   */
  async connect(serverName: string): Promise<MCPToolDefinition[]> {
    const config = this.servers.get(serverName);
    if (!config) throw new Error(`MCP server not registered: ${serverName}`);

    const serverTools = await this.fetchTools(config);
    const prefixedTools = serverTools.map(tool => ({
      ...tool,
      name: `${this.toolPrefix}${serverName}_${tool.name}`
    }));

    for (const tool of prefixedTools) {
      this.tools.set(tool.name, tool);
    }

    return prefixedTools;
  }

  /**
   * Get all registered tools
   */
  getAllTools(): MCPToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): MCPToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Call an MCP tool
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`MCP tool not found: ${toolName}`);

    return await tool.handler(args);
  }

  /**
   * Disconnect all MCP servers
   */
  async disconnectAll(): Promise<void> {
    this.tools.clear();
  }

  /**
   * Check if a specific server is connected
   */
  isConnected(serverName: string): boolean {
    const config = this.servers.get(serverName);
    if (!config) return false;

    // Check if any tool has the server prefix
    const prefix = `${this.toolPrefix}${serverName}_`;
    return Array.from(this.tools.keys()).some(name => name.startsWith(prefix));
  }

  /**
   * Generate Zod schemas for all registered MCP tools
   */
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
            case 'string': zodType = z.string(); break;
            case 'number': zodType = z.number(); break;
            case 'boolean': zodType = z.boolean(); break;
            case 'array': zodType = z.array(z.unknown()); break;
            case 'object': zodType = z.record(z.string(), z.unknown()); break;
            default: zodType = z.unknown();
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

  /**
   * Get tool metadata for registry
   */
  getToolMeta(): Array<{ name: string; description: string; tierAccess: string; category: string }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      tierAccess: 'B', // MCP tools are Tier B by default
      category: 'mcp'
    }));
  }

  private async fetchTools(config: MCPServerConfig): Promise<MCPToolDefinition[]> {
    const toolsDir = path.join(process.env.HOME || '/tmp', '.agentk', 'mcp', config.name);
    if (!fs.existsSync(toolsDir)) {
      fs.mkdirSync(toolsDir, { recursive: true });
    }

    // Return stub tool definitions for demo purposes
    // In production, this would connect via stdio/HTTP to the MCP server
    return [
      {
        name: 'list_tools',
        description: `List available tools from ${config.name}`,
        inputSchema: {
          type: 'object',
          properties: {}
        },
        handler: async () => this.getAllTools().map(t => ({ name: t.name, description: t.description }))
      },
      {
        name: 'call_tool',
        description: `Call a tool on ${config.name}`,
        inputSchema: {
          type: 'object',
          properties: {
            toolName: { type: 'string', description: 'Name of the tool to call' },
            args: { type: 'object', description: 'Tool arguments' }
          },
          required: ['toolName', 'args']
        },
        handler: async (args) => {
          const { toolName, ...toolArgs } = args as { toolName: string; [key: string]: unknown };
          return await this.callTool(toolName, toolArgs);
        }
      }
    ];
  }
}
