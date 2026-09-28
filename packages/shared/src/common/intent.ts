/**
 * V31-INTENT-01 — Intent Gate shared contracts.
 * Pure types only (no classifier logic — that lives in @agent-k/core).
 */

/** Classified user intent for a single send. */
export type IntentKind = 'conversation' | 'question' | 'task';

/** Downstream gates derived from the intent verdict. */
export interface IntentGates {
  /** Inject IDE prefetch context into the user turn. */
  prefetch: boolean;
  /** Inject verification-first protocol + exit gate. */
  verificationFirst: boolean;
  /** Apply harness prompt blocks + tier tool whitelist. */
  harnessBlocks: boolean;
  /** Tool schema surface exposed to the model. */
  toolSchemas: 'full' | 'readonly' | 'none';
}

/** Result of classifying one user turn. */
export interface IntentVerdict {
  kind: IntentKind;
  confidence: number;
  reason: string;
  gates: IntentGates;
}
