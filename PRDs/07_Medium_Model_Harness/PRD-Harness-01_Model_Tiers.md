# PRD-Harness-01: Model Tiers (모델 티어)

> **Category**: Medium Model Harness (중급 모델 하네스)  
> **Phase**: Design-time (아키텍처 결정)  
> **관련 PRD**: `PRD-Harness-02_Verification_First.md`, `PRD-23_Model_Router.md`, `PRD-Infra-04_Tool_Registry.md`

---

## 1. Overview

### 목적
**모델 능력에 따른 티어(Tier) 분류**와 **티어별 기본 정책(도구 화이트리스트, 파라미터, 강제 플랜 등)**을 정의한다. "똑똑함의 상당 부분을 모델이 아니라 하네스에 둔다"는 원칙의 기반.

### 비즈니스 가치
- **비용 최적화**: 90% 요청은 저렴한 Flash(Tier A)로, 어려운 것만 Pro(Tier B)로
- **안정성**: Tier A(중급 모델)도 하네스 덕분에 실무 사용 가능
- **확장성**: 새 모델 추가 시 티어만 지정하면 정책 자동 적용

---

## 2. Tier Definition

| 티어 | 명칭 | 대표 모델 예시 | 능력 수준 | 기본 용도 |
|------|------|----------------|-----------|-----------|
| **A — Base (기본)** | Flash, 소형 Instruct, 로컬 7B~30B | DeepSeek-V4-Flash, Qwen2.5-7B-Instruct, Llama-3.1-8B | 도구 호출 가능하지만 **실수·탈선 잦음** | 일상 질의, 단순 버그 픽, 리드온리 탐색 |
| **B — Strong (강력)** | Pro, Opus, GPT-4o, Claude-3.5-Sonnet | DeepSeek-V4-Pro, GPT-4o, Claude-3.5-Sonnet | 도구 풀세트 + 자율성 높음, Best-of-N 비교용 | 복잡 리팩터링, 아키텍처 설계, 디버그, Plan 실행 |
| **C — Base Only (채팅만)** | 순수 Base, Tool 미지원 | 순수 LLaMA Base, 미세조정 안 된 모델 | 도구 호출 **불가** | 일반 채팅, 설명, 문서 요약 |

---

## 3. Tier Policy (티어별 기본 정책)

### 3.1 도구 화이트리스트 (Tool Whitelist)

| 도구 | Tier A (Flash) | Tier B (Pro) | Tier C |
|------|----------------|--------------|--------|
| `grep`, `glob`, `list_dir`, `read_file` | ✅ | ✅ | ✅ (읽기만) |
| `codebase_search` | ✅ | ✅ | ❌ |
| `lsp_*` | ✅ | ✅ | ❌ |
| `edit_file` (Search-Replace) | ✅ | ✅ | ❌ |
| `write_file` (새 파일/짧은 파일만) | ✅ 제한 | ✅ | ❌ |
| `delete_file` | ❌ | ✅ | ❌ |
| `run_terminal_cmd` (Allowlist만) | ✅ 제한 | ✅ | ❌ |
| `read_lints` | ✅ | ✅ | ❌ |
| `ask_question`, `todo_write` | ✅ | ✅ | ❌ |
| `browser_*`, `web_search`, `web_fetch` | ❌ | ✅ | ❌ |
| `mcp_*` | ❌ | ✅ (지연 로드) | ❌ |
| `task`/`subagent` | ❌ (탐색 1개만) | ✅ | ❌ |

### 3.2 모델 파라미터 프리셋

| 파라미터 | Tier A (Flash) | Tier B (Pro) | Tier C |
|----------|----------------|--------------|--------|
| `temperature` | 0.1 | 0.2 | 0.0 |
| `top_p` | 0.9 | 0.95 | 1.0 |
| `max_tokens` | 8192 | 16384 | 4096 |
| `parallel_tool_calls` | `false` | `true` | `false` |

