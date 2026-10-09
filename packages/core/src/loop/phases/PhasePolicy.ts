/**
 * V31-LOOP-01 — Deterministic phase policy.
 * Comment: `done` is terminal; pending verification always wins over `done`.
 */
import type { LoopPhase, PhaseObservation } from './LoopPhase';

export interface PhasePolicy {
  next(current: LoopPhase, obs: PhaseObservation): LoopPhase;
}

export class DefaultPhasePolicy implements PhasePolicy {
  next(current: LoopPhase, obs: PhaseObservation): LoopPhase {
    if (current === 'done') return 'done';

    if (obs.verifyPending) {
      switch (current) {
        case 'plan':
          return 'execute';
        case 'execute':
          return 'verify';
        case 'verify':
          return 'fix';
        case 'fix':
          return 'fix';
      }
    }

    if (obs.hasToolCalls) {
      switch (current) {
        case 'plan':
          return 'execute';
        case 'fix':
          return 'execute';
        case 'verify':
          return 'verify';
        case 'execute':
          return 'execute';
      }
    }

    if (obs.finalProse && obs.finalProse.trim()) return 'done';
    return current;
  }
}
