/**
 * CFG-007 — Review configuration helpers.
 */

export type ReviewApplyPolicy = 'manual' | 'auto' | 'ask';

export const REVIEW_CONFIG_KEYS = [
  'agent-k.review.applyPolicy',
  'agent-k.review.autoCheckpoint',
] as const;

export interface ReviewConfig {
  applyPolicy: ReviewApplyPolicy;
  autoCheckpoint: boolean;
}

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  applyPolicy: 'manual',
  autoCheckpoint: true,
};

export function parseReviewApplyPolicy(value: unknown): ReviewApplyPolicy {
  if (value === 'manual' || value === 'auto' || value === 'ask') return value;
  return DEFAULT_REVIEW_CONFIG.applyPolicy;
}

export function extractReviewConfig(
  bag: Record<string, unknown>
): ReviewConfig {
  return {
    applyPolicy: parseReviewApplyPolicy(bag['agent-k.review.applyPolicy']),
    autoCheckpoint: bag['agent-k.review.autoCheckpoint'] !== false,
  };
}
