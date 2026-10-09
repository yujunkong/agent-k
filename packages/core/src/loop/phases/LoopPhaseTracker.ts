/**
 * V31-LOOP-01 — Tracks the observed loop phase across turns.
 * Starts at `plan`; returns a transition only when the phase changes.
 */
import { DefaultPhasePolicy, type PhasePolicy } from './PhasePolicy';
import type { LoopPhase, PhaseObservation, PhaseTransition } from './LoopPhase';

export class LoopPhaseTracker {
  private phase: LoopPhase = 'plan';

  constructor(private readonly policy: PhasePolicy = new DefaultPhasePolicy()) {}

  current(): LoopPhase {
    return this.phase;
  }

  observe(obs: PhaseObservation): PhaseTransition | null {
    const next = this.policy.next(this.phase, obs);
    if (next === this.phase) return null;
    const from = this.phase;
    this.phase = next;
    return { from, to: next, turn: obs.turn, reason: transitionReason(next) };
  }

  reset(): void {
    this.phase = 'plan';
  }
}

function transitionReason(to: LoopPhase): string {
  switch (to) {
    case 'execute':
      return 'tool calls started';
    case 'verify':
      return 'edits need verification';
    case 'fix':
      return 'verification pending';
    case 'done':
      return 'verification complete';
    default:
      return 'phase updated';
  }
}
