/**
 * ModeRegistry - 모드별 설정 레지스트리
 * 
 * ModeConfig 타입 정의(name, systemPrompt, allowedTools, contextBudget)
 * ASK_WHITELIST = [grep, glob, file_search, list_dir, read_file, codebase_search, lsp_definition, lsp_references, ask_question, todo_write]
 * getModeConfig(mode), isToolAllowed(mode, toolName) 메서드
 */
import type { Mode, ModeConfig } from './types';

/**
 * UI-side mode registry — tool gating / budgets / labels only.
 * Full mode system prompts are owned by @agent-k/core (host injects them);
 * this webview copy must NOT duplicate prompt text (V31-MODE-01).
 */
const MODE_PROMPTS: Record<Mode, string> = {
  ask: 'You are Agent-K in ASK mode.',
  agent: 'You are Agent-K in AGENT mode.',
  plan: 'You are Agent-K in PLAN mode.',
  debug: 'You are Agent-K in DEBUG mode.',
};

const ASK_WHITELIST = [
  'grep', 'glob', 'file_search', 'list_dir', 'read_file', 'read_files', 'read_lints',
  'codebase_search', 'lsp_definition', 'lsp_references',
  'ask_question', 'todo_write'
];

const AGENT_WHITELIST = [
  ...ASK_WHITELIST,
  // C2: 편집/터미널
  'edit_file', 'write_file', 'delete_file', 'run_terminal_cmd',
  'terminal_output', 'process_list',
  // C3: checkpoint
  'checkpoint_create', 'checkpoint_restore',
  // C5: 모드 전환
  'switch_mode',
  // C7: browser
  'browser_navigate', 'browser_click', 'browser_screenshot',
  'browser_evaluate', 'browser_console', 'browser_network',
  'browser_scroll', 'browser_wait',
  // C7: orchestration
  'task_run', 'skill_run',
  // C7: MCP + web (SearXNG alias; dynamic mcp_<server>_<tool> via isToolAllowed)
  'mcp_call_tool', 'mcp_list_tools',
  'web_search', 'web_fetch',
];

const PLAN_WHITELIST = [
  ...ASK_WHITELIST,
  // switch_mode intentionally omitted — Build starts only via UI Approve & Execute
];

const DEBUG_WHITELIST = [
  ...ASK_WHITELIST,
  'run_terminal_cmd', 'terminal_output',
  'edit_file', 'write_file', 'delete_file',
  // C3: checkpoint
  'checkpoint_create', 'checkpoint_restore',
  // C6: debug instrumentation
  'add_instrumentation', 'collect_runtime_logs',
  'request_reproduce', 'remove_instrumentation',
  // switch_mode intentionally omitted — stay in Debug FSM
  // C7: browser (읽기/검증 용도)
  'browser_navigate', 'browser_click', 'browser_screenshot',
  'browser_evaluate', 'browser_console', 'browser_network',
  'browser_scroll', 'browser_wait',
  // C7: orchestration
  'task_run', 'skill_run',
  // C7: MCP + web
  'mcp_call_tool', 'mcp_list_tools',
  'web_search', 'web_fetch',
];

const MODE_CONFIGS: Record<Mode, ModeConfig> = {
  ask: {
    name: 'ask',
    displayName: 'Ask',
    systemPrompt: MODE_PROMPTS.ask,
    allowedTools: ASK_WHITELIST,
    contextBudget: 50000,
    // Small/local models need many read turns before answering
    maxTurns: 35,
    description: 'Read-only exploration. No file edits.'
  },
  agent: {
    name: 'agent',
    displayName: 'Agent',
    systemPrompt: MODE_PROMPTS.agent,
    allowedTools: AGENT_WHITELIST,
    contextBudget: 100000,
    maxTurns: 35,
    description: 'Autonomous implementation. Tools: read, edit, terminal.'
  },
  plan: {
    name: 'plan',
    displayName: 'Plan',
    systemPrompt: MODE_PROMPTS.plan,
    allowedTools: PLAN_WHITELIST,
    contextBudget: 200000,
    maxTurns: 35,
    description: 'Design first. Outputs PLAN.md with Mermaid.'
  },
  debug: {
    name: 'debug',
    displayName: 'Debug',
    systemPrompt: MODE_PROMPTS.debug,
    allowedTools: DEBUG_WHITELIST,
    contextBudget: 80000,
    maxTurns: 35,
    description: 'Hypothesis → Instrument → Reproduce → Minimal fix.'
  }
};

export class ModeRegistry {
  getModeConfig(mode: Mode): ModeConfig {
    return { ...MODE_CONFIGS[mode] };
  }

  getAllModes(): Mode[] {
    return ['ask', 'agent', 'plan', 'debug'];
  }

  isToolAllowed(mode: Mode, toolName: string): boolean {
    if (MODE_CONFIGS[mode].allowedTools.includes(toolName)) return true;
    // Runtime MCP tools: mcp_<server>_<tool> (registered on connect)
    if (
      (mode === 'agent' || mode === 'debug') &&
      toolName.startsWith('mcp_') &&
      toolName !== 'mcp_call_tool' &&
      toolName !== 'mcp_list_tools'
    ) {
      return true;
    }
    return false;
  }

  /**
   * Fallback only — the host/core owns the full mode system prompt (V31-MODE-01).
   * Kept for local/dev paths that need a non-empty prompt.
   */
  getSystemPrompt(mode: Mode): string {
    return MODE_PROMPTS[mode];
  }

  updateSystemPrompt(mode: Mode, prompt: string) {
    (MODE_PROMPTS as any)[mode] = prompt;
  }
}

export const modeRegistry = new ModeRegistry();
