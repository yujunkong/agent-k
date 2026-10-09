/**
 * V31-INTENT-01 — classifier port (strategy injectable).
 */

import type { AgentMode, IntentVerdict } from '@agent-k/shared';

export interface IntentClassifierInput {
  userText: string;
  mode: AgentMode;
  hasImages?: boolean;
  hasInlineEdit?: boolean;
  priorTurns?: number;
}

export interface IntentClassifier {
  readonly id: string;
  classify(input: IntentClassifierInput): IntentVerdict | Promise<IntentVerdict>;
}
