/**
 * PlanPhaseTransitions — explicit session-phase edge table.
 *
 * Merge note (see MERGE_NOTES.md): this file exists because a second
 * implementation of Plan V2 (reviewed alongside this one) made a strong
 * case for one thing this module was missing — an enforced, illegal-jump-
 * proof transition table at the *session* level. Adopted here almost
 * verbatim in spirit, adapted to this module's PlanPhase values.
 *
 * IMPORTANT scope boundary: this guard applies ONLY to PlanSession.phase
 * (idle/research/planning/review/executing/completed/failed) — i.e. the
 * parts of the lifecycle that really are sequential and gated by explicit
 * user/system actions (approve, reject, research complete, ...).
 *
 * It deliberately does NOT apply to PlanSession.taskStatus (see EvidenceEngine.ts
 * / PlanSession.applyTaskTransition). Task status is derived from observed
 * tool activity, which is not sequential by nature — an agent may
 * legitimately touch task 3's files while nominally working on task 1.
 * Enforcing an edge table there would reintroduce exactly the "runtime
 * state disagrees with what actually happened" bug this module exists to
 * fix. The other implementation's task engine enforces a single serial
 * "active" task and requires explicit start/finish calls; that's a
 * reasonable UX default for *suggesting* what to work on next (this module
 * already has that — see PlanSession.getNextSuggestedTask()) but the wrong
 * layer to hard-enforce, which is why it wasn't adopted for tasks.
 */
import type { PlanPhase } from './PlanSession';

/** Legal phase edges (from -> to[]). Same-phase self-loops are always
 *  allowed implicitly (see isLegalPhaseTransition). */
export const PLAN_PHASE_TRANSITIONS: Record<PlanPhase, readonly PlanPhase[]> = {
  idle: ['research'],
  research: ['planning', 'research'],
  planning: ['review', 'planning', 'research', 'failed'], // generation retry stays in planning; rejection loops back here; exhausted retries -> failed
  review: ['executing', 'planning'], // approve | reject
  executing: ['completed', 'failed', 'review'], // finish | crash | reopen for replan
  completed: ['planning', 'research'], // replan / start over
  failed: ['planning', 'review', 'research'] // retry / reopen / start over
};

export function isLegalPhaseTransition(from: PlanPhase, to: PlanPhase): boolean {
  if (from === to) return true;
  return (PLAN_PHASE_TRANSITIONS[from] || []).includes(to);
}

export class IllegalPhaseTransitionError extends Error {
  constructor(
    public readonly from: PlanPhase,
    public readonly to: PlanPhase
  ) {
    super(`Illegal PlanSession phase transition: ${from} -> ${to}`);
    this.name = 'IllegalPhaseTransitionError';
  }
}

export function assertLegalPhaseTransition(from: PlanPhase, to: PlanPhase): void {
  if (!isLegalPhaseTransition(from, to)) {
    throw new IllegalPhaseTransitionError(from, to);
  }
}
