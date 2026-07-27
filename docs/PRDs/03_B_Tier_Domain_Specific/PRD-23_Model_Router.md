# PRD-23: 모델 라우터 (Model Router - Cost/Balance/Intelligence)

> **Priority**: B급 (Cursor Router급 + A/B 티어)  
> **Phase**: C4~C5 (하네스 티어 시스템 안정화 후)  
> **관련 PRD**: `PRD-Harness-01_Model_Tiers.md`, `PRD-Harness-12_Routing_Heuristics.md`, `PRD-22_DGX_vLLM_Provider.md`

---

## 1. Overview

### 목적
**비용·품질·속도**를 자동 균형 잡는 **모델 라우터**를 구현한다. Flash(티어 A) 기본, 막히면 Pro(티어 B) 또는 Best-of-N으로 폴백. Cursor Auto Router와 동등 이상, 로컬 인프라(DGX 2대) 특화.

### 비즈니스 가치
- **비용 80% 절감**: 90% 요청 Flash(저가)로 처리, 어려운 것만 Pro
- **품질 보장**: 린트/테스트 2회 실패 시 자동 Pro 승격
- **투명성**: 채팅 헤더에 `tier=A`, `model=flash`, `fallback=pro` 실시간 표시

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "이 함수 설명해줘"는 Flash로 0.5초 만에, "아키텍처 리팩터링"은 Pro로 제대로 되게 하고 싶다 |
| US-02 | 팀 리더로서, 월말에 "Flash 95%, Pro 5%" 사용량 리포트 보고 비용 예측하고 싶다 |
| US-03 | 개발자로서, Flash가 JSON 파싱 3번 실패하면 자동으로 Pro로 재시도돼서 내가 개입 안 하게 하고 싶다 |

---

## 2. Functional Requirements

### 2.1 라우팅 정책 (Rule Engine)
| FR-ID | 규칙 | 조건 | 액션 |
|-------|------|------|------|
| FR-01 | 기본 티어 | — | **Tier A (Flash)** |
| FR-02 | Plan 승인된 대형 작업 | 사용자가 Plan 모드에서 승인 | 실행 단계만 **Tier B (Pro)** |
| FR-03 | Lint/Test 2회 연속 실패 | 동일 태스크에서 `read_lints`/테스트 실패 2회 | 다음 턴 **Tier B** 또는 **Best-of-N** |
| FR-04 | 단순 질의 | "설명해줘", "이게 뭐야?", 단일 파일 읽기 | **Tier A** 유지 |
| FR-05 | 보안/동시성/프로토콜 | 키워드: `auth`, `crypto`, `race condition`, `grpc`, `tls` | **Tier B** 강제 |
| FR-06 | JSON 파싱 3회 실패 | 동일 세션에서 `tool_calls` 파싱 실패 3회 | 세션 중단 + 모델 변경 제안 |
| FR-07 | 사용자 강제 지정 | 채팅에서 `@model:pro` 멘션 또는 드롭다운 선택 | 해당 모델 고정 (다음 턴까지) |
| FR-08 | Best-of-N 요청 | `/best-of-n N=3` 명령 | 동일 태스크 3개 worktree 병렬 실행 후 비교 |

### 2.2 티어별 모델 매핑 (DGX 2대 기준)
| 티어 | 모델 | 엔드포인트 | 용도 | 최대 동시 |
|------|------|------------|------|-----------|
| **A (기본)** | `deepseek-v4-flash` | DGX-1 vLLM | 일상 질의, 탐색, 단순 수정 | 8 |
| **B (강력)** | `deepseek-v4-pro` | DGX-1 vLLM | Plan 실행, 복잡 리팩터, 디버그 | 2 |
| **B (TRT)** | `trt-llama-70b` | DGX-2 TRT-LLM | 대안 Pro, 고처리량 | 2 |
| **C (비활성)** | 베이스 모델 | — | Agent 비활성, 채팅만 | — |

### 2.3 라우팅 상태 표시 (채팅 헤더)
```
Model: deepseek-v4-flash  [Tier A]  💰 $0.00  ⚡ 0.8s
    ↳ Fallback: deepseek-v4-pro (Tier B) if needed
```

