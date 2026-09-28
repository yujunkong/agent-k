/**
 * V31-INTENT-01 — Intent domain barrel.
 */

export {
  type IntentClassifier,
  type IntentClassifierInput,
} from './IntentClassifier';
export { type IntentRule } from './IntentRule';
export {
  DEFAULT_INTENT_RULES,
  HeuristicIntentClassifier,
} from './HeuristicIntentClassifier';
export { IntentGate, type IntentGateTargets } from './IntentGate';
