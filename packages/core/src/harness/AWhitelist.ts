/**
 * HARNESS-001 — Tier A tool whitelist (pure names; ToolRegistry filters schemas).
 */
import type { ModelTier } from './ModelTiers';

export const TIER_A_CORE: readonly string[] = [
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
] as const;

export const TIER_A_OPTIONAL: readonly string[] = [
  'lsp_definition',
  'lsp_references',
  'switch_mode',
  'fetch_rules',
] as const;

export interface TierToolFilterOptions {
  enableOptionalA?: boolean;
}

/** Allowed tool names for a tier (B = all registered tools — empty set means no extra filter). */
export function getToolNamesForTier(
  tier: ModelTier,
  opts: TierToolFilterOptions = {},
): Set<string> | null {
  if (tier === 'B') return null;
  if (tier === 'C') {
    return new Set([
      'grep',
      'glob',
      'list_dir',
      'read_file',
      'read_files',
      'codebase_search',
      'lsp_definition',
      'lsp_references',
    ]);
  }
  const names = [...TIER_A_CORE];
  if (opts.enableOptionalA) names.push(...TIER_A_OPTIONAL);
  return new Set(names);
}

/** Returns true when tool should remain visible for tier filter. */
export function isToolAllowedForTier(
  toolName: string,
  tier: ModelTier,
  opts: TierToolFilterOptions = {},
): boolean {
  const allowed = getToolNamesForTier(tier, opts);
  if (!allowed) return true;
  return allowed.has(toolName);
}
