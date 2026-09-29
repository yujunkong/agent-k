/**
 * V31-FRAME-01 — types only. The loop parses these fields; no classifier here.
 */
export interface UserIntentFrame {
  outcome: string;
  constraints: string[];
  ambiguous: boolean;
  clarifyQuestion?: string;
}

export interface DiscriminatingHypothesis {
  claim: string;
  killIf: string;
}

export interface ProblemFrame {
  intent: UserIntentFrame;
  symptom: string;
  doneWhen: string;
  /** At most 3. Extra entries are dropped by the parser. */
  hypotheses: DiscriminatingHypothesis[];
  nonGoals: string[];
  /** Set by the loop after one read observation, not by the model alone. */
  observationDone: boolean;
}
