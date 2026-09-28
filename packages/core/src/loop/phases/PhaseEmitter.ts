/**
 * V31-LOOP-01 — Emits `phase` AgentLoopEvent on transitions only.
 * Type-only import of AgentLoopEvent avoids a runtime cycle with the controller.
 */
import type { AgentLoopEvent } from '../AgentLoopController';
import type { PhaseObservation } from './LoopPhase';
import type { LoopPhaseTracker } from './LoopPhaseTracker';

export class PhaseEmitter {
  constructor(
    private readonly tracker: LoopPhaseTracker,
    private readonly emit: (e: AgentLoopEvent) => void,
  ) {}

  observe(obs: PhaseObservation): void {
    const transition = this.tracker.observe(obs);
    if (!transition) return;
    this.emit({
      type: 'phase',
      phase: transition.to,
      turn: transition.turn,
      reason: transition.reason,
    });
  }
}
