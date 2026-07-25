/**
 * ToolRegistry - 도구 등록/조회/필터링
 * 
 * registerTool(tool), getSchemas(mode) → mode 허용 도구만 필터링
 * ToolDefinition: name, description, parameters(JSON Schema), modeAllowlist
 */
import type { Mode, ToolDefinition } from '../agent/types';

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
   * 모드별 도구 스키마 반환 (이중 가드)
   * Ask 모드: 쓰기 도구 완전 차단
   */
  getSchemas(mode: Mode): Record<string, any>[] {
    return Array.from(this.tools.values())
      .filter(tool => {
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

  getToolsForMode(mode: Mode): ToolDefinition[] {
    return this.getAllTools().filter(t => t.modeAllowlist.includes(mode));
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
