/**
 * Shared pure step predicates extracted from MessageSteps (V31-UI-05).
 *
 * NOTE: curiosityPhases.ts has its own inferTurn with a subagent guard —
 * do not swap it to this one (behavior differs for tl_subagent_* ids).
 */

export interface StepLike {
  id: string;
  kind?: string;
  turn?: number;
}

export function isMeta(kind: string): boolean {
  return kind === 'thinking' || kind === 'planning' || kind === 'done' || kind === 'session';
}

export function inferTurn(step: StepLike): number {
  if (typeof step.turn === 'number' && step.turn > 0) return step.turn;
  const m = step.id.match(/(?:thinking|planning|tool|step)[^\d]*(\d+)/i);
  return m ? Number(m[1]) : 1;
}
