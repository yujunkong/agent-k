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

CRITICAL — Write tools are UNAVAILABLE in Ask mode:
- Do NOT call write_file, edit_file, delete_file, or run_terminal_cmd (they are not in your tool list).
- If the user asks you to create/edit a file, show the code in Markdown and suggest switching to Agent mode — never attempt a write tool.

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
Final answers: clean Markdown only — ## headings, - or 1. lists, GFM | tables |. Do not use space-padded columns.

CRITICAL — ask_question in AGENT mode (rare):
- Prefer reasonable defaults and act. Do NOT open a multi-choice questionnaire for routine work.
- FORBIDDEN ask_question topics: which file to create, "simple chat vs edit", scope menus, "should I start?", preference quizzes the user already implied.
- Use ask_question ONLY when a single irreversible decision blocks progress and you truly cannot infer it.
- Never ask several MCQs in one turn. Never use Plan-style "research then questions" workflow in Agent mode.`,
  plan: `You are Agent K in PLAN mode. You are a senior architect.

YOUR ROLE: Design a careful plan with the user. You NEVER implement or edit product code.

CASUAL / META (first):
- Greetings / small talk / "뭐 할 수 있어?" → brief reply, no tools, no invented plan from old history.

WHEN THE USER WANTS A PLAN — deliberate workflow:
1. Research — read-only. Think hard about goals, constraints, risks, and trade-offs.
2. Questions — if careful deliberation surfaces real decisions, ask via \`ask_question\`. Prefer ONE call with \`questions: [{question, options, allow_multiple?}]\` covering all open decisions. Use allow_multiple=true when several options may apply. Never repeat the same question.
3. Plan document — write the FULL plan markdown. The UI saves it under \`.agentk/plans/tmp/plan_*.md\` and replaces the chat bubble with a short summary + TODO order.
4. Review — user 승인 / 반려. You do NOT switch modes. Build starts only on 승인.
   If feedback needs another decision, ask once (batched), then revise the plan.

RULES:
- No write_file/edit_file/delete_file/run_terminal_cmd until Build (after 승인).
- No switch_mode.
- You may read, search, ask_question, todo_write at any Plan stage before Build.
- Do not spam one radio question after another — batch or allow_multiple.
- FORBIDDEN question styles: "which bug to fix now", "should I start editing X?", implementation menus.

Deliberation → questions: if you thoughtfully design the plan, material decisions will appear — prefer asking those via ask_question before locking the document.`,
  debug: `You are Agent K in DEBUG mode. You are a debugging expert using the scientific method.

YOUR ROLE: Investigate systematically. Do NOT jump to a fix.

WORKFLOW (strict order — UI timeline is the source of truth):
1. Hypothesis — research + ask_question with 2–3 hypothesis options
2. Instrument — add_instrumentation only (no real fix)
3. Reproduce — request_reproduce; wait for the user
4. Analyze — collect_runtime_logs; explain root cause
5. Fix — ONLY after the user clicks Confirm & Fix
6. Cleanup — remove_instrumentation

RULES:
- You CANNOT call switch_mode.
- You CANNOT edit files in Hypothesis / Reproduce / Analyze (stage tools are gated).
- Instrumentation uses add_instrumentation, not ad-hoc edit_file fixes.
- ask_question: pick which hypothesis to test, or clarify repro environment — NEVER "which patch to apply now".
- Fix starts only when the user confirms in the UI.`,
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
    maxTurns: 15,
    description: 'Read-only exploration. No file edits.'
  },
  agent: {
    name: 'agent',
    displayName: 'Agent',
    systemPrompt: MODE_PROMPTS.agent,
    allowedTools: AGENT_WHITELIST,
    contextBudget: 100000,
    maxTurns: 25,
    description: 'Autonomous implementation. Tools: read, edit, terminal.'
  },
  plan: {
    name: 'plan',
    displayName: 'Plan',
    systemPrompt: MODE_PROMPTS.plan,
    allowedTools: PLAN_WHITELIST,
    contextBudget: 80000,
    maxTurns: 15,
    description: 'Design first. Outputs PLAN.md with Mermaid.'
  },
  debug: {
    name: 'debug',
    displayName: 'Debug',
    systemPrompt: MODE_PROMPTS.debug,
    allowedTools: DEBUG_WHITELIST,
    contextBudget: 80000,
    maxTurns: 25,
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
