/**
 * TOOL-016 ToolRegistry — register / get / list / getSchemas (mode-filtered).
 */

import type { AgentMode } from '@agent-k/shared';
import type {
  GetSchemasOptions,
  ToolDefinition,
  ToolSchemaForModel,
} from './types';

const WRITE_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'delete_file',
  'todo_write',
]);

/** HARNESS-001 — tier A/C allowlists (B = all tools). */
const TIER_A_TOOLS = new Set([
  'grep',
  'glob',
  'list_dir',
  'read_file',
  'read_files',
  'codebase_search',
  'edit_file',
  'write_file',
  'run_terminal_cmd',
  'read_lints',
  'ask_question',
  'todo_write',
  'lsp_definition',
  'lsp_references',
]);

const TIER_C_TOOLS = new Set([
  'grep',
  'glob',
  'list_dir',
  'read_file',
  'read_files',
  'codebase_search',
  'lsp_definition',
  'lsp_references',
]);

function isAllowedForHarnessTier(
  toolName: string,
  tier: 'A' | 'B' | 'C',
): boolean {
  if (tier === 'B') return true;
  if (tier === 'C') return TIER_C_TOOLS.has(toolName);
  return TIER_A_TOOLS.has(toolName);
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /** Register or overwrite a tool by name. */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /** Lookup a single tool. */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** List all registered tools (unfiltered). */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * OpenAI-style function schemas filtered by agent mode.
   * Ask / plan(non-build): hide write + terminal + debug tools.
   */
  getSchemas(mode: AgentMode, opts?: GetSchemasOptions): ToolSchemaForModel[] {
    return this.list()
      .filter((tool) => this.isVisibleForMode(tool, mode, opts))
      .map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
  }

  /** Tools visible for a mode (same filter as getSchemas). */
  listForMode(mode: AgentMode, opts?: GetSchemasOptions): ToolDefinition[] {
    return this.list().filter((tool) => this.isVisibleForMode(tool, mode, opts));
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

  private isVisibleForMode(
    tool: ToolDefinition,
    mode: AgentMode,
    opts?: GetSchemasOptions
  ): boolean {
    if (
      opts?.harnessEnabled !== false &&
      opts?.modelTier &&
      !isAllowedForHarnessTier(tool.name, opts.modelTier)
    ) {
      return false;
    }

    const planStage = opts?.planStage || 'research';
    const planBuild = mode === 'plan' && planStage === 'build';
    const writeLike =
      tool.category === 'edit' ||
      tool.category === 'terminal' ||
      WRITE_TOOL_NAMES.has(tool.name);

    if (mode === 'ask') {
      if (
        tool.category === 'edit' ||
        tool.category === 'terminal' ||
        tool.category === 'debug' ||
        WRITE_TOOL_NAMES.has(tool.name)
      ) {
        return false;
      }
      return tool.modeAllowlist.includes('ask');
    }

    if (mode === 'plan' && !planBuild) {
      if (writeLike || tool.category === 'debug') return false;
      return tool.modeAllowlist.includes('plan');
    }

    if (planBuild) {
      if (tool.modeAllowlist.includes('plan') || tool.modeAllowlist.includes('agent')) {
        return true;
      }
      return writeLike;
    }

    // agent / debug
    return tool.modeAllowlist.includes(mode);
  }
}

/** Shared singleton for extension wiring (tests may use fresh instances). */
export const toolRegistry = new ToolRegistry();