### 2.4 비용/사용량 추적
| FR-ID | 지표 | 저장 |
|-------|------|------|
| FR-09 | 요청 수, 입력/출력 토큰, 지연시간, 티어 | 세션별 + 일별 집계 (`workspaceState`) |
| FR-10 | 예상 비용 | 모델별 단가(설정) × 토큰 → 월간 추정 |
| FR-11 | 대시보드 | 명령 `Agent K: Show Usage` → 웹뷰 차트 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 라우팅 결정 지연 | < 5ms (규칙 엔진 순수 로직) |
| NFR-02 | 폴백 전환 시간 | < 200ms (모델 전환 + 컨텍스트 재구성) |
| NFR-03 | 상태 지속성 | 세션 간 라우팅 히스토리 유지 (워크스페이스 상태) |
| NFR-04 | 동시성 제어 | 티어별 동시 요청 제한 (세마포어) |

---

## 4. API & Technical Spec

### 4.1 라우터 엔진 (`src/router/engine.ts`)

```typescript
export interface RoutingContext {
  userMessage: string;
  mode: 'ask' | 'agent' | 'plan' | 'debug';
  sessionHistory: RoutingEvent[];  // 최근 20턴
  currentTier: 'A' | 'B';
  consecutiveFailures: number;
  planApproved?: boolean;
  userForcedModel?: string;
}

export interface RoutingDecision {
  tier: 'A' | 'B';
  modelId: string;
  providerId: string;
  reason: string;
  fallback?: { tier: 'B'; modelId: string; trigger: string };
  metadata: { estimatedCost: number; maxTokens: number; contextWindow: number };
}

export class ModelRouter {
  constructor(
    private providerRegistry: ProviderRegistry,
    private config: RouterConfig
  ) {}

  decide(ctx: RoutingContext): RoutingDecision {
    // 1. 사용자 강제 지정 최우선
    if (ctx.userForcedModel) {
      const provider = this.providerRegistry.getByModel(ctx.userForcedModel);
      return this.buildDecision(provider, ctx.userForcedModel, 'User forced model');
    }

    // 2. Plan 모드 실행 단계
    if (ctx.mode === 'agent' && ctx.planApproved) {
      return this.selectTierB(ctx, 'Plan-approved execution');
    }

    // 3. 연속 실패
    if (ctx.consecutiveFailures >= 2) {
      return this.selectTierB(ctx, `Consecutive failures: ${ctx.consecutiveFailures}`);
    }

    // 4. 보안/복잡도 키워드
    const securityKeywords = ['auth', 'crypto', 'race condition', 'grpc', 'tls', 'oauth', 'jwt', 'sql injection'];
    if (securityKeywords.some(k => ctx.userMessage.toLowerCase().includes(k))) {
      return this.selectTierB(ctx, 'Security/complexity keyword detected');
    }

    // 5. 기본: Tier A
    return this.selectTierA(ctx);
  }

  private selectTierA(ctx: RoutingContext): RoutingDecision {
    const provider = this.providerRegistry.getBestAvailable('A');
    return this.buildDecision(provider, provider.defaultModel, 'Default Tier A (Flash)');
  }

  private selectTierB(ctx: RoutingContext, reason: string): RoutingDecision {
    const provider = this.providerRegistry.getBestAvailable('B');
    const fallback = this.providerRegistry.getBestAvailable('A'); // 역폴백 옵션
    return {
      ...this.buildDecision(provider, provider.defaultModel, reason),
      fallback: fallback ? { tier: 'A', modelId: fallback.defaultModel, trigger: 'Tier B unavailable' } : undefined,
    };
  }

  private buildDecision(provider: ProviderConfig, modelId: string, reason: string): RoutingDecision {
    const modelInfo = provider.models.find(m => m.id === modelId)!;
    return {
      tier: modelInfo.tier,
      modelId,
      providerId: provider.id,
      reason,
      metadata: {
        estimatedCost: this.estimateCost(modelInfo),
        maxTokens: modelInfo.defaultParams?.max_tokens || 8192,
        contextWindow: modelInfo.contextWindow,
      },
    };
  }
}
```

