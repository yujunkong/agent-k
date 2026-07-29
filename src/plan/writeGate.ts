/**
 * ADDON-T03: Plan/write gate (pure helpers — unit-test friendly)
 */
import type { Mode } from '../agent/types';
import type { PlanStage } from './PlanModeController';

export const WRITE_TOOL_NAMES = new Set([
  'edit_file',
  'write_file',
  'delete_file',
  'run_terminal_cmd',
]);

/** Read/search tools used during Plan research — blocked after first questions */
export const PLAN_EXPLORE_TOOL_NAMES = new Set([
  'read_file',
  'read_files',
  'list_dir',
  'grep',
  'glob',
  'file_search',
  'codebase_search',
  'lsp_definition',
  'lsp_references',
  'lsp_hover',
  'lsp_symbols',
]);

export function isWriteToolName(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name);
}

export function isPlanExploreToolName(name: string): boolean {
  return PLAN_EXPLORE_TOOL_NAMES.has(name);
}

/**
 * Plan mode: writes only after Approve → build stage.
 * Other modes: not blocked by this gate.
 */
export function planWriteGate(
  mode: Mode,
  planStage: PlanStage | undefined,
  toolName: string
): { allowed: boolean; error?: string } {
  if (mode !== 'plan' || !isWriteToolName(toolName)) {
    return { allowed: true };
  }
  const stage = planStage || 'research';
  if (stage === 'build') {
    return { allowed: true };
  }
  return {
    allowed: false,
    error:
      `[Plan Mode] Writing/terminal tools are blocked until the plan is approved (build stage). ` +
      `Tool "${toolName}" denied (current stage: ${stage}). Use Approve & Execute, then retry.`,
  };
}

/**
 * After the first clarifying-question round: no more explore / no more ask_question
 * while drafting the plan. Research may explore+ask once; planning only writes prose.
 */
export function planPostQuestionsGate(
  mode: Mode,
  planStage: PlanStage | undefined,
  toolName: string,
  opts?: { askedQuestionThisRun?: boolean }
): { allowed: boolean; error?: string } {
  if (mode !== 'plan') return { allowed: true };
  const stage = planStage || 'research';
  const asked = Boolean(opts?.askedQuestionThisRun);

  // Planning: write the plan document only — no tools except todo_write
  if (stage === 'planning') {
    if (toolName === 'todo_write') return { allowed: true };
    if (isPlanExploreToolName(toolName) || toolName === 'ask_question') {
      return {
        allowed: false,
        error:
          `[Plan Mode] After clarifying answers, exploration and ask_question are blocked. ` +
          `Write the complete plan markdown now (no "${toolName}").`,
      };
    }
  }

  // Questions stage: wait for Complete Questions — no re-explore / no second questionnaire
  if (stage === 'questions') {
    if (isPlanExploreToolName(toolName) || toolName === 'ask_question') {
      return {
        allowed: false,
        error:
          `[Plan Mode] Clarifying questions are already open. Do not explore or ask again ("${toolName}"). ` +
          `Wait for the user to Complete Questions, then write the plan.`,
      };
    }
  }

  // Same research run after the first ask_question: stop digging / re-asking
  if (stage === 'research' && asked) {
    if (isPlanExploreToolName(toolName) || toolName === 'ask_question') {
      return {
        allowed: false,
        error:
          `[Plan Mode] You already asked clarifying questions this turn. ` +
          `Do not call "${toolName}" again — wait for answers, then write the plan.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Agent soft-block: when forceOnComplex is on and heuristic says plan,
 * deny the first write with a plan suggestion (soft gate).
 */
export function agentComplexWriteGate(opts: {
  mode: Mode;
  forceOnComplex: boolean;
  shouldSuggestPlan: boolean;
  toolName: string;
  alreadyWarned: boolean;
}): { allowed: boolean; softBlock: boolean; error?: string } {
  if (opts.mode !== 'agent' || !opts.forceOnComplex) {
    return { allowed: true, softBlock: false };
  }
  if (!isWriteToolName(opts.toolName) || opts.toolName === 'run_terminal_cmd') {
    return { allowed: true, softBlock: false };
  }
  if (!opts.shouldSuggestPlan || opts.alreadyWarned) {
    return { allowed: true, softBlock: false };
  }
  return {
    allowed: false,
    softBlock: true,
    error:
      `[Agent] This looks like a multi-file / complex change. ` +
      `Switch to Plan mode and get approval before editing (agent-k.plan.forceOnComplex). ` +
      `Or disable the setting to write immediately.`,
  };
}
