/**
 * MODE-001…009 — Mode configs, sticky state, override, plan→agent handoff, ModeRegistry.
 */

import { isAgentMode, type AgentMode } from '@agent-k/shared';

export interface ModeConfig {
  name: AgentMode;
  displayName: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  /** true → write/terminal tools blocked. */
  readOnly: boolean;
  contextBudget: number;
  maxTurns: number;
}

/** MODE-001 Ask — read / search / question only. */
export const ASK_ALLOWED_TOOLS = [
  'grep',
  'glob',
  'file_search',
  'list_dir',
  'read_file',
  'codebase_search',
  'ask_question',
  'todo_write',
] as const;

/** MODE-002 Agent — full coding tool surface. */
export const AGENT_ALLOWED_TOOLS = [
  ...ASK_ALLOWED_TOOLS,
  'edit_file',
  'write_file',
  'run_terminal_cmd',
  'browser_navigate',
  'browser_snapshot',
  'task',
  'skill',
  'debug_add_instrumentation',
  'debug_remove_instrumentation',
  'debug_collect_logs',
] as const;

/** MODE-003 Plan — research / plan doc; no product writes until handoff. */
export const PLAN_ALLOWED_TOOLS = [...ASK_ALLOWED_TOOLS] as const;

/** MODE-004 Debug — scientific method + stage-gated write tools. */
export const DEBUG_ALLOWED_TOOLS = [
  ...ASK_ALLOWED_TOOLS,
  'run_terminal_cmd',
  'edit_file',
  'write_file',
  'debug_add_instrumentation',
  'debug_remove_instrumentation',
  'debug_collect_logs',
] as const;

const MODE_PROMPTS: Record<AgentMode, string> = {
  ask: `You are Agent-K in ASK mode. Read and search only — never edit files or run mutating shell commands. If the user wants changes, show Markdown and suggest Agent mode.`,
  agent: `You are Agent-K in AGENT mode. Read relevant files first, then edit/write/run tools as needed. Verify changes. Prefer tools over status prose.`,
  plan: `You are Agent-K in PLAN mode. Research read-only, ask clarifying questions when needed, then produce a full plan document. Do NOT implement product code until the user approves and handoff to Agent.`,
  debug: `You are Agent-K in DEBUG mode. Follow: hypothesis → instrument → reproduce → analyze → fix → cleanup. Do not jump to a fix before the user confirms the root cause.`,
};

export function createAskModeConfig(): ModeConfig {
  return {
    name: 'ask',
    displayName: 'Ask',
    description: 'Read-only exploration. No file edits.',
    systemPrompt: MODE_PROMPTS.ask,
    allowedTools: [...ASK_ALLOWED_TOOLS],
    readOnly: true,
    contextBudget: 50_000,
    maxTurns: 35,
  };
}

export function createAgentModeConfig(): ModeConfig {
  return {
    name: 'agent',
    displayName: 'Agent',
    description: 'Full coding agent loop.',
    systemPrompt: MODE_PROMPTS.agent,
    allowedTools: [...AGENT_ALLOWED_TOOLS],
    readOnly: false,
    contextBudget: 100_000,
    maxTurns: 50,
  };
}

export function createPlanModeConfig(): ModeConfig {
  return {
    name: 'plan',
    displayName: 'Plan',
    description: 'Research and plan before implementation.',
    systemPrompt: MODE_PROMPTS.plan,
    allowedTools: [...PLAN_ALLOWED_TOOLS],
    readOnly: true,
    contextBudget: 80_000,
    maxTurns: 40,
  };
}

export function createDebugModeConfig(): ModeConfig {
  return {
    name: 'debug',
    displayName: 'Debug',
    description: 'Hypothesis-driven debugging FSM.',
    systemPrompt: MODE_PROMPTS.debug,
    allowedTools: [...DEBUG_ALLOWED_TOOLS],
    readOnly: false,
    contextBudget: 100_000,
    maxTurns: 60,
  };
}

/** MODE-005 — Heuristic auto mode (no ML). */
export function classifyAutoMode(prompt: string): {
  mode: AgentMode;
  confidence: number;
  reason: string;
} {
  const t = (prompt || '').trim();
  if (!t) return { mode: 'agent', confidence: 0.3, reason: 'empty → default agent' };

  if (/\b(debug|bug|crash|stack\s*trace|repro|hypothesis|instrument)\b|디버그|버그|재현|가설/i.test(t)) {
    return { mode: 'debug', confidence: 0.75, reason: 'debug keywords' };
  }
  if (/\b(plan|architect|design|roadmap|trade-?off)\b|계획|설계|아키텍처|로드맵/i.test(t)) {
    return { mode: 'plan', confidence: 0.7, reason: 'plan keywords' };
  }
  if (
    /\b(what is|explain|where is|how does|read only|just look)\b|뭐야|설명해|어디|찾아줘|읽기만/i.test(t) &&
    !/\b(fix|implement|write|edit|create|add)\b|고쳐|구현|작성|수정|만들어/i.test(t)
  ) {
    return { mode: 'ask', confidence: 0.65, reason: 'question / read-only intent' };
  }
  return { mode: 'agent', confidence: 0.55, reason: 'default agent' };
}

