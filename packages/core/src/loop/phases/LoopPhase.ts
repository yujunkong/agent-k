/**
 * V31-LOOP-01 — Loop phase observation types.
 * Observation + prompt/gate enforcement only; no FSM, loop control flow unchanged.
 */

export type LoopPhase = 'plan' | 'execute' | 'verify' | 'fix' | 'done';

export interface PhaseTransition {
  from: LoopPhase;
  to: LoopPhase;
  turn: number;
  reason: string;
}

export interface PhaseObservation {
  turn: number;
  hasToolCalls: boolean;
  toolNames: string[];
  toolOk: boolean;
  editedPaths: string[];
  verifyPending: boolean;
  finalProse?: string;
}
