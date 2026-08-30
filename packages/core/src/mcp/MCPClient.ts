/**
 * MCP-001 — Multi-server MCP client manager.
 */
import type {
  MCPServerConfig,
  McpServerRuntimeInfo,
  McpToolDescriptor,
} from '@agent-k/shared';
import { StdioMcpSession } from './StdioMcpSession';
import { shouldDeferMcpServer } from './DeferredMCPTools';
import {
  checkMcpToolPermission,
  type McpPermissionPolicy,
} from './McpPermissions';

export interface MCPClientOptions {
  maxSchemaTokens?: number;
  permission?: McpPermissionPolicy;
}

export class MCPClient {
  private readonly sessions = new Map<string, StdioMcpSession>();
  private readonly infos = new Map<string, McpServerRuntimeInfo>();
  private readonly deferredConfigs = new Map<string, MCPServerConfig>();
  private maxSchemaTokens: number;
  private permission: McpPermissionPolicy;

  constructor(opts: MCPClientOptions = {}) {
    this.maxSchemaTokens = opts.maxSchemaTokens ?? 8000;
    this.permission = opts.permission ?? {};
  }

  setMaxSchemaTokens(n: number): void {
    this.maxSchemaTokens = Math.min(200_000, Math.max(500, Math.floor(n) || 8000));
  }

  setPermissionPolicy(policy: McpPermissionPolicy): void {
    this.permission = policy;
  }

  getStatus(): McpServerRuntimeInfo[] {
    return [...this.infos.values()];
  }

  /** Connect all configs (stdio). HTTP skipped with error status. */
  async connectAll(
    configs: MCPServerConfig[],
    signal?: AbortSignal,
  ): Promise<McpServerRuntimeInfo[]> {
    for (const cfg of configs) {
      await this.connectOne(cfg, signal);
    }
    return this.getStatus();
  }

  async connectOne(
    cfg: MCPServerConfig,
    signal?: AbortSignal,
  ): Promise<McpServerRuntimeInfo> {
    const name = cfg.name;
    this.infos.set(name, { name, status: 'connecting' });

    if (cfg.transport === 'http' || cfg.url) {
      const info: McpServerRuntimeInfo = {
        name,
        status: 'error',
        error: 'HTTP MCP transport not implemented yet — use stdio',
      };
      this.infos.set(name, info);
      return info;
    }

    try {
      // Disconnect previous session with same name
      await this.disconnectOne(name);

      const session = new StdioMcpSession(cfg);
      await session.connect(signal);
      const tools = await session.listTools(true);
      const decision = shouldDeferMcpServer(
        tools,
        this.maxSchemaTokens,
        (t) => session.estimateSchemaTokens(t),
      );

      if (!decision.connectNow) {
        await session.disconnect();
        this.deferredConfigs.set(name, cfg);
        const info: McpServerRuntimeInfo = {
          name,
          status: 'deferred',
          toolCount: tools.length,
          deferredReason: decision.reason,
        };
        this.infos.set(name, info);
        return info;
      }

      this.sessions.set(name, session);
      this.deferredConfigs.delete(name);
      const info: McpServerRuntimeInfo = {
        name,
        status: 'connected',
        toolCount: tools.length,
      };
      this.infos.set(name, info);
      return info;
    } catch (err) {
      const info: McpServerRuntimeInfo = {
        name,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
      this.infos.set(name, info);
      return info;
    }
  }

  /** Force-connect a previously deferred server (bypass budget once). */
  async promoteDeferred(name: string, signal?: AbortSignal): Promise<McpServerRuntimeInfo> {
    const cfg = this.deferredConfigs.get(name);
    if (!cfg) {
      return (
        this.infos.get(name) || {
          name,
          status: 'error',
          error: 'Not deferred',
        }
      );
    }
    const prev = this.maxSchemaTokens;
    this.maxSchemaTokens = 200_000;
    try {
      return await this.connectOne(cfg, signal);
    } finally {
      this.maxSchemaTokens = prev;
    }
  }

  async disconnectOne(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (session) {
      await session.disconnect();
      this.sessions.delete(name);
    }
    this.deferredConfigs.delete(name);
    const prev = this.infos.get(name);
    this.infos.set(name, {
      name,
      status: 'disconnected',
      toolCount: prev?.toolCount,
    });
  }

  async disconnectAll(): Promise<void> {
    const names = [...this.sessions.keys(), ...this.deferredConfigs.keys()];
    for (const name of new Set(names)) {
      await this.disconnectOne(name);
    }
  }

  /** List tools across connected servers (optional server filter). */
  async listTools(server?: string): Promise<McpToolDescriptor[]> {
    const out: McpToolDescriptor[] = [];
    for (const [name, session] of this.sessions) {
      if (server && name !== server) continue;
      try {
        const tools = await session.listTools();
        out.push(...tools);
      } catch {
        /* skip failed session */
      }
    }
    return out;
  }

  async callTool(
    server: string,
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const perm = checkMcpToolPermission(server, tool, this.permission);
    if (!perm.allowed) {
      throw new Error(perm.reason || 'MCP permission denied');
    }

    let session = this.sessions.get(server);
    if (!session && this.deferredConfigs.has(server)) {
      await this.promoteDeferred(server, signal);
      session = this.sessions.get(server);
    }
    if (!session) {
      throw new Error(`MCP server "${server}" is not connected`);
    }
    return session.callTool(tool, args, signal);
  }

  /** Adapter for ToolContext.mcp. */
  asToolBridge(): {
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
    return {
      listTools: (server) => this.listTools(server),
      callTool: (server, tool, args, signal) =>
        this.callTool(server, tool, args, signal),
    };
  }
}
