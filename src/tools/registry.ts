/**
 * ToolRegistry - 도구 등록/조회/필터링
 * 
 * registerTool(tool), getSchemas(mode, tier?) → mode + tier 허용 도구만 필터링
 * ToolDefinition: name, description, parameters(JSON Schema), modeAllowlist
 * 
 * HARB-T06: getSchemas에 tier 파라미터 추가 — Tier A면 AWhitelist 필터 적용
 */
import type { Mode, ToolDefinition } from '../agent/types';
import type { ModelTier } from '../harness/ModelTiers';
import { getToolNamesForTier } from '../harness/AWhitelist';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  registerTool(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * 모드 + 티어별 도구 스키마 반환 (이중 가드)
   * Ask 모드: 쓰기 도구 완전 차단
   * HARB-T06: tier 파라미터가 주어지면 해당 티어의 화이트리스트로 필터링
   */
  getSchemas(mode: Mode, tier?: ModelTier): Record<string, any>[] {
    // 티어별 허용 도구 이름 목록 (tier가 없으면 전체)
    const tierAllowedNames = tier
      ? new Set(getToolNamesForTier(tier))
      : null;

    return Array.from(this.tools.values())
      .filter(tool => {
        // Tier whitelist filter (HARB-T06)
        // Dynamic MCP tools (mcp_<server>_<tool>) are registered at runtime — allow them
        const isDynamicMcp =
          tool.name.startsWith('mcp_') &&
          tool.name !== 'mcp_list_tools' &&
          tool.name !== 'mcp_call_tool';
        if (tierAllowedNames && !tierAllowedNames.has(tool.name) && !isDynamicMcp) {
          return false;
        }
        // Mode allowlist check
        if (!tool.modeAllowlist.includes(mode)) return false;
        // C1-T18: Ask 모드 이중 가드 — 쓰기/터미널/디버그 도구 차단
        if (mode === 'ask' && (tool.category === 'edit' || tool.category === 'terminal' || tool.category === 'debug')) {
          return false;
        }
        return true;
      })
      .map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] {
    return this.getAllTools().filter(t => t.category === category);
  }

  getToolsForMode(mode: Mode, tier?: ModelTier): ToolDefinition[] {
    const tierAllowedNames = tier
      ? new Set(getToolNamesForTier(tier))
      : null;
    return this.getAllTools().filter(t => {
      const isDynamicMcp =
        t.name.startsWith('mcp_') &&
        t.name !== 'mcp_list_tools' &&
        t.name !== 'mcp_call_tool';
      if (tierAllowedNames && !tierAllowedNames.has(t.name) && !isDynamicMcp) return false;
      return t.modeAllowlist.includes(mode);
    });
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  clear(): void {
    this.tools.clear();
  }

  get count(): number {
    return this.tools.size;
  }
}

export const toolRegistry = new ToolRegistry();
