/**
 * DeferredMCPTools — MCP 도구 지연 로드 (스키마 폭증 방지) (C7-T18)
 *
 * ToolSearch로 등록 후 검색 시에만 스키마 로드
 */
import { z } from 'zod';
import { MCPClient } from './MCPClient';

export interface DeferredToolEntry {
  serverName: string;
  toolNames: string[];
  loaded: boolean;
}

export class DeferredMCPTools {
  private mcpClient: MCPClient;
  private deferred: Map<string, DeferredToolEntry> = new Map();
  private loaded: boolean = false;

  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;
  }

  /**
   * Register a server's tools as deferred (not yet loaded schemas)
   */
  deferServer(serverName: string, toolNames: string[]): void {
    this.deferred.set(serverName, {
      serverName,
      toolNames,
      loaded: false
    });
  }

  /**
   * List all deferred servers
   */
  listDeferred(): DeferredToolEntry[] {
    return Array.from(this.deferred.values()).map(e => ({
      serverName: e.serverName,
      toolNames: e.toolNames,
      loaded: e.loaded
    }));
  }

  /**
   * Load all deferred MCP tools (fetch schemas)
   */
  async loadAll(): Promise<void> {
    for (const [serverName] of this.deferred) {
      await this.loadServer(serverName);
    }
    this.loaded = true;
  }

  /**
   * Load tools for a specific server
   */
  async loadServer(serverName: string): Promise<void> {
    const entry = this.deferred.get(serverName);
    if (!entry) return;

    await this.mcpClient.connect(serverName);
    entry.loaded = true;
  }

  /**
   * Search across deferred tools (loads matching server's tools on demand)
   */
  async search(query: string): Promise<Array<{ server: string; tools: string[] }>> {
    const q = query.toLowerCase();
    const results: Array<{ server: string; tools: string[] }> = [];

    for (const [serverName, entry] of this.deferred) {
      if (serverName.toLowerCase().includes(q)) {
        if (!entry.loaded) {
          await this.loadServer(serverName);
        }
        results.push({
          server: serverName,
          tools: this.mcpClient.getAllTools()
            .filter(t => t.name.startsWith(`mcp_${serverName}_`))
            .map(t => t.name)
        });
      }
    }

    return results;
  }

  /**
   * Check if all tools are loaded
   */
  isFullyLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Check if a specific server's tools are loaded
   */
  isServerLoaded(serverName: string): boolean {
    return this.deferred.get(serverName)?.loaded ?? false;
  }

  /**
   * Get search result description
   */
  getSearchDescription(serverName: string): string {
    const entry = this.deferred.get(serverName);
    if (!entry) return `MCP server "${serverName}" not registered`;

    if (!entry.loaded) {
      return `MCP server "${serverName}" (${entry.toolNames.length} tools — use loadServer to load)`;
    }

    const tools = this.mcpClient.getAllTools()
      .filter(t => t.name.startsWith(`mcp_${serverName}_`));
    return `MCP server "${serverName}" (${tools.length} tools loaded)`;
  }
}
