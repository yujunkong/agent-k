/**
 * Thinking effort → OpenAI-compatible request opts (LiteLLM / local servers).
 * Minimal subset for PROVIDER-010; full MODEL-008 capability lives later.
 */
import type { ThinkingEffort } from '@agent-k/shared';

export function parseThinkingEffort(v: unknown): ThinkingEffort {
  if (v === 'off' || v === 'low' || v === 'medium' || v === 'high' || v === 'max') {
    return v;
  }
  return 'medium';
}

export function thinkingEffortToProviderOpts(effort: ThinkingEffort): {
  enableThinking: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
  thinkingBudget?: number;
} {
  if (effort === 'off') {
    return { enableThinking: false, thinkingBudget: 0 };
  }
  const budget =
    effort === 'low' ? 1024 : effort === 'high' ? 16384 : effort === 'max' ? 32768 : 4096;
  return {
    enableThinking: true,
    reasoningEffort: effort,
    thinkingBudget: budget,
  };
}
