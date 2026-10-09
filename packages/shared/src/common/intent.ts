/**
 * V31-INTENT-01 — Intent gate types only (no classifiers / host wiring).
 * Comment: shared stays pure; verdict/gates are the cross-package contract.
 */

export type IntentKind = 'conversation' | 'question' | 'task';

/** Pipeline surfaces the host AND-combines with harness settings. */
export interface IntentGates {
  prefetch: boolean;
  verificationFirst: boolean;
  harnessBlocks: boolean;
  toolSchemas: 'full' | 'readonly' | 'none';
}

export interface IntentVerdict {
  kind: IntentKind;
  confidence: number;
  reason: string;
  gates: IntentGates;
}
