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

export function isWriteToolName(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name);
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
 * Agent soft hint: when forceOnComplex is on and heuristic says plan,
 * return a warning once — never deny the write (soft guidance only).
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
    allowed: true,
    softBlock: true,
    error:
      `[Agent] Soft tip: this looks like a multi-file / complex change. ` +
      `Consider Plan mode for a reviewed design (agent-k.plan.forceOnComplex). ` +
      `Proceeding with the edit — not blocked.`,
  };
}
