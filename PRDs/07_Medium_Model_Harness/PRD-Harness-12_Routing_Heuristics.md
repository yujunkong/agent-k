# PRD-Harness-12: Routing Heuristics (라우팅 휴리스틱 — Flash ↔ Pro)

> **Category**: Medium Model Harness  
> **Phase**: C4~C5 (티어 시스템 + 라우터 안정화 후)  
> **관련 PRD**: `PRD-Harness-01_Model_Tiers.md`, `PRD-23_Model_Router.md`, `PRD-23b_Model_Router_AB_Tier.md`

---

## 1. Overview

### 목적
**동일 태스크라도 복잡도·상태에 따라 모델 티어(Flash ↔ Pro)를 동적 전환**해 **비용·품질·속도**를 자동 균형 잡는다. Cursor Auto Router + 하네스 티어 정책 결합.

### 비즈니스 가치
- **비용 80% 절감**: 90% 요청 Flash(저가) 처리, 어려운 것만 Pro 승격
- **품질 보장**: 린트/테스트 2회 실패 시 자동 Pro 승격
- **투명성**: 채팅 헤더에 `tier=A`, `fallback=pro` 실시간 표시

---

## 2. Routing Signals & Actions (라우팅 신호 → 동작)

| # | 신호 (Signal) | 조건 | 동작 (Action) | 우선순위 |
|---|--------------|------|---------------|----------|
| 1 | **User Forced** | `@model:pro` 멘션 또는 드롭다운 선택 | 강제 Tier B (다음 턴까지) | 최상 |
| 2 | **Plan Approved Execution** | Plan 모드 승인 후 Agent 실행 단계 | 실행 단계만 Tier B | 높음 |
| 3 | **Consecutive Failures** | 동일 태스크에서 lint/test 실패 **2회 연속** | 다음 턴 Tier B로 승격 | 높음 |
| 4 | **Security/Concurrency/Protocol Keywords** | `auth`, `crypto`, `race condition`, `grpc`, `tls`, `oauth`, `jwt`, `sql injection` 등 | Tier B 강제 | 높음 |
| 5 | **Simple Query** | "이 함수 설명해줘", "이게 뭐야?", 단일 파일 읽기 | Tier A 유지 | 낮음 |
| 6 | **JSON Parse Failures** | 동일 세션에서 tool_calls JSON 파싱 **3회 연속 실패** | 세션 중단 + 모델 변경 제안 | 높음 |
| 7 | **Budget Critical** | 월간 예산 90% 소진 임박 | Tier A 강제 (비용 절감) | 중간 |
| 8 | **Best-of-N Request** | `/best-of-n N=3` 명령 | N개 worktree 병렬 (A/B 믹스) | 사용자 요청 |
| 9 | **Complexity Heuristic** | 파일 ≥ 3개, "리팩터/마이그레이션/아키텍처" 키워드 | Plan 모드 강제 + 실행 시 Tier B | 높음 |

---

## 2. Routing Decision Matrix (의사결정 매트릭스)

| 상황 | 현재 티어 | 다음 턴 티어 | 이유 |
|------|-----------|--------------|------|
| User says `@model:pro fix this` | A | **B** (forced) | User forced |
| Plan approved → Agent executes | A | **B** (execution only) | Plan-approved execution |
| Lint fails → retry → fails again | A | **B** (upgrade) | Consecutive failures (2x) |
| User asks "explain this function" | A | A (stay) | Simple query |
| User says "fix race condition in payment" | A | **B** (forced) | Security keyword |
| JSON parse fails 3x in session | A | **B** (suggest) | JSON parse failures (3x) |
| Monthly budget 950+ files refactoring | A | **B** (Plan→Execute) | Complexity heuristic |
| Budget 95% used | B | **A** (downgrade) | Budget critical |

---

## 3. Tier-Specific Execution Policy (티어별 실행 정책)

| 정책 | Tier A (Flash) | Tier B (Pro) |
|------|----------------|--------------|
| **Max Turns** | 15 | 25+ |
| **Max Tool Calls/Turn** | 4 | 8 (parallel_tool_calls=true) |
| **Tool Whitelist** | 10 tools (A-tier whitelist) | Full (40+) |
| **Parallel Tool Calls** | `false` | `true` |
| **Auto Plan Trigger** | 복잡도 ≥ 3 파일 / 키워드 | 선택적 |
| **Auto Lint/Test** | 강제 (max 2 retries) | 선택적 (1 retry) |
| **Max Subagents** | 1 (탐색용) | 4 |
| **Concurrency Limit** | 8 | 16 |
| **Fallback on Failure** | 사용자 힌트 / Pro 승격 | 사용자 힌트 / Best-of-N |

---

## 3. Routing Engine Implementation (`src/router/modelRouter.ts`)

