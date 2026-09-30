/**
 * CTX-001 — Context budget types / helpers.
 * Rough char→token estimate shared by assembler + compaction.
 *
 * V31-CTX-03 — delegates to the CJK-aware HeuristicTokenEstimator.
 */

import {
  defaultTokenEstimator,
  type TokenEstimator,
} from './tokens/TokenEstimator';

/** Default context window when no model budget is provided. */
export const DEFAULT_CONTEXT_BUDGET_TOKENS = 100_000;

/** Trigger compaction when estimated usage exceeds this fraction of budget. */
export const COMPACTION_TRIGGER_RATIO = 0.9;

export interface ContextBudget {
  /** Max input tokens for the model window. */
  maxTokens: number;
  /** Soft threshold that triggers compaction. */
  compactionThreshold: number;
}

/** Build a budget from a max-token window. */
export function createContextBudget(
  maxTokens: number = DEFAULT_CONTEXT_BUDGET_TOKENS
): ContextBudget {
  const safe = Math.max(4096, Math.floor(maxTokens));
  return {
    maxTokens: safe,
    compactionThreshold: Math.floor(safe * COMPACTION_TRIGGER_RATIO),
  };
}

/**
 * Rough token estimate from text (CJK-aware).
 * Kept as a free function for backward compatibility; delegates to the
 * default estimator so callers can swap in an injected estimator when needed.
 */
export function estimateTokens(text: string, estimator: TokenEstimator = defaultTokenEstimator): number {
  return estimator.estimate(text);
}

/** Sum token estimates across message contents (+ tool call JSON). */
export function estimateMessagesTokens(
  messages: Array<{ content?: string; toolCalls?: unknown; toolCallId?: string }>,
  estimator: TokenEstimator = defaultTokenEstimator
): number {
  return estimator.estimateMessages(messages);
}

/** True when usage crosses the compaction soft threshold. */
export function isOverBudget(usedTokens: number, budget: ContextBudget): boolean {
  return usedTokens >= budget.compactionThreshold;
}
