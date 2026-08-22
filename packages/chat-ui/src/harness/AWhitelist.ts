/**
 * HARB-T06: A-Tier Tool Whitelist
 *
 * Tier A (Flash/중급 모델)에 최소 필요 도구만 노출해 토큰 절약·실수 방지·집중도 향상.
 * "스키마를 좁게(슬로건 4)" 원칙의 구현체.
 *
 * 코어 8 + ask/todo + codebase_search = 11 schemas (기본).
 * C4+ 옵션: lsp_*, switch_mode, fetch_rules.
 *
 * PRD: PRD-Harness-06_A_Tier_Whitelist.md
 */

import type { ModelTier } from './ModelTiers';
import { toolRegistry } from '../tools/registry';
import type { ToolDefinition } from '../agent/types';

// ─── Tier A Core (항상 노출) ───────────────────────────────────

/**
 * Tier A 코어 도구 — Cursor-like explore (search → windowed read).
 */
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

// ─── Tier A Optional (C4+ 플래그 on) ───────────────────────────

/**
 * Tier A 선택 확장 도구 — C4+ 옵션 플래그가 on일 때만 노출.
 */
export const TIER_A_OPTIONAL: readonly string[] = [
  'lsp_definition',
  'lsp_references',
  'switch_mode',
  'fetch_rules',
] as const;

// ─── Tier A Deny List (명시적 차단) ────────────────────────────

/**
 * Tier A에서 명시적으로 차단되는 도구.
 */
export const TIER_A_DENIED: readonly string[] = [
  'delete_file',
  'browser_navigate',
  'browser_click',
  'browser_screenshot',
  'browser_evaluate',
  'browser_console',
  'browser_network',
  'browser_scroll',
  'browser_wait',
  'web_search',
  'web_fetch',
  'mcp_list_tools',
  'mcp_call_tool',
  'task',
  'task_run',
  'skill_run',
] as const;

// ─── Whitelist Functions ───────────────────────────────────────

export interface GetSchemasForTierOptions {
  /** C4+ 옵션 도구 활성화 여부 (기본: false) */
  enableOptionalA?: boolean;
}

/**
 * 티어에 해당하는 도구 이름 목록을 반환한다.
 * Tier A: 코어 10개 + (옵션) 선택 확장
 * Tier B: 전체 도구
 * Tier C: 읽기 전용 도구
 */
export function getToolNamesForTier(
  tier: ModelTier,
  opts: GetSchemasForTierOptions = {},
): string[] {
  if (tier === 'A') {
    const names = [...TIER_A_CORE];
    if (opts.enableOptionalA) {
      names.push(...TIER_A_OPTIONAL);
    }
    return names;
  }

  if (tier === 'C') {
    return [
      'grep', 'glob', 'list_dir', 'read_file', 'read_files',
      'codebase_search', 'lsp_definition', 'lsp_references',
    ];
  }

  // Tier B: 전체 도구
  return [
    'grep', 'glob', 'list_dir', 'read_file', 'read_files', 'codebase_search',
    'lsp_definition', 'lsp_references', 'lsp_diagnostics',
    'edit_file', 'write_file', 'delete_file',
    'run_terminal_cmd', 'read_lints',
    'ask_question', 'todo_write',
    'switch_mode', 'fetch_rules',
    'browser_navigate', 'browser_click', 'browser_screenshot',
    'browser_evaluate', 'browser_console', 'browser_network',
    'browser_scroll', 'browser_wait',
    'web_search', 'web_fetch',
    'mcp_list_tools', 'mcp_call_tool',
    'task', 'task_run', 'skill_run',
    'checkpoint_create', 'checkpoint_restore',
    'add_instrumentation', 'remove_instrumentation',
    'collect_runtime_logs', 'request_reproduce',
  ];
}

/**
 * 티어에 해당하는 도구 스키마 목록을 반환한다.
 * toolRegistry에서 등록된 도구만 필터링하여 반환한다.
 */
export function getSchemasForTier(
  tier: ModelTier,
  opts: GetSchemasForTierOptions = {},
): Record<string, any>[] {
  const allowedNames = new Set(getToolNamesForTier(tier, opts));

  // toolRegistry에서 등록된 모든 도구를 가져와서 티어별로 필터링
  const allTools = toolRegistry.getAllTools();
  const filtered = allTools.filter((tool) => allowedNames.has(tool.name));

  return filtered.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * 주어진 도구 이름이 Tier A에서 허용되는지 확인한다.
 */
export function isAllowedInTierA(
  toolName: string,
  opts: GetSchemasForTierOptions = {},
): boolean {
  const allowed = new Set(getToolNamesForTier('A', opts));
  return allowed.has(toolName);
}

/**
 * 주어진 도구 이름이 Tier A에서 명시적으로 차단되는지 확인한다.
 */
export function isDeniedInTierA(toolName: string): boolean {
  return (TIER_A_DENIED as readonly string[]).includes(toolName);
}
