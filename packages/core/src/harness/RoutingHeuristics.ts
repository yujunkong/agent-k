/**
 * HARNESS-006 — Dynamic tier routing (Flash ↔ Pro heuristics).
 */
import {
  estimateComplexity,
  hasSecurityKeywords,
  type ModelTier,
} from './ModelTiers';

export interface RoutingSignal {
  userForcedTier?: ModelTier;
  planApproved?: boolean;
  consecutiveFailures?: number;
  jsonParseFailures?: number;
  userMessage?: string;
  fileCount?: number;
  budgetUsage?: number;
  currentTier?: ModelTier;
  mode?: string;
}

export interface RoutingDecision {
  tier: ModelTier;
  reason: string;
  confidence: number;
}

const SIGNAL_PRIORITY: Array<{
  check: (signal: RoutingSignal) => RoutingDecision | null;
  priority: number;
}> = [
  {
    priority: 1,
    check: (s) =>
      s.userForcedTier
        ? { tier: s.userForcedTier, reason: 'user_forced', confidence: 1.0 }
        : null,
  },
  {
    priority: 2,
    check: (s) =>
      (s.jsonParseFailures ?? 0) >= 3
        ? {
            tier: 'B',
            reason: 'json_parse_failures_3x',
            confidence: 0.95,
          }
        : null,
  },
  {
    priority: 3,
    check: (s) =>
      s.planApproved && s.mode === 'agent'
        ? { tier: 'B', reason: 'plan_approved_execution', confidence: 0.9 }
        : null,
  },
  {
    priority: 4,
    check: (s) =>
      s.userMessage && hasSecurityKeywords(s.userMessage)
        ? { tier: 'B', reason: 'security_keywords', confidence: 0.85 }
        : null,
  },
  {
    priority: 5,
    check: (s) =>
      (s.consecutiveFailures ?? 0) >= 2
        ? { tier: 'B', reason: 'consecutive_failures_2x', confidence: 0.8 }
        : null,
  },
  {
    priority: 6,
    check: (s) => {
      if (!s.userMessage) return null;
      const complexity = estimateComplexity(s.userMessage, {
        fileCount: s.fileCount,
      });
      if (complexity >= 0.7) {
        return {
          tier: 'B',
          reason: `high_complexity_${complexity.toFixed(2)}`,
          confidence: 0.75,
        };
      }
      return null;
    },
  },
  {
    priority: 7,
    check: (s) =>
      (s.budgetUsage ?? 0) >= 0.9
        ? { tier: 'A', reason: 'budget_critical', confidence: 0.9 }
        : null,
  },
];

export function routeByHeuristics(signal: RoutingSignal): RoutingDecision {
  const sorted = [...SIGNAL_PRIORITY].sort((a, b) => a.priority - b.priority);
  for (const handler of sorted) {
    const decision = handler.check(signal);
    if (decision) return decision;
  }
  return {
    tier: signal.currentTier || 'A',
    reason: 'default',
    confidence: 0.5,
  };
}
