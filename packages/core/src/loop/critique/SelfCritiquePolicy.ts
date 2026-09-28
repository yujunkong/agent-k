/**
 * V31-LOOP-02 — Self-critique trigger policy (inline, max 2 passes).
 */

export interface CritiqueTrigger {
  editedPaths: string[];
  turn: number;
  lastToolOk: boolean;
  passes: number;
}

export interface SelfCritiquePolicy {
  shouldCritique(input: CritiqueTrigger): boolean;
  readonly maxPasses: number;
}

export class DefaultSelfCritiquePolicy implements SelfCritiquePolicy {
  readonly maxPasses = 2;

  shouldCritique(input: CritiqueTrigger): boolean {
    return (
      input.editedPaths.length > 0 &&
      input.lastToolOk &&
      input.passes < this.maxPasses
    );
  }
}
