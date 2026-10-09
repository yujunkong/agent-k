/** V31-INTENT-01 — Intent Gate public surface. */

export type { IntentClassifier, IntentClassifierInput } from './IntentClassifier';
export type { IntentRule } from './IntentRule';
export {
  HeuristicIntentClassifier,
  DEFAULT_INTENT_RULES,
} from './HeuristicIntentClassifier';
export { IntentGate, type IntentGateTargets } from './IntentGate';
