/**
 * HARNESS-002 — /goal-like exit checks before AgentLoop completes.
 * Blocks weak finals when unverified writes remain (gather→act→verify).
 */
import { isWeakFinalAnswer } from '../loop/classifiers';

export interface VerifyExitState {
  /** Paths written/edited since last clean lint. */
  pendingPaths: Set<string>;
  /** Paths that passed post-edit lint this run. */
  verifiedPaths: Set<string>;
}

export function createVerifyExitState(): VerifyExitState {
  return { pendingPaths: new Set(), verifiedPaths: new Set() };
}

export function markPathEdited(state: VerifyExitState, filePath: string): void {
  if (!filePath) return;
  state.pendingPaths.add(filePath);
  state.verifiedPaths.delete(filePath);
}

export function markPathVerified(state: VerifyExitState, filePath: string): void {
  if (!filePath) return;
  state.verifiedPaths.add(filePath);
  state.pendingPaths.delete(filePath);
}

export interface EvaluateVerifyExitInput {
  /** When false, never block exit. */
  verificationFirst: boolean;
  content: string;
  state: VerifyExitState;
  turn: number;
  maxTurns: number;
}

export interface EvaluateVerifyExitResult {
  block: boolean;
  nudge?: string;
  reason?: 'pending_lints' | 'weak_final';
}

/**
 * Goal-like gate: model wants to stop (no tool calls) but verification incomplete.
 */
export function evaluateVerifyExit(
  input: EvaluateVerifyExitInput,
): EvaluateVerifyExitResult {
  if (!input.verificationFirst) {
    return { block: false };
  }
  if (input.turn >= input.maxTurns) {
    return { block: false };
  }

  const pending = [...input.state.pendingPaths].filter(
    (p) => !input.state.verifiedPaths.has(p),
  );
  if (pending.length > 0) {
    const list = pending.slice(0, 6).join(', ');
    const more = pending.length > 6 ? ` (+${pending.length - 6} more)` : '';
    return {
      block: true,
      reason: 'pending_lints',
      nudge:
        `[Verify before finish] You edited ${list}${more} but verification is incomplete. ` +
        'Run `read_lints` on those paths, fix any issues, then summarize.',
    };
  }

  // All touched paths verified — allow structured exit.
  if (input.state.verifiedPaths.size > 0) {
    return { block: false };
  }

  if (
    input.state.pendingPaths.size === 0 &&
    input.state.verifiedPaths.size === 0
  ) {
    return { block: false };
  }

  const content = (input.content || '').trim();
  if (content && isWeakFinalAnswer(content)) {
    return {
      block: true,
      reason: 'weak_final',
      nudge:
        '[Verify before finish] Your answer looks incomplete for an edit task. ' +
        'Confirm lints/tests pass, then give a structured summary of what changed.',
    };
  }

  return { block: false };
}
