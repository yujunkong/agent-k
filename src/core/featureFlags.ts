/**
 * Feature flags — Settings Hub `agent-k.features.*` → runtime gates.
 * Missing keys follow ConfigManager defaults (most on; inline-completion off).
 */
import { configManager } from './ConfigManager';

export const FEATURE_IDS = [
  'browser',
  'design-mode',
  'worktree',
  'agent-review',
  'mcp',
  'skills',
  'sub-agents',
  'memories',
  'inline-completion',
  'github',
  'codebase-index',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

const DEFAULT_OFF: ReadonlySet<FeatureId> = new Set(['inline-completion']);

export function featureConfigKey(id: FeatureId): string {
  return `agent-k.features.${id}`;
}

/** Whether a Settings Hub feature toggle is enabled. */
export function isFeatureEnabled(id: FeatureId): boolean {
  const raw = configManager.get(featureConfigKey(id));
  if (raw === undefined || raw === null) {
    return !DEFAULT_OFF.has(id);
  }
  return raw === true;
}

/**
 * Map a tool name to the feature that gates it, or null if always available.
 */
export function featureForTool(toolName: string): FeatureId | null {
  if (toolName.startsWith('browser_')) return 'browser';
  if (
    toolName.startsWith('mcp_') ||
    toolName === 'mcp_call_tool' ||
    toolName === 'mcp_list_tools' ||
    toolName === 'web_search'
  ) {
    return 'mcp';
  }
  if (toolName === 'skill_run') return 'skills';
  if (toolName === 'task' || toolName === 'task_run') return 'sub-agents';
  if (toolName === 'codebase_search') return 'codebase-index';
  return null;
}

/** Tool schema / dispatch gate — true when the tool's feature is on (or ungated). */
export function isToolFeatureEnabled(toolName: string): boolean {
  const feature = featureForTool(toolName);
  return feature == null || isFeatureEnabled(feature);
}

export function featureDisabledMessage(id: FeatureId): string {
  return (
    `Feature "${id}" is disabled in Settings → Features ` +
    `(agent-k.features.${id}). Enable it and save to use this.`
  );
}
