/**
 * V31-MODE-01 — UI mode registry (labels / tool allowlists / budgets only).
 * Comment: systemPrompt bodies live in @agent-k/core ModeRegistry (host SoT).
 * chat-ui must not import @agent-k/core — keep a stub prompt for local UI types.
 */
import type { Mode, ModeConfig } from './types';

/** Stub only — real prompts are injected by host from core. */
const PROMPT_OWNED_BY_CORE =
  '[V31-MODE-01] Prompt owned by @agent-k/core ModeRegistry — unused in host path.';

const ASK_WHITELIST = [
  'grep',
  'glob',
  'file_search',
  'list_dir',
  'read_file',
  'read_files',
  'read_lints',
  'codebase_search',
  'lsp_definition',
  'lsp_references',
  'ask_question',
  'todo_write',
];

const AGENT_WHITELIST = [
  ...ASK_WHITELIST,
  'edit_file',
  'write_file',
  'delete_file',
  'run_terminal_cmd',
  'terminal_output',
  'process_list',
  'checkpoint_create',
  'checkpoint_restore',
  'switch_mode',
  'browser_navigate',
  'browser_click',
  'browser_screenshot',
  'browser_evaluate',
  'browser_console',
  'browser_network',
  'browser_scroll',
  'browser_wait',
  'task_run',
  'skill_run',
  'mcp_call_tool',
  'mcp_list_tools',
  'web_search',
  'web_fetch',
];

const PLAN_WHITELIST = [...ASK_WHITELIST];

const DEBUG_WHITELIST = [
  ...ASK_WHITELIST,
  'run_terminal_cmd',
  'terminal_output',
  'edit_file',
  'write_file',
  'delete_file',
  'checkpoint_create',
  'checkpoint_restore',
  'add_instrumentation',
  'collect_runtime_logs',
  'request_reproduce',
  'remove_instrumentation',
  'browser_navigate',
  'browser_click',
  'browser_screenshot',
  'browser_evaluate',
  'browser_console',
  'browser_network',
  'browser_scroll',
  'browser_wait',
  'task_run',
  'skill_run',
  'mcp_call_tool',
  'mcp_list_tools',
  'web_search',
  'web_fetch',
];

const MODE_CONFIGS: Record<Mode, ModeConfig> = {
  ask: {
    name: 'ask',
    displayName: 'Ask',
    systemPrompt: PROMPT_OWNED_BY_CORE,
    allowedTools: ASK_WHITELIST,
    contextBudget: 50000,
    maxTurns: 35,
    description: 'Read-only exploration. No file edits.',
  },
  agent: {
    name: 'agent',
    displayName: 'Agent',
    systemPrompt: PROMPT_OWNED_BY_CORE,
    allowedTools: AGENT_WHITELIST,
    contextBudget: 100000,
    maxTurns: 35,
    description: 'Autonomous implementation. Tools: read, edit, terminal.',
  },
  plan: {
    name: 'plan',
    displayName: 'Plan',
    systemPrompt: PROMPT_OWNED_BY_CORE,
    allowedTools: PLAN_WHITELIST,
    contextBudget: 200000,
    maxTurns: 35,
    description: 'Design first. Outputs PLAN.md with Mermaid.',
  },
  debug: {
    name: 'debug',
    displayName: 'Debug',
    systemPrompt: PROMPT_OWNED_BY_CORE,
    allowedTools: DEBUG_WHITELIST,
    contextBudget: 80000,
    maxTurns: 35,
    description: 'Hypothesis → Instrument → Reproduce → Minimal fix.',
  },
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

  getSystemPrompt(mode: Mode): string {
    return MODE_CONFIGS[mode].systemPrompt;
  }

  updateSystemPrompt(_mode: Mode, _prompt: string) {
    // Comment: V31-MODE-01 — no-op; host prompts come from core.
  }
}

export const modeRegistry = new ModeRegistry();
