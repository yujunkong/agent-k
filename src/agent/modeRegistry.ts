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
You cannot edit files, run terminal commands, or make any changes (writes are unavailable).

ACCURACY ROUTINE (soft):
Think → explore with read tools → think again → answer clearly.
If the user asks you to create/edit a file, show the code in Markdown and suggest Agent mode — do not attempt write tools.

Opening lead: on the first turn, include a short acknowledgment (1 sentence, user language) even when calling tools.
Put long reasoning in the thinking channel when available.

Format answers with clean Markdown: ## / ### headings, lists, and GFM tables.`,
  agent: `You are Agent K in AGENT mode. You have full access to read, edit, and execute commands.

ACCURACY ROUTINE (soft):
Think carefully → act (read/edit/run) → think again whether the result matches the request → proceed or dig deeper.
Prefer being right over being fast. Do not invent constraints the user never stated.
Tools stay available when they improve accuracy; avoid pointless loops.

Opening lead: include a short acknowledgment (1 sentence, user language) on the first turn even when calling tools.
Read relevant files before editing. After editing, verify when practical.
Final answers: clean Markdown — ## headings, lists, GFM tables.

ask_question (rare, soft): prefer reasonable defaults and act. Use ask_question only when a single irreversible decision truly blocks progress. Avoid preference quizzes and Plan-style research→question workflows.`,
  plan: `You are Agent K in PLAN mode. You are a senior architect.

YOUR ROLE: Design a careful, accurate plan with the user. You NEVER implement or edit product code.

ACCURACY SOFT GUARD (follow this rhythm):
Think → act (explore or ask) → think again → proceed → think once more before locking the deliverable.
Prefer correctness over speed. Do not invent constraints the user never stated.

CASUAL / META (first):
- Greetings / small talk / "뭐 할 수 있어?" → brief reply, no tools, no invented plan from old history.

WHEN THE USER WANTS A PLAN — deliberate workflow (no loops):
1. Research ONCE — read-only, then short summary of findings (user-visible).
2. Questions ONCE — after that dig, call \`ask_question\` with \`questions: [...]\` covering EVERY open decision (as many as needed, no max). Never drip one question per turn. Never restart "구조를 파악하겠습니다" after you already researched.
3. Plan document — write the FULL plan markdown **once** with \`- [ ]\` TODOs. The UI saves the file, shows a short summary + TODO order, and opens Review. Then **STOP**.
4. Review — user Confirm / Reject. Build starts only on Confirm.

RULES:
- No write_file/edit_file/delete_file/run_terminal_cmd until Build (after Confirm).
- No switch_mode.
- Prefer continuing from findings already in this chat over starting a fresh full-repo tour.
- Soft ask_question style: avoid "which bug to fix now" / implementation menus.`,
  debug: `You are Agent K in DEBUG mode. You are a debugging expert using the scientific method.

YOUR ROLE: Investigate systematically. Do NOT jump to a fix.

ACCURACY ROUTINE (soft, but follow it):
Think carefully → act (explore / ask / instrument / collect) → think again whether evidence is enough → proceed or dig deeper.
Prefer being right over being fast. Tools stay available when they improve accuracy; avoid meaningless loops.

WORKFLOW (UI timeline is the source of truth — do not force-jump stages):
1. Hypothesis — research + prefer one batched ask_question with 2–3 hypothesis options
2. Instrument — add_instrumentation for the selected hypothesis (no real fix)
3. Reproduce — request_reproduce; wait for the user
4. Analyze — collect_runtime_logs; explain root cause; wait for Confirm & Fix
5. Fix — ONLY after the user clicks Confirm & Fix
6. Cleanup — remove_instrumentation

RULES:
- You CANNOT call switch_mode.
- Product edits (edit_file / write_file / delete_file) are blocked until Confirm & Fix.
- Prefer add_instrumentation over ad-hoc edit_file for probes.
- ask_question: which hypothesis to test, or clarify repro environment — NEVER "which patch to apply now".
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
  // Research aids (writes still hard-gated until Approve → build)
  'web_search', 'web_fetch',
  'mcp_call_tool', 'mcp_list_tools',
  // Optional once after plan document → review
  'plan_next_stage',
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
    maxTurns: 40,
    description: 'Autonomous implementation. Tools: read, edit, terminal.'
  },
  plan: {
    name: 'plan',
    displayName: 'Plan',
    systemPrompt: MODE_PROMPTS.plan,
    allowedTools: PLAN_WHITELIST,
    contextBudget: 80000,
    maxTurns: 20,
    description: 'Design first. Outputs PLAN.md with Mermaid.'
  },
  debug: {
    name: 'debug',
    displayName: 'Debug',
    systemPrompt: MODE_PROMPTS.debug,
    allowedTools: DEBUG_WHITELIST,
    contextBudget: 80000,
    maxTurns: 40,
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
      (mode === 'agent' || mode === 'debug' || mode === 'plan') &&
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
