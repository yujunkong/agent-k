/**
 * V31-INTENT-01 — IntentClassifier contract (constructor DI, no vscode/network).
 */

import type { AgentMode, IntentVerdict } from '@agent-k/shared';

/** Input for one intent classification pass. */
export interface IntentClassifierInput {
  userText: string;
  mode: AgentMode;
  hasImages?: boolean;
  hasInlineEdit?: boolean;
  priorTurns?: number;
}

/** Pluggable classifier — sync or async, injected into IntentGate. */
export interface IntentClassifier {
  readonly id: string;
  classify(
    input: IntentClassifierInput,
  ): IntentVerdict | Promise<IntentVerdict>;
}
