/**
 * CTX-001 — Context budget types / helpers.
 * Rough char→token estimate (≈4 chars/token) shared by assembler + compaction.
 */

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

/** Rough token estimate from UTF-16 length. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Sum token estimates across message contents (+ tool call JSON). */
export function estimateMessagesTokens(
  messages: Array<{ content?: string; toolCalls?: unknown; toolCallId?: string }>
): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content ?? '');
    if (m.toolCalls) total += estimateTokens(JSON.stringify(m.toolCalls));
    if (m.toolCallId) total += estimateTokens(m.toolCallId);
  }
  return total;
}

/** True when usage crosses the compaction soft threshold. */
export function isOverBudget(usedTokens: number, budget: ContextBudget): boolean {
  return usedTokens >= budget.compactionThreshold;
}