### 4.2 라우팅 훅 (에이전트 루프 연동) (`src/agent/routingHooks.ts`)

```typescript
// AgentLoop 실행 전 호출
export async function preTurnRoutingHook(loop: AgentLoop, userMessage: string): Promise<void> {
  const ctx = buildRoutingContext(loop, userMessage);
  const decision = router.decide(ctx);
  
  // 1. 모델/프로바이더 설정 적용
  loop.setModel(decision.modelId, decision.providerId);
  loop.setMaxTurns(decision.tier === 'A' ? 15 : 25);
  loop.setToolWhitelist(decision.tier === 'A' ? TIER_A_WHITELIST : TIER_B_WHITELIST);
  
  // 2. 시스템 프롬프트에 티어 정보 주입
  loop.injectSystemPrompt(`\n## Current Model: ${decision.modelId} (Tier ${decision.tier})\n${decision.fallback ? `Fallback: ${decision.fallback.modelId} on ${decision.fallback.trigger}` : ''}`);
  
  // 3. UI 상태 업데이트
  updateChatHeader(decision);
  
  // 4. 메트릭 기록
  recordRoutingDecision(ctx, decision);
}

// Tool 실행 후 실패 감지
export async function postToolRoutingHook(loop: AgentLoop, toolResult: ToolResult): Promise<void> {
  if (toolResult.error && isLintOrTestTool(toolResult.toolName)) {
    loop.incrementConsecutiveFailures();
    if (loop.getConsecutiveFailures() >= 2) {
      // 다음 턴에 Tier B로 승격 예약
      loop.scheduleTierUpgrade('B', 'Consecutive lint/test failures');
    }
  } else if (toolResult.toolName === 'edit_file' && toolResult.success) {
    loop.resetConsecutiveFailures(); // 성공 시 리셋
  }
}
```

### 4.3 Best-of-N 실행기 (`src/router/bestOfN.ts`)

```typescript
export interface BestOfNConfig {
  n: number;                    // 2~4
  modelVariants: string[];      // ['flash', 'pro'] 또는 ['flash-v1', 'flash-v2']
  promptVariants?: string[];    // 다른 시스템 프롬프트
  compareMetric: 'tests' | 'lint' | 'custom';
  customEvaluator?: (results: WorktreeResult[]) => number; // 점수 함수
}

