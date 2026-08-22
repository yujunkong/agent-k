/**
 * HARB-T11: Context Rules (컨텍스트 규칙) — A티어 숫자 예시
 *
 * A티어(Flash급) 모델이 안정적으로 돌아가게 하는 구체적 숫자·규칙을 고정.
 * "감으로"가 아닌 측정 가능한 임계값으로 하네스 동작을 결정한다.
 *
 * PRD: PRD-Harness-11_Context_Rules.md
 */

/**
 * A티어 컨텍스트 규칙 설정.
 */
export interface ContextRulesConfig {
  /** 활성 도구 수 (화이트리스트) */
  maxActiveTools: number;
  /** 턴당 최대 tool_calls */
  maxToolCallsPerTurn: number;
  /** read_file 기본 최대 줄 수 */
  defaultReadLines: number;
  /** tool result 상한 (문자) */
  maxToolResultChars: number;
  /** 최대 턴 수 */
  maxTurns: number;
  /** temperature (도구 턴) */
  toolTemperature: number;
  /** 패치 방식 */
  patchFormat: 'search_replace' | 'unified_diff';
  /** JSON 재시도 횟수 */
  maxJsonRetries: number;
  /** 패치 재시도 횟수 */
  maxPatchRetries: number;
  /** lint-fix 재시도 횟수 */
  maxLintFixRetries: number;
}

/**
 * A티어 기본 컨텍스트 규칙.
 */
export const TIER_A_CONTEXT_RULES: ContextRulesConfig = {
  maxActiveTools: 12,
  maxToolCallsPerTurn: 12,
  defaultReadLines: 250,
  maxToolResultChars: 32000,
  maxTurns: 15,
  toolTemperature: 0.1,
  patchFormat: 'search_replace',
  maxJsonRetries: 1,
  maxPatchRetries: 2,
  maxLintFixRetries: 2,
};

/**
 * B티어 기본 컨텍스트 규칙.
 */
export const TIER_B_CONTEXT_RULES: ContextRulesConfig = {
  maxActiveTools: 40,
  maxToolCallsPerTurn: 16,
  defaultReadLines: 500,
  maxToolResultChars: 64000,
  maxTurns: 25,
  toolTemperature: 0.2,
  patchFormat: 'search_replace',
  maxJsonRetries: 2,
  maxPatchRetries: 3,
  maxLintFixRetries: 1,
};

/**
 * 컨텍스트 예산 슬롯 정의.
 */
export interface ContextBudgetSlot {
  name: string;
  percent: number;
  tokens: number;
  protected_: boolean;
}

/**
 * 128k 컨텍스트 기준 예산 슬롯.
 */
export const CONTEXT_BUDGET_128K: ContextBudgetSlot[] = [
  { name: 'System + Mode Prompt', percent: 5, tokens: 6400, protected_: true },
  { name: 'Rules', percent: 5, tokens: 6400, protected_: true },
  { name: 'Tool Schemas', percent: 8, tokens: 10240, protected_: true },
  { name: 'Sticky Context', percent: 12, tokens: 15360, protected_: true },
  { name: 'Conversation + Tool Results', percent: 60, tokens: 76800, protected_: false },
  { name: 'Response Reserve', percent: 10, tokens: 13312, protected_: true },
];

/**
 * 컴팩션 트리거 설정.
 */
export interface CompactionTrigger {
  name: string;
  condition: string;
  threshold: number; // 0-1 비율
  action: string;
}

export const COMPACTION_TRIGGERS: CompactionTrigger[] = [
  { name: 'Preventive', condition: 'estimated > 90% budget', threshold: 0.9, action: 'auto before next turn' },
  { name: 'Forced', condition: 'actual > 95% budget', threshold: 0.95, action: 'immediate (mid-turn if needed)' },
  { name: 'Manual', condition: 'user /compact command', threshold: 0, action: 'immediate' },
  { name: 'Periodic', condition: 'every 20 turns', threshold: 0, action: 'background' },
];

/**
 * 티어에 맞는 컨텍스트 규칙을 반환한다.
 */
export function getContextRules(tier: 'A' | 'B' | 'C'): ContextRulesConfig {
  switch (tier) {
    case 'A': return { ...TIER_A_CONTEXT_RULES };
    case 'B': return { ...TIER_B_CONTEXT_RULES };
    case 'C': return { ...TIER_A_CONTEXT_RULES, maxToolCallsPerTurn: 0, maxTurns: 10 };
  }
}
