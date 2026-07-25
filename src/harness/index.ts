/**
 * HARB Harness — 중급 모델 하네스 모듈 진입점
 *
 * Phase A: Foundation
 * - ModelTiers: 티어 타입/정책/추론
 * - AWhitelist: Tier A 도구 화이트리스트
 * - VerificationFirstPrompt: 검증 우선 프롬프트
 * - CursorPattern: 커서 패턴 프롬프트
 * - DesignSlogans: 디자인 슬로건
 * - PromptTurnStructure: 턴 구조 제한
 * - HarnessDuties: 하네스 의무
 * - ContextRules: 컨텍스트 규칙
 * - DontDoMedium: 중급 모델 금지사항
 * - UXForMedium: 중급 모델 UX
 * - MinimalMemories: 최소 메모리
 * - RoutingHeuristics: 라우팅 휴리스틱
 */

// ModelTiers
export type { ModelTier, TierPolicy, ModelParams, PlanTrigger } from './ModelTiers';
export {
  TIER_POLICIES,
  ALL_TOOLS,
  inferTierFromModelId,
  getPolicyForModel,
  getPolicyForTier,
  estimateComplexity,
  hasSecurityKeywords,
} from './ModelTiers';

// AWhitelist
export {
  TIER_A_CORE,
  TIER_A_OPTIONAL,
  TIER_A_DENIED,
  getToolNamesForTier,
  getSchemasForTier,
  isAllowedInTierA,
  isDeniedInTierA,
} from './AWhitelist';
export type { GetSchemasForTierOptions } from './AWhitelist';

// VerificationFirstPrompt
export {
  VERIFICATION_FIRST_PROMPT,
  injectVerificationFirst,
} from './VerificationFirstPrompt';

// DesignSlogans
export {
  DESIGN_SLOGANS_PROMPT,
  injectDesignSlogans,
} from './DesignSlogans';

// CursorPattern
export {
  CURSOR_PATTERN_PROMPT,
  injectCursorPattern,
} from './CursorPattern';

// PromptTurnStructure
export {
  TURN_STRUCTURE_PROMPT,
  injectTurnStructure,
  validateTurnStructure,
} from './PromptTurnStructure';
export type { TurnStructureConfig } from './PromptTurnStructure';

// HarnessDuties
export {
  HARNESS_DUTIES,
  getActiveDuties,
  getDuty,
} from './HarnessDuties';
export type { HarnessDuty, HarnessDutyId } from './HarnessDuties';

// ContextRules
export {
  TIER_A_CONTEXT_RULES,
  TIER_B_CONTEXT_RULES,
  CONTEXT_BUDGET_128K,
  COMPACTION_TRIGGERS,
  getContextRules,
} from './ContextRules';
export type { ContextRulesConfig, ContextBudgetSlot, CompactionTrigger } from './ContextRules';

// DontDoMedium
export {
  DONT_DO_MEDIUM_PROMPT,
  injectDontDoMedium,
  isDontDoViolation,
} from './DontDoMedium';

// UXForMedium
export {
  formatStatusBar,
  formatLogLine,
  suggestUXAction,
} from './UXForMedium';
export type { HarnessUXState, UXEventType, UXActionSuggestion } from './UXForMedium';

// MinimalMemories
export {
  formatMemories,
  filterMemoriesByBudget,
} from './MinimalMemories';
export type { MemoryEntry, MemoryStore, MemoryInjectionConfig } from './MinimalMemories';

// RoutingHeuristics
export {
  routeByHeuristics,
  shouldForcePlan,
} from './RoutingHeuristics';
export type { RoutingSignal, RoutingDecision } from './RoutingHeuristics';
