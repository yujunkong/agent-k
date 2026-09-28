/**
 * V31-INTENT-01 — IntentGate: evaluate a verdict and AND-combine its gates
 * with a base gate set (most restrictive tool schema wins).
 */

import type { IntentGates, IntentVerdict } from '@agent-k/shared';
import type { IntentClassifier, IntentClassifierInput } from './IntentClassifier';

export type IntentGateTargets = IntentGates;

/** none < readonly < full (lower rank = more restrictive). */
const TOOL_SCHEMA_RANK: Record<IntentGates['toolSchemas'], number> = {
  none: 0,
  readonly: 1,
  full: 2,
};

export class IntentGate {
  constructor(private readonly classifier: IntentClassifier) {}

  async evaluate(input: IntentClassifierInput): Promise<IntentVerdict> {
    return this.classifier.classify(input);
  }

  /** AND booleans; keep the most restrictive tool schema surface. */
  apply(verdict: IntentVerdict, base: IntentGateTargets): IntentGateTargets {
    return {
      prefetch: base.prefetch && verdict.gates.prefetch,
      verificationFirst:
        base.verificationFirst && verdict.gates.verificationFirst,
      harnessBlocks: base.harnessBlocks && verdict.gates.harnessBlocks,
      toolSchemas:
        TOOL_SCHEMA_RANK[base.toolSchemas] <=
        TOOL_SCHEMA_RANK[verdict.gates.toolSchemas]
          ? base.toolSchemas
          : verdict.gates.toolSchemas,
    };
  }
}
