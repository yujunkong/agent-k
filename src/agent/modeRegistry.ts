/**
 * ModeRegistry - 모드별 설정 레지스트리
 * 
 * ModeConfig 타입 정의(name, systemPrompt, allowedTools, contextBudget)
 * ASK_WHITELIST = [grep, glob, file_search, list_dir, read_file, codebase_search, lsp_definition, lsp_references, ask_question, todo_write]
 * getModeConfig(mode), isToolAllowed(mode, toolName) 메서드
 */
import type { Mode, ModeConfig } from './types';

const MODE_PROMPTS: Record<Mode, string> = {
  ask: `You are Agent K in ASK mode. You can only read files and search the codebase.
You CANNOT edit files, run terminal commands, or make any changes.
Provide clear, concise answers with relevant code references.
Always explain your reasoning before showing results.`,
  agent: `You are Agent K in AGENT mode. You have full access to read, edit, and execute commands.
Follow the user's instructions carefully. Verify your changes work correctly.
Read relevant files first to understand context before making edits.
After editing, verify the result compiles/runs correctly.`,
  plan: `You are Agent K in PLAN mode. Your task is to design first before implementing.
Output a PLAN.md with Mermaid diagrams showing the architecture.
Discuss trade-offs and get user approval before writing any code.
Focus on design quality and completeness.`,
  debug: `You are Agent K in DEBUG mode. Follow the scientific method:
1. Formulate a hypothesis about the bug
2. Instrument code to gather data
3. Reproduce the issue
4. Apply minimal fix
5. Verify the fix works
Be systematic and document each step.`
};

const ASK_WHITELIST = [
  'grep', 'glob', 'file_search', 'list_dir', 'read_file',
  'codebase_search', 'lsp_definition', 'lsp_references',
  'ask_question', 'todo_write'
];

const AGENT_WHITELIST = [
  ...ASK_WHITELIST,
  'edit_file', 'write_file', 'run_terminal_cmd',
  'checkpoint_create', 'checkpoint_restore',
  'terminal_output', 'process_list'
];

const PLAN_WHITELIST = [
  ...ASK_WHITELIST,
  'edit_file', 'write_file', 'todo_write',
  'checkpoint_create'
];

const DEBUG_WHITELIST = [
  ...ASK_WHITELIST,
  'run_terminal_cmd', 'terminal_output',
  'instrument_code', 'edit_file',
  'checkpoint_create', 'checkpoint_restore'
];

const MODE_CONFIGS: Record<Mode, ModeConfig> = {
  ask: {
    name: 'ask',
    displayName: 'Ask',
    systemPrompt: MODE_PROMPTS.ask,
    allowedTools: ASK_WHITELIST,
    contextBudget: 50000,
    maxTurns: 5,
    description: 'Read-only exploration. No file edits.'
  },
  agent: {
    name: 'agent',
    displayName: 'Agent',
    systemPrompt: MODE_PROMPTS.agent,
    allowedTools: AGENT_WHITELIST,
    contextBudget: 100000,
    maxTurns: 20,
    description: 'Autonomous implementation. Tools: read, edit, terminal.'
  },
  plan: {
    name: 'plan',
    displayName: 'Plan',
    systemPrompt: MODE_PROMPTS.plan,
    allowedTools: PLAN_WHITELIST,
    contextBudget: 80000,
    maxTurns: 10,
    description: 'Design first. Outputs PLAN.md with Mermaid.'
  },
  debug: {
    name: 'debug',
    displayName: 'Debug',
    systemPrompt: MODE_PROMPTS.debug,
    allowedTools: DEBUG_WHITELIST,
    contextBudget: 80000,
    maxTurns: 15,
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
    return MODE_CONFIGS[mode].allowedTools.includes(toolName);
  }

  getSystemPrompt(mode: Mode): string {
    return MODE_PROMPTS[mode];
  }

  updateSystemPrompt(mode: Mode, prompt: string) {
    (MODE_PROMPTS as any)[mode] = prompt;
  }
}

export const modeRegistry = new ModeRegistry();
