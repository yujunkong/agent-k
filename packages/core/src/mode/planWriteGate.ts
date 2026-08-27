/**
 * PLAN-009 — Plan mode write/terminal gate (host + tools defense-in-depth).
 */
import type { AgentMode, PlanStage } from '@agent-k/shared';

const WRITE_TOOL_NAMES = new Set([
  'edit_file',
  'write_file',
  'delete_file',
  'run_terminal_cmd',
  'todo_write',
]);

export function isWriteLikeToolName(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name);
}

/**
 * Plan mode: writes only after Approve → build stage.
 * Other modes: not blocked by this gate.
 */
export function planWriteGate(
  mode: AgentMode,
  planStage: PlanStage | undefined,
  toolName: string,
): { allowed: boolean; error?: string } {
  if (mode !== 'plan' || !isWriteLikeToolName(toolName)) {
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