### 3.3 하네스 강제 정책 (Harness Enforcement)

| 정책 | Tier A (Flash) | Tier B (Pro) | 비고 |
|------|----------------|--------------|------|
| **강제 Plan 모드** | 복잡도 휴리스틱(파일≥3, "리팩터"/"마이그레이션" 키워드) 시 강제 Plan | 선택적 | A는 Plan 없으면 Agent 진입 차단 |
| **도구 호출 상한/턴** | ≤ 4 | ≤ 8 (Pro) / 16 (Opus) | A는 도구 폭주 방지 |
| **Max Turns** | 15 | 25+ | A는 무한 루프 방지 |
| **강제 Plan 승인** | Plan 모드 진입 시 사용자 승인 필수 | 선택적 | A는 Plan 없이 Agent 진입 불가 |
| **자동 Lint/Test 검증** | `edit_file` 후 자동 `read_lints` + 허용된 테스트 1회 | 선택적 | A는 검증 루프 강제 |
| **자동 Plan 분기** | Plan의 TODO 중 일부만 별도 Agent 분기 허용 (탐색 1개) | 자유 | A는 분기 제한 |

---

## 4. Tier Routing (자동 라우팅 휴리스틱)

| 신호 | 동작 |
|------|------|
| **Plan 승인된 대형 작업** | 실행 단계만 Tier B, 탐색은 Tier A |
| **Lint/Test 2회 연속 실패** | 다음 턴 Tier B로 승격 |
| **보안/동시성/프로토콜 키워드** | Tier B 강제 |
| **단순 "이 함수 설명해줘"** | Tier A |
| **JSON 파싱 3회 연속 실패** | 세션 중단 + 모델 변경 제안 |
| **사용자 명시 `@model:pro`** | 강제 Tier B |
| **비용 예산 초과 임박** | Tier A 강제 (비용 절감) |

---

## 5. Implementation Spec

### 5.1 티어 레지스트리 (`src/harness/modelTiers.ts`)

```typescript
export type ModelTier = 'A' | 'B' | 'C';

export interface TierPolicy {
  tier: ModelTier;
  toolWhitelist: string[];
  modelParams: ModelParams;
  maxTurns: number;
  maxToolCallsPerTurn: number;
  forcePlanOn: PlanTrigger[];
  forcePlanApproval: boolean;
  autoLintTest: boolean;
  autoVerifyTest: boolean;
  maxSubagents: number;
  concurrencyLimit: number;
}

export const TIER_POLICIES: Record<ModelTier, TierPolicy> = {
  A: {
    tier: 'A',
    toolWhitelist: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'lsp_definition', 'lsp_references', 'lsp_diagnostics', 'edit_file', 'write_file', 'run_terminal_cmd', 'read_lints', 'ask_question', 'todo_write'],
    modelParams: { temperature: 0.1, top_p: 0.9, max_tokens: 8192, parallel_tool_calls: false },
    maxTurns: 15,
    maxToolCallsPerTurn: 4,
    forcePlanOn: ['file_count_ge_3', 'keyword_refactor', 'keyword_migration', 'keyword_architecture'],
    forcePlanApproval: true,
    autoLintTest: true,
    autoVerifyTest: true,
    maxSubagents: 1,
    concurrencyLimit: 8,
  },
  B: {
    tier: 'B',
    toolWhitelist: [...ALL_TOOLS], // 전체 도구
    modelParams: { temperature: 0.2, top_p: 0.95, max_tokens: 16384, parallel_tool_calls: true },
    maxTurns: 25,
    maxToolCallsPerTurn: 8,
    forcePlanOn: [],
    forcePlanApproval: false,
    autoLintTest: false, // 선택적
    autoVerifyTest: false,
    maxSubagents: 4,
    concurrencyLimit: 16,
  },
  C: {
    tier: 'C',
    toolWhitelist: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'lsp_*'],
    modelParams: { temperature: 0.0, top_p: 1.0, max_tokens: 4096, parallel_tool_calls: false },
    maxTurns: 10,
    maxToolCallsPerTurn: 0, // 쓰기 도구 없음
    forcePlanOn: [],
    forcePlanApproval: false,
    autoLintTest: false,
    autoVerifyTest: false,
    maxSubagents: 0,
    concurrencyLimit: 4,
  },
};

export function getPolicyForModel(modelId: string): TierPolicy {
  const tier = inferTierFromModelId(modelId);
  return TIER_POLICIES[tier];
}

function inferTierFromModelId(modelId: string): ModelTier {
  const id = modelId.toLowerCase();
  if (id.includes('flash') || id.includes('7b') || id.includes('8b') || id.includes('small')) return 'A';
  if (id.includes('pro') || id.includes('opus') || id.includes('4o') || id.includes('sonnet') || id.includes('large') || id.includes('70b') || id.includes('405b')) return 'B';
  return 'C'; // base 모델 등
}
```

