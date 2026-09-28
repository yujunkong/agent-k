/**
 * V31-INTENT-01 — IntentRule contract for the heuristic rule chain.
 */

import type { IntentVerdict } from '@agent-k/shared';
import type { IntentClassifierInput } from './IntentClassifier';

/** One ordered rule; first non-null verdict (priority desc) wins. */
export interface IntentRule {
  id: string;
  priority: number;
  match(input: IntentClassifierInput): IntentVerdict | null;
}
