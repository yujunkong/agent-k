/**
 * V31-INTENT-01 — evaluate verdict and AND-combine with host harness base.
 */

import type { IntentGates, IntentVerdict } from '@agent-k/shared';
import type { IntentClassifier, IntentClassifierInput } from './IntentClassifier';

export type IntentGateTargets = IntentGates;

/** none < readonly < full — keep the more restrictive surface. */
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

  /** AND booleans; most restrictive toolSchemas wins. */
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
