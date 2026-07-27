/**
 * DeferredMCPTools — MCP 도구 지연 로드 (스키마 폭증 방지) (C7-T18 / ADDON-T15)
 *
 * ToolSearch로 등록 후 검색 시에만 스키마 로드.
 * ADDON-T15: 서버별 스키마 페이로드 토큰 추정 + 예산(agent-k.mcp.maxSchemaTokens,
 * 기본 8000) 초과 시 자동으로 deferred 상태를 유지한다.
 */
import { z } from 'zod';
import { MCPClient } from './MCPClient';

export interface DeferredToolEntry {
  serverName: string;
  toolNames: string[];
  loaded: boolean;
}

/** Default token budget per MCP server schema payload (agent-k.mcp.maxSchemaTokens). */
export const DEFAULT_MAX_SCHEMA_TOKENS = 8000;

/**
 * Pure — estimate token count for a JSON schema payload (~4 chars/token, same
 * heuristic used elsewhere in the codebase, e.g. ContextAssembler.estimateTokens).
 */
export function estimateSchemaTokens(schemasJson: string): number {
  return Math.ceil((schemasJson?.length || 0) / 4);
}

/** Pure — should a schema payload of this estimated size stay deferred? */
export function shouldAutoDefer(
  estimatedTokens: number,
  maxSchemaTokens: number = DEFAULT_MAX_SCHEMA_TOKENS
): boolean {
  return estimatedTokens > maxSchemaTokens;
}

export interface SchemaBudgetResult {
  /** true when the server should stay deferred (schema too large for the budget) */
  deferred: boolean;
  /** estimated token count for the given schema payload */
  tokens: number;
}

export class DeferredMCPTools {
  private mcpClient: MCPClient;
  private deferred: Map<string, DeferredToolEntry> = new Map();
  private loaded: boolean = false;
  private maxSchemaTokens: number = DEFAULT_MAX_SCHEMA_TOKENS;
  /** serverName -> true when its last known schema payload exceeded the budget */
  private overBudget: Map<string, boolean> = new Map();

  constructor(mcpClient: MCPClient, maxSchemaTokens: number = DEFAULT_MAX_SCHEMA_TOKENS) {
    this.mcpClient = mcpClient;
    this.maxSchemaTokens = maxSchemaTokens;
  }

  /** ADDON-T15: current schema token budget (agent-k.mcp.maxSchemaTokens) */
  getMaxSchemaTokens(): number {
    return this.maxSchemaTokens;
  }

  /** ADDON-T15: update the schema token budget (e.g. from Settings) */
  setMaxSchemaTokens(maxSchemaTokens: number): void {
    this.maxSchemaTokens =
      Number.isFinite(maxSchemaTokens) && maxSchemaTokens > 0
        ? Math.floor(maxSchemaTokens)
        : DEFAULT_MAX_SCHEMA_TOKENS;
  }

  /**
   * ADDON-T15: estimate a server's schema payload size against the budget.
   * Over-budget servers are (re)registered as deferred so a caller cannot
   * accidentally treat them as loaded without an explicit loadServer() call.
   */
  applyBudget(serverName: string, schemaPayload: string): SchemaBudgetResult {
    const tokens = estimateSchemaTokens(schemaPayload);
    const overBudget = shouldAutoDefer(tokens, this.maxSchemaTokens);
    this.overBudget.set(serverName, overBudget);

    if (overBudget) {
      const existing = this.deferred.get(serverName);
      if (existing) {
        existing.loaded = false;
      } else {
        this.deferServer(serverName, []);
      }
    }

    return { deferred: overBudget, tokens };
  }

  /** ADDON-T15: was this server's last applyBudget() call over the token budget? */
  isOverSchemaBudget(serverName: string): boolean {
    return this.overBudget.get(serverName) ?? false;
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
      const budgetNote = this.isOverSchemaBudget(serverName)
        ? ` — over schema budget (${this.maxSchemaTokens} tokens), stays deferred`
        : ' — use loadServer to load';
      return `MCP server "${serverName}" (${entry.toolNames.length} tools${budgetNote})`;
    }

    const tools = this.mcpClient.getAllTools()
      .filter(t => t.name.startsWith(`mcp_${serverName}_`));
    return `MCP server "${serverName}" (${tools.length} tools loaded)`;
  }
}