```typescript
export class ModelRouter {
  constructor(
    private policies: Record<ModelTier, TierPolicy>,
    private budgetTracker: BudgetTracker
  ) {}

  async selectModel(ctx: RoutingContext): Promise<ModelSelection> {
    // 1. 사용자 강제 지정 최우선
    if (ctx.userForcedTier) {
      return this.selectTier(ctx.userForcedTier, 'user_forced');
    }

    // 2. Plan 승인 후 실행 단계
    if (ctx.planApproved && ctx.mode === 'agent') {
      return this.selectTier('B', 'plan_approved_execution');
    }

    // 3. 연속 실패 → 승격
    if (ctx.consecutiveFailures >= 2) {
      return this.selectTier('B', `consecutive_failures:${ctx.consecutiveFailures}`);
    }

    // 3. 보안/복잡도 키워드 → 강제 Tier B
    if (this.hasSecurityKeywords(ctx.userMessage)) {
      return this.selectTier('B', 'security_keyword');
    }

    // 4. 복잡도 휴리스틱 → Plan 승인 후 실행 시 Tier B
    const complexity = this.estimateComplexity(ctx.userMessage, ctx.workspaceState);
    if (complexity >= 0.7 && ctx.mode === 'agent' && ctx.planApproved) {
      return this.selectTier('B', 'high_complexity_execution');
    }

    // 4. 단순 질의 → Tier A 유지
    if (this.isSimpleQuery(ctx.userMessage)) {
      return this.selectTier('A', 'simple_query');
    }

    // 5. 비용 예산 임박 → Tier A 강제
    if (this.budgetTracker.isCritical()) {
      return this.selectTier('A', 'budget_critical');
    }

    // 기본: Tier A (Flash)
    return this.selectTier('A', 'default');
  }

  private selectTier(tier: ModelTier, reason: string): ModelSelection {
    const policy = this.policies[tier];
    return {
      tier,
      modelId: policy.defaultModel,
      providerId: policy.defaultProvider,
      reason,
      metadata: {
        maxTurns: policy.maxTurns,
        maxToolCallsPerTurn: policy.maxToolCallsPerTurn,
        toolWhitelist: policy.toolWhitelist,
        fallback: tier === 'A' ? { tier: 'B', trigger: 'consecutive_failures' } : undefined,
      }
    };
  }

  private hasSecurityKeywords(msg: string): boolean {
    const keywords = ['auth', 'crypto', 'race condition', 'grpc', 'tls', 'oauth', 'jwt', 'sql injection', 'xss', 'csrf', 'race condition', 'deadlock', 'concurrency', 'distributed transaction'];
    return keywords.some(k => msg.toLowerCase().includes(k));
  }

  private isSimpleQuery(msg: string): boolean {
    // 단일 파일 설명, 단순 질문, 짧은 길이
    return msg.length < 200 && /^(what|how|explain|describe|show|where).*/i.test(msg.trim());
  }

  private estimateComplexity(msg: string, state: WorkspaceState): number {
    // 0~1 스코어링: 파일 수, 키워드, 길이 등 종합
    let score = 0;
    if (msg.length > 500) score += 0.2;
    if (/\b(refactor|migrate|architecture|redesign)\b/i.test(msg)) score += 0.4;
    if (state.recentFiles.length > 5) score += 0.2;
    if (state.openTabs.length > 10) score += 0.1;
    return Math.min(score, 1);
  }
}
```

---

## 4. UI/UX 표시 (채팅 헤더)

```
Model: deepseek-v4-flash  [Tier A]  💰 $0.00  ⚡ 0.8s
    ↳ Fallback: deepseek-v4-pro (Tier B) on 2x lint fail

    [Override: @model:pro] [Tier: A ▼] [Budget: 12% used]
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Routing Heuristics

  Scenario: Plan-approved execution uses Pro
    Given user approved a Plan for "Refactor payment module"
    When Agent mode executes the plan
    Then Tier B (Pro) model used for execution turns
    And maxTurns=25, parallel_tool_calls=true
    And chat header shows "Tier B (Plan execution)"

  Scenario: Consecutive lint failures upgrade tier
    Given Tier A model
    And edit_file → lint fails → retry → lint fails again (2 consecutive)
    When next turn starts
    Then model upgraded to Tier B (Pro)
    And reason logged: "consecutive_failures: 2"
    And maxTurns=25, full toolset available

  Scenario: Security keyword forces Pro
    Given user asks "Fix the race condition in payment processing"
    When agent starts
    Then Tier B selected immediately
    And reason: "security_keyword: race condition"

  Scenario: Simple query stays on Flash
    Given user asks "What does getUser() do?"
    When agent responds
    Then Tier A (Flash) used
    And maxTurns=10, toolWhitelist=10 tools

  Scenario: Budget critical forces Flash
    Given monthly budget 95% consumed
    When any request comes
    Then Tier A forced regardless of complexity
    And chat header shows "Budget critical: using Flash only"

  Scenario: User forces Pro via mention
    Given user types "@model:pro Refactor this"
    When agent starts
    Then Tier B selected
    And reason: "user_forced"
```

---


## Out of Scope

- 프론티어 모델 전용 ‘자율 만능’ 설계를 Tier A에 그대로 적용
- 상세: `00_Master_Context.md` + Harness-14

## 4. References

- `PRD-Harness-01_Model_Tiers.md` — 티어 정의
- `PRD-23_Model_Router.md` — 라우터 구현 상세
- `PRD-23b_Model_Router_AB_Tier.md` — A/B 티어 상세 매핑
- `PRD-Harness-01_Model_Tiers.md` — 티어별 정책
- `PRD-23_Model_Router.md` — 라우터 구현 상세