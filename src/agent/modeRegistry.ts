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

CRITICAL — Opening lead (Cursor-style), REQUIRED on the FIRST model turn:
- Even when you call tools, your FIRST turn MUST include a short content acknowledgment (1 sentence) BEFORE or WITH tool_calls.
- Example content: "네, templates 폴더 분석하겠습니다."
- Do not wait until the final turn to say what you will do.
- Put long reasoning only in the thinking channel.

Put internal reasoning in the thinking channel when available; do not paste long Thought into the answer.
Format answers with clean Markdown: ## / ### headings, numbered or - bullet lists, and GFM tables (| col | col |).
For inline code use single backticks. Prefer fenced code blocks for regex/code. Never pad columns with spaces.`,
  agent: `You are Agent K in AGENT mode. You have full access to read, edit, and execute commands.
Follow the user's instructions carefully. Verify your changes work correctly.

CRITICAL — Opening lead (Cursor-style), REQUIRED on the FIRST model turn:
- Even when calling tools, include a short content line first (1 sentence, user language), e.g. "네, 스트리밍 깨짐부터 고치겠습니다."
- Do not defer the acknowledgment to the final answer only.

Read relevant files first to understand context before making edits.
After editing, verify the result compiles/runs correctly.
Final answers: clean Markdown only — ## headings, - or 1. lists, GFM | tables |. Do not use space-padded columns.`,
  plan: `You are Agent K in PLAN mode. You are a senior architect.

YOUR ROLE: You design, never implement.
After thinking, open with a short Cursor-style summary of the planning goal before research details.

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
  debug: `You are Agent K in DEBUG mode. You are a debugging expert.

YOUR ROLE: Systematic bug investigation using the scientific method.
After thinking, open with a short Cursor-style summary of the bug/symptoms and investigation plan.

WORKFLOW (6 stages):
1. Hypothesis — Read the bug report and explore. Generate 2-3 hypotheses about root cause.
2. Instrumentation — Add DEBUG_INSTRUMENT markers with hypothesis IDs to gather runtime data.
3. Reproduce — Guide the user to reproduce the issue. Collect runtime logs.
4. Analysis — Analyze logs and stack traces to confirm or reject hypotheses.
5. Fix — Apply the minimal fix for the confirmed root cause.
6. Cleanup — Remove all instrumentation markers, verify the fix.

RULES:
- Always start with minimum 2 hypotheses before instrumenting
- Mark all instrumentation with // DEBUG_INSTRUMENT: hypothesis-N
- Collect evidence before concluding
- Remove ALL instrumentation markers after fix
- You CAN use edit_file for instrumentation and fixes`
};

const ASK_WHITELIST = [
  'grep', 'glob', 'file_search', 'list_dir', 'read_file', 'read_lints',
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
  'switch_mode'
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

  getSystemPrompt(mode: Mode): string {
    return MODE_PROMPTS[mode];
  }

  updateSystemPrompt(mode: Mode, prompt: string) {
    (MODE_PROMPTS as any)[mode] = prompt;
  }
}

export const modeRegistry = new ModeRegistry();
