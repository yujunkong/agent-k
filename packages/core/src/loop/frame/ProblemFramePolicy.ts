/**
 * V31-FRAME-01 — write gate. Not an FSM.
 * task may edit only after doneWhen + one read observation.
 * ambiguous allows ask_question only. question never opens the edit gate.
 */
import type { IntentKind, ProblemFrame } from '@agent-k/shared';

const WRITE_TOOLS = new Set(['edit_file', 'write_file', 'delete_file']);
const EXPLORE_TOOLS = new Set([
  'grep',
  'codebase_search',
  'glob',
  'web_search',
]);
const OBSERVE_TOOLS = new Set(['read_file', 'read_files']);

export function isFrameWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

export function isFrameObserveTool(name: string): boolean {
  return OBSERVE_TOOLS.has(name);
}

export class DefaultProblemFramePolicy {
  allowWrite(frame: ProblemFrame | null, intentKind: IntentKind): boolean {
    if (intentKind !== 'task') return false;
    if (!frame || frame.intent.ambiguous) return false;
    if (!frame.doneWhen.trim() || !frame.observationDone) return false;
    if (frame.hypotheses.length < 1) return false;
    return true;
  }
}

/**
 * Tool-result text when the call must not run. null means allow.
 * Denial does not stop the run.
 */
export function explainFrameDenial(
  frame: ProblemFrame | null,
  intentKind: IntentKind,
  toolName: string,
): string | null {
  if (intentKind === 'conversation') return null;
  const policy = new DefaultProblemFramePolicy();
  if (frame?.intent.ambiguous && toolName !== 'ask_question') {
    return 'Frame is ambiguous. Call ask_question once, then stop. Do not edit or explore.';
  }
  if (intentKind === 'question' && isFrameWriteTool(toolName)) {
    return 'Question turns stay read-only. Do not edit.';
  }
  if (
    intentKind === 'task' &&
    isFrameWriteTool(toolName) &&
    !policy.allowWrite(frame, intentKind)
  ) {
    if (!frame?.doneWhen.trim()) {
      return 'Emit <problem_frame> with doneWhen before edit_file, write_file, or delete_file.';
    }
    if (!frame.observationDone) {
      return 'Read the relevant file once before editing. observation is not done.';
    }
    return 'Problem frame is incomplete. Do not edit yet.';
  }
  if (
    intentKind === 'task' &&
    !frame?.intent.ambiguous &&
    EXPLORE_TOOLS.has(toolName) &&
    (frame?.hypotheses.length ?? 0) === 0
  ) {
    return 'State a discriminating hypothesis before a wide search.';
  }
  return null;
}