### 5.2 라우터 통합 (`src/router/modelRouter.ts`)

```typescript
export class ModelRouter {
  constructor(private policies: Record<ModelTier, TierPolicy>) {}

  async selectModel(ctx: RoutingContext): Promise<ModelSelection> {
    // 1. 사용자 명시
    if (ctx.userForcedTier) return { tier: ctx.userForcedTier, reason: 'user_forced' };

    // 2. Plan 승인된 실행 단계 → Tier B
    if (ctx.planApproved && ctx.mode === 'agent') return { tier: 'B', reason: 'plan_approved_execution' };

    // 3. 복잡도 휴리스틱
    const complexity = this.estimateComplexity(ctx.userMessage, ctx.workspaceState);
    if (complexity >= 0.7) return { tier: 'B', reason: 'high_complexity' };

    // 4. 키워드 트리거
    if (this.hasSecurityKeywords(ctx.userMessage)) return { tier: 'B', reason: 'security_keywords' };

    // 5. 연속 실패 → 승격
    if (ctx.consecutiveFailures >= 2) return { tier: 'B', reason: 'consecutive_failures' };

    // 5. 비용 예산 확인
    if (this.isBudgetCritical()) return { tier: 'A', reason: 'budget_critical' };

    // 기본: Tier A (Flash)
    return { tier: 'A', reason: 'default' };
  }
}
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Model Tiers

  Scenario: Flash model gets restricted toolset
    Given model "deepseek-v4-flash" (Tier A)
    When agent starts in Agent mode
    Then tool whitelist excludes delete_file, browser_*, mcp_*, task
    And maxToolCallsPerTurn = 4
    And maxTurns = 15

  Scenario: Pro model gets full toolset
    Given model "deepseek-v4-pro" (Tier B)
    When agent starts
    Then all tools available
    And maxToolCallsPerTurn = 8
    And parallel_tool_calls = true

  Scenario: Force Plan mode for complex task
    Given Tier A model
    And user says "Refactor payment module to use Strategy pattern"
    When agent analyzes request
    Then Plan mode forced before Agent mode
    And user must approve plan

  Scenario: Consecutive failures escalate tier
    Given Tier A model
    And lint/test fails 2 consecutive turns
    When next turn starts
    Then model upgraded to Tier B
    And reason logged: "consecutive_failures"

  Scenario: Budget critical forces Tier A
    Given monthly budget 90% used
    When any request comes
    Then Tier A forced regardless of complexity
    And reason logged: "budget_critical"
```

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 6. References

- `PRD-Harness-02_Verification_First.md` — 검증 우선 철학과 티어별 검증 강제 여부
- `PRD-23_Model_Router.md` — 라우터 구현 상세
- `PRD-Infra-04_Tool_Registry.md` — 도구 화이트리스트 연동
- `PRD-Harness-12_Routing_Heuristics.md` — 라우팅 휴리스틱 상세