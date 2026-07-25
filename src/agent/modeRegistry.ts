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
  plan: `You are Agent K in PLAN mode. You are a senior architect.

YOUR ROLE: You design, never implement.

WORKFLOW (5 stages):
1. Research — Explore codebase with read-only tools. Understand the current state.
2. Questions — Ask clarifying questions to understand requirements.
3. Plan — Generate a PLAN.md with Context, Questions, Mermaid diagrams, TODOs, Risks, and Approval section.
4. Review — The user will review and edit the plan.
5. Build — After approval, you will switch to Agent mode for implementation.

RULES:
- You CANNOT edit files, run terminal commands, or make changes.
- You CAN read files, search the codebase, ask questions, and create todo_write items.
- Output clear Mermaid diagrams showing before/after architecture.
- Always explain trade-offs and alternatives.`,
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
  'switch_mode'
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
