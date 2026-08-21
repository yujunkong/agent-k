/**
 * MODEL-009 — Tier A/B/C policies focused on maxTurns (providers surface).
 * Full harness tool whitelist / plan triggers stay with core/harness later.
 * ModelTier type is shared with ModelRouter to avoid drift.
 */
import type { ModelTier } from './ModelRouter';

// ModelTier type lives in ModelRouter (single export via package index).

export interface ModelParams {
  temperature: number;
  top_p: number;
  max_tokens: number;
  parallel_tool_calls: boolean;
}

/** Providers-facing subset of harness TierPolicy (maxTurns is the contract). */
export interface TierTurnPolicy {
  tier: ModelTier;
  maxTurns: number;
  maxToolCallsPerTurn: number;
  modelParams: ModelParams;
}

export const TIER_TURN_POLICIES: Record<ModelTier, TierTurnPolicy> = {
  A: {
    tier: 'A',
    maxTurns: 15,
    maxToolCallsPerTurn: 12,
    modelParams: {
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 8192,
      parallel_tool_calls: false,
    },
  },
  B: {
    tier: 'B',
    maxTurns: 25,
    maxToolCallsPerTurn: 16,
    modelParams: {
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 16384,
      parallel_tool_calls: true,
    },
  },
  C: {
    tier: 'C',
    maxTurns: 10,
    maxToolCallsPerTurn: 0,
    modelParams: {
      temperature: 0.0,
      top_p: 1.0,
      max_tokens: 4096,
      parallel_tool_calls: false,
    },
  },
};

/** Infer A/B/C from model id heuristics (default A). */
export function inferTierFromModelId(modelId: string): ModelTier {
  const id = modelId.toLowerCase();

  if (
    id.includes('pro') ||
    id.includes('opus') ||
    id.includes('4o') ||
    id.includes('sonnet') ||
    id.includes('large') ||
    id.includes('70b') ||
    id.includes('405b') ||
    id.includes('gpt-4') ||
    id.includes('claude-3.5') ||
    id.includes('claude-3-opus')
  ) {
    return 'B';
  }

  if (id.includes('base') && !id.includes('instruct')) {
    return 'C';
  }

  return 'A';
}

export function getPolicyForModel(modelId: string): TierTurnPolicy {
  return TIER_TURN_POLICIES[inferTierFromModelId(modelId)];
}

export function getPolicyForTier(tier: ModelTier): TierTurnPolicy {
  return TIER_TURN_POLICIES[tier];
}

/** Convenience: max turns for a model id (MODEL-009). */
export function getMaxTurnsForModel(modelId: string): number {
  return getPolicyForModel(modelId).maxTurns;
}