export async function runBestOfN(task: string, config: BestOfNConfig): Promise<BestOfNResult> {
  const worktrees = await createWorktrees(config.n);
  
  const results = await Promise.all(
    worktrees.map(async (wt, i) => {
      const model = config.modelVariants[i % config.modelVariants.length];
      const prompt = config.promptVariants?.[i] || task;
      
      const session = await agentLoopManager.startSession({
        worktree: wt.path,
        model,
        initialMessage: prompt,
        maxTurns: 20,
      });
      
      const result = await session.runToCompletion();
      return { worktree: wt, model, result, score: 0 };
    })
  );

  // 평가
  for (const r of results) {
    r.score = await evaluateResult(r, config);
  }

  // 최고 점수 선택
  const best = results.sort((a, b) => b.score - a.score)[0];
  
  // 선택된 worktree 변경사항 메인 브랜치에 적용
  await applyWorktreeChanges(best.worktree);
  
  // 나머지 정리
  await cleanupWorktrees(worktrees.filter(w => w !== best.worktree));
  
  return { best, all: results };
}
```

---

## 5. UI/UX Specification

### 5.1 채팅 헤더 라우팅 표시
```
┌────────────────────────────────────────────────────────────────────┐
│  Model: deepseek-v4-flash  [Tier A]  💰 $0.0002  ⚡ 0.8s  ▼        │
│  ↳ Fallback: deepseek-v4-pro (Tier B) on 2x lint fail             │
│  ↳ Best-of-N: /best-of-n 3  (flash, pro, trt-llama)               │
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 사용량 대시보드 (`Agent K: Show Usage`)
```
┌─ Usage Dashboard (Last 30 days) ────────────────────────────────────┐
│  Total Requests: 1,247    Total Tokens: 4.2M    Est. Cost: $12.40  │
├────────────────────────────────────────────────────────────────────┤
│  TIER A (Flash)    ████████████████████████████████████████ 95%     │
│    Requests: 1,185  Tokens: 3.9M  Avg Latency: 0.9s                │
│    Errors: 12 (0.1%)  Fallbacks to Tier B: 8                       │
├────────────────────────────────────────────────────────────────────┤
│  TIER B (Pro)      ████  5%                                        │
│    Requests: 62  Tokens: 0.3M  Avg Latency: 2.1s                   │
│    Triggered by: Plan(40%), LintFail(30%), Security(20%), User(10%)│
├────────────────────────────────────────────────────────────────────┤
│  BEST-OF-N: 3 runs × 4 tasks = 12 runs  |  Win rate: Pro 60%       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Model Router

  Scenario: Default request uses Flash (Tier A)
    Given no special conditions
    When user sends "Explain this function"
    Then router selects deepseek-v4-flash (Tier A)
    And chat header shows "Tier A" with Flash model

  Scenario: Plan-approved task uses Pro (Tier B)
    Given user approved a Plan for "Refactor auth module"
    When Agent mode executes the plan
    Then router selects deepseek-v4-pro (Tier B)
    And maxTurns=25, full tool whitelist enabled

  Scenario: Consecutive lint failures trigger fallback
    Given agent edits file, lint fails
    And agent retries, lint fails again (2 consecutive)
    Then next turn router selects Tier B
    And reason logged: "Consecutive failures: 2"

  Scenario: Security keyword forces Tier B
    When user asks "Fix the race condition in payment processing"
    Then router selects Tier B immediately
    And reason: "Security/complexity keyword detected"

  Scenario: User forces model via mention
    When user types "@model:pro Refactor this class"
    Then router uses deepseek-v4-pro regardless of tier
    And next turn reverts to auto

  Scenario: Best-of-3 runs parallel worktrees
    When user runs "/best-of-n N=3 Implement feature X"
    Then 3 worktrees created
    And each runs with flash/pro/trt-llama variants
    And results compared on test pass rate
    And best applied to main branch

  Scenario: Usage dashboard shows tier split
    When user opens usage dashboard
    Then shows 95% Tier A, 5% Tier B
    And fallback triggers breakdown visible
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Harness-01_Model_Tiers.md` | 선행 | 티어 정의(A/B/C) |
| `PRD-Harness-12_Routing_Heuristics.md` | 선행 | 라우팅 규칙 상세 |
| `PRD-22_DGX_vLLM_Provider.md` | 선행 | 모델/엔드포인트 등록 |
| `PRD-13_Worktree_BestOfN.md` | 병행 | Best-of-N 실행 인프라 |
| `PRD-Tools-F_Orchestration_Extension.md` | 병행 | Best-of-N용 서브에이전트 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | 라우팅 규칙 엔진 + 티어별 화이트리스트 | `ModelRouter.decide()` |
| 2 | 에이전트 루프 훅 (pre-turn, post-tool) | 자동 티어 승강/강등 |
| 3 | 채팅 헤더 UI + 폴백 표시 | 실시간 라우팅 가시성 |
| 4 | Best-of-N worktree 실행기 | `/best-of-n` 명령 |
| 5 | 사용량 수집 + 대시보드 Webview | 비용/품질 모니터링 |
| 6 | 설정 파일(`.agentk/router-config.json`) | 팀 커스터마이징 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 폴백 루프 (A→B→A 반복) | 중간 | 동일 세션 내 동일 트리거 1회만 폴백, 쿨다운 5턴 |
| Pro 모델 동시성 초과 | 높음 | 세마포어(최대 2동시) + 큐잉, 대기 중 UI 표시 |
| 비용 추적 정확도 (토큰 카운트) | 낮음 | Provider 응답의 `usage` 필드 우선, 없으면 tiktoken 추정 |

---


## Out of Scope

- 본 도메인 외 범용 도구화 (Tools A–G에 억지 편입 금지)
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **B급: 모델 라우터 (Cost/Balance/Intelligence)**, **중급 모델용 하네스: 라우팅 휴리스틱 (Flash ↔ Pro)**
- Cursor Auto Router: https://cursor.sh/docs/router