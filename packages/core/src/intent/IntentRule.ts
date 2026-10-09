/**
 * V31-INTENT-01 — ordered match rule for HeuristicIntentClassifier.
 */

import type { IntentVerdict } from '@agent-k/shared';
import type { IntentClassifierInput } from './IntentClassifier';

export interface IntentRule {
  id: string;
  /** Higher runs first. */
  priority: number;
  match(input: IntentClassifierInput): IntentVerdict | null;
}