/** MODE-006 — Sticky mode store across turns. */
export class StickyModeStore {
  private mode: AgentMode = 'agent';

  get(): AgentMode {
    return this.mode;
  }

  set(mode: AgentMode): void {
    if (!isAgentMode(mode)) return;
    this.mode = mode;
  }
}

/** MODE-007 — Plan V2 sticky stages keep Plan mode while researching/planning/reviewing. */
export type PlanV2StickyStage =
  | 'idle'
  | 'research'
  | 'planning'
  | 'review'
  | 'approved'
  | 'building';

export class PlanV2StickyState {
  private stage: PlanV2StickyStage = 'idle';

  getStage(): PlanV2StickyStage {
    return this.stage;
  }

  setStage(stage: PlanV2StickyStage): void {
    this.stage = stage;
  }

  shouldForcePlanMode(): boolean {
    return (
      this.stage === 'research' ||
      this.stage === 'planning' ||
      this.stage === 'review'
    );
  }

  reset(): void {
    this.stage = 'idle';
  }
}

/** MODE-008 — Explicit user mode skips auto classifier. */
export class ManualModeOverride {
  private override: AgentMode | null = null;

  set(mode: AgentMode | null): void {
    if (mode != null && !isAgentMode(mode)) return;
    this.override = mode;
  }

  get(): AgentMode | null {
    return this.override;
  }

  clear(): void {
    this.override = null;
  }

  /** Resolve effective mode: manual > plan sticky > sticky > auto. */
  resolve(
    prompt: string,
    sticky: StickyModeStore,
    planSticky: PlanV2StickyState
  ): AgentMode {
    if (this.override) return this.override;
    if (planSticky.shouldForcePlanMode()) return 'plan';
    return sticky.get() || classifyAutoMode(prompt).mode;
  }
}

/** MODE-009 — Plan → Agent handoff payload. */
export interface PlanToAgentHandoffInput {
  planMarkdown: string;
  researchContext?: string;
  answers?: Array<{ question: string; answer: string }>;
}

export interface PlanToAgentHandoffResult {
  mode: 'agent';
  systemPrompt: string;
  userMessage: string;
}

export function buildPlanToAgentHandoff(
  input: PlanToAgentHandoffInput
): PlanToAgentHandoffResult {
  const systemPrompt = [
    'You are Agent-K in AGENT mode with an approved implementation plan.',
    'Follow the plan steps in order. Read first, then edit/write in the same run.',
    'Do not end with "Proceeding to write…" — call write_file/edit_file instead.',
  ].join('\n');

  const answers = (input.answers ?? [])
    .map((a) => `- ${a.question}: ${a.answer}`)
    .join('\n');

  const userMessage = [
    '## Approved Implementation Plan',
    '',
    input.planMarkdown.trim(),
    '',
    input.researchContext?.trim()
      ? `## Research Context\n\n${input.researchContext.trim()}\n`
      : '',
    answers ? `## Clarifying Answers\n\n${answers}\n` : '',
    'Begin with Step 1.',
  ]
    .filter(Boolean)
    .join('\n');

  return { mode: 'agent', systemPrompt, userMessage };
}

/** Central mode registry tying MODE-001…005. */
export class ModeRegistry {
  private readonly configs: Record<AgentMode, ModeConfig>;

  constructor() {
    this.configs = {
      ask: createAskModeConfig(),
      agent: createAgentModeConfig(),
      plan: createPlanModeConfig(),
      debug: createDebugModeConfig(),
    };
  }

  getModeConfig(mode: AgentMode): ModeConfig {
    return this.configs[mode];
  }

  listModes(): ModeConfig[] {
    return Object.values(this.configs);
  }

  isToolAllowed(mode: AgentMode, toolName: string): boolean {
    if (toolName.startsWith('mcp_')) {
      return mode === 'agent' || mode === 'debug';
    }
    return this.configs[mode].allowedTools.includes(toolName);
  }
}

export const modeRegistry = new ModeRegistry();
