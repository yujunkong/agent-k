/**
 * ToolRegistry - 도구 등록/조회/필터링
 *
 * registerTool(tool), getSchemas(mode, tier?) → mode + tier 허용 도구만 필터링
 * ToolDefinition: name, description, parameters(JSON Schema), modeAllowlist
 *
 * HARB-T06: getSchemas에 tier 파라미터 추가 — Tier A면 AWhitelist 필터 적용
 * Ask/Plan: 쓰기·터미널 도구는 스키마에서 제외 (Plan build만 예외)
 */
import type { Mode, ToolDefinition } from '../agent/types';
import type { ModelTier } from '../harness/ModelTiers';
import { getToolNamesForTier } from '../harness/AWhitelist';
import { modeRegistry } from '../agent/modeRegistry';
import { isWriteToolName } from '../plan/writeGate';
import { isToolFeatureEnabled } from '../core/featureFlags';

export type GetSchemasOptions = {
  /** Plan FSM stage — write tools only when `build` */
  planStage?: string;
};

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

  private isDynamicMcp(name: string): boolean {
    return (
      name.startsWith('mcp_') &&
      name !== 'mcp_list_tools' &&
      name !== 'mcp_call_tool'
    );
  }

  /** Whether this tool may appear in the model tool list for the mode */
  private isVisibleForMode(
    tool: ToolDefinition,
    mode: Mode,
    opts?: GetSchemasOptions
  ): boolean {
    const planStage = opts?.planStage || 'research';
    const planBuild = mode === 'plan' && planStage === 'build';
    const writeLike =
      tool.category === 'edit' ||
      tool.category === 'terminal' ||
      isWriteToolName(tool.name);

    // Ask: never expose write / terminal / debug
    if (mode === 'ask') {
      if (
        tool.category === 'edit' ||
        tool.category === 'terminal' ||
        tool.category === 'debug' ||
        isWriteToolName(tool.name)
      ) {
        return false;
      }
      return (
        tool.modeAllowlist.includes('ask') &&
        modeRegistry.isToolAllowed('ask', tool.name)
      );
    }

    // Plan research/questions/planning/review: read-only (+ ask_question / todo)
    if (mode === 'plan' && !planBuild) {
      if (writeLike || tool.category === 'debug') return false;
      return (
        tool.modeAllowlist.includes('plan') &&
        modeRegistry.isToolAllowed('plan', tool.name)
      );
    }

    // Plan build: whitelist + write/terminal tools for Approve & Execute
    if (planBuild) {
      if (modeRegistry.isToolAllowed('plan', tool.name)) return true;
      if (isWriteToolName(tool.name)) return true;
      if (tool.category === 'edit' || tool.category === 'terminal') {
        return tool.modeAllowlist.includes('agent') || tool.modeAllowlist.includes('debug');
      }
      return false;
    }

    // Agent / Debug / Plan (MCP read for research)
    if (!tool.modeAllowlist.includes(mode)) {
      if (
        this.isDynamicMcp(tool.name) &&
        (mode === 'agent' || mode === 'debug' || mode === 'plan')
      ) {
        return true;
      }
      return false;
    }
    if (!modeRegistry.isToolAllowed(mode, tool.name) && !this.isDynamicMcp(tool.name)) {
      return false;
    }
    return true;
  }

  /**
   * 모드 + 티어별 도구 스키마 반환 (이중 가드)
   * Ask / Plan(비-build): 쓰기 도구 완전 차단 — 모델이 호출해 에러 내는 일 방지
   * HARB-T06: tier 파라미터가 주어지면 해당 티어의 화이트리스트로 필터링
   */
  getSchemas(
    mode: Mode,
    tier?: ModelTier,
    opts?: GetSchemasOptions
  ): Record<string, any>[] {
    const tierAllowedNames = tier
      ? new Set(getToolNamesForTier(tier))
      : null;

    return Array.from(this.tools.values())
      .filter((tool) => {
        if (!isToolFeatureEnabled(tool.name)) return false;
        if (
          tierAllowedNames &&
          !tierAllowedNames.has(tool.name) &&
          !this.isDynamicMcp(tool.name)
        ) {
          return false;
        }
        return this.isVisibleForMode(tool, mode, opts);
      })
      .map((tool) => ({
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
    return this.getAllTools().filter((t) => t.category === category);
  }

  getToolsForMode(mode: Mode, tier?: ModelTier, opts?: GetSchemasOptions): ToolDefinition[] {
    const tierAllowedNames = tier
      ? new Set(getToolNamesForTier(tier))
      : null;
    return this.getAllTools().filter((t) => {
      if (!isToolFeatureEnabled(t.name)) return false;
      if (
        tierAllowedNames &&
        !tierAllowedNames.has(t.name) &&
        !this.isDynamicMcp(t.name)
      ) {
        return false;
      }
      return this.isVisibleForMode(t, mode, opts);
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
