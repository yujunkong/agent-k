/**
 * HARB-T12: Routing Heuristics (라우팅 휴리스틱 — Flash ↔ Pro)
 *
 * 동일 태스크라도 복잡도·상태에 따라 모델 티어(Flash ↔ Pro)를 동적 전환해
 * 비용·품질·속도를 자동 균형 잡는다.
 *
 * PRD: PRD-Harness-12_Routing_Heuristics.md
 */

import type { ModelTier } from './ModelTiers';
import { estimateComplexity, hasSecurityKeywords } from './ModelTiers';

/**
 * 라우팅 신호.
 */
export interface RoutingSignal {
  /** 사용자 강제 티어 */
  userForcedTier?: ModelTier;
  /** Plan 승인 후 Agent 실행 단계 */
  planApproved?: boolean;
  /** 연속 실패 횟수 */
  consecutiveFailures?: number;
  /** JSON 파싱 연속 실패 횟수 */
  jsonParseFailures?: number;
  /** 사용자 메시지 */
  userMessage?: string;
  /** 워크스페이스 파일 수 */
  fileCount?: number;
  /** 월간 예산 사용률 (0~1) */
  budgetUsage?: number;
  /** 현재 티어 */
  currentTier?: ModelTier;
  /** 현재 모드 */
  mode?: string;
}

/**
 * 라우팅 결정.
 */
export interface RoutingDecision {
  tier: ModelTier;
  reason: string;
  confidence: number;
}

/**
 * 라우팅 신호 우선순위 (낮을수록 높은 우선순위).
 */
const SIGNAL_PRIORITY: Array<{
  check: (signal: RoutingSignal) => RoutingDecision | null;
  priority: number;
}> = [
  // 1. User Forced (최상위)
  {
    priority: 1,
    check: (s) =>
      s.userForcedTier
        ? { tier: s.userForcedTier, reason: 'user_forced', confidence: 1.0 }
        : null,
  },
  // 2. JSON Parse Failures 3x → 세션 중단 제안
  {
    priority: 2,
    check: (s) =>
      (s.jsonParseFailures ?? 0) >= 3
        ? { tier: 'B', reason: 'json_parse_failures_3x_session_abort_suggested', confidence: 0.95 }
        : null,
  },
  // 3. Plan Approved Execution → Tier B
  {
    priority: 3,
    check: (s) =>
      s.planApproved && s.mode === 'agent'
        ? { tier: 'B', reason: 'plan_approved_execution', confidence: 0.9 }
        : null,
  },
  // 4. Security/Concurrency/Protocol Keywords → Tier B
  {
    priority: 4,
    check: (s) =>
      s.userMessage && hasSecurityKeywords(s.userMessage)
        ? { tier: 'B', reason: 'security_keywords', confidence: 0.85 }
        : null,
  },
  // 5. Consecutive Failures 2x → Tier B 승격
  {
    priority: 5,
    check: (s) =>
      (s.consecutiveFailures ?? 0) >= 2
        ? { tier: 'B', reason: 'consecutive_failures_2x', confidence: 0.8 }
        : null,
  },
  // 6. Complexity Heuristic → Plan 모드 + Tier B
  {
    priority: 6,
    check: (s) => {
      if (!s.userMessage) return null;
      const complexity = estimateComplexity(s.userMessage, {
        fileCount: s.fileCount,
      });
      if (complexity >= 0.7) {
        return { tier: 'B', reason: `high_complexity_${complexity.toFixed(2)}`, confidence: 0.75 };
      }
      return null;
    },
  },
  // 7. Budget Critical → Tier A 강제
  {
    priority: 7,
    check: (s) =>
      (s.budgetUsage ?? 0) >= 0.9
        ? { tier: 'A', reason: 'budget_critical', confidence: 0.9 }
        : null,
  },
];

/**
 * 주어진 신호를 기반으로 라우팅 결정을 내린다.
 */
export function routeByHeuristics(signal: RoutingSignal): RoutingDecision {
  // Sort by priority and return first match
  const sorted = [...SIGNAL_PRIORITY].sort((a, b) => a.priority - b.priority);

  for (const handler of sorted) {
    const decision = handler.check(signal);
    if (decision) {
      return decision;
    }
  }

  // Default: stay on current tier or Tier A
  return {
    tier: signal.currentTier || 'A',
    reason: 'default',
    confidence: 0.5,
  };
}

/**
 * Plan 모드가 필요한지 확인한다.
 */
export function shouldForcePlan(signal: RoutingSignal): boolean {
  if (!signal.userMessage) return false;

  const complexity = estimateComplexity(signal.userMessage, {
    fileCount: signal.fileCount,
  });

  // 복잡도 0.5 이상 또는 특정 키워드
  const forcePlanKeywords = [
    'refactor', 'migrate', 'architecture', 'redesign',
    'restructure', 'reorganize', 'rewrite',
  ];
  const msg = signal.userMessage.toLowerCase();
  const hasKeyword = forcePlanKeywords.some((kw) => msg.includes(kw));

  return complexity >= 0.5 || (hasKeyword && (signal.fileCount ?? 0) >= 3);
}
