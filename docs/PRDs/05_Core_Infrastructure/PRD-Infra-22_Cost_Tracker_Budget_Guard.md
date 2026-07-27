# PRD-Infra-22: Cost Tracker & Budget Guard (비용 추적 & 예산 가드)

> **Category**: Core Infrastructure  
> **Priority**: P1  
> **Phase**: C4 (Production hardening)  
> **관련 PRD**: `PRD-Spec-03_Context_Budget.md`, `PRD-Harness-11_Context_Rules.md`, `PRD-23_Model_Router.md`, `PRD-Infra-16_Telemetry_Observability.md`

---

## 1. Overview

### 목적
세션/턴/모델별 **토큰 사용량과 비용을 실시간 추적**하고, 설정된 예산 초과 시 **자동 차단/경고/티어 다운그레이드** 수행.

### 핵심 기능
| 기능 | 설명 |
|------|------|
| **실시간 토큰 계측** | 입력/출력/캐시/도구 결과 토큰 별도 집계 |
| **비용 계산** | 프로바이더별 가격표 기반 USD 환산 |
| **예산 가드** | 세션/일/월 단위 하드/소프트 리밋 |
| **자동 대응** | 소프트 리밋 → 경고, 하드 리밋 → 티어 다운/차단 |
| **투명한 리포팅** | 사용자에게 현재 비용/예상 비용 실시간 표시 |

---

## 2. Data Model

```typescript
// src/cost/CostTracker.ts

export interface TokenUsage {
  inputTokens: number;           // 사용자 메시지 + 시스템 프롬프트 + 컨텍스트
  outputTokens: number;          // 모델 생성 토큰
  cacheReadTokens?: number;      // 캐시 히트 (할인 적용)
  cacheWriteTokens?: number;     // 캐시 저장
  toolResultTokens: number;      // 도구 결과 토큰
  totalTokens: number;           // 합계
}

export interface TokenUsageBreakdown {
  byMessage: MessageTokenUsage[];
  byTool: ToolTokenUsage[];
  byTurn: TurnTokenUsage[];
}

export interface MessageTokenUsage {
  messageId: string;
  role: string;
  tokens: number;
  type: 'system' | 'user' | 'assistant' | 'tool';
}

export interface ToolTokenUsage {
  toolName: string;
  callCount: number;
  totalTokens: number;
  avgTokens: number;
}

export interface TurnTokenUsage {
  turnNumber: number;
  inputTokens: number;
  outputTokens: number;
  toolTokens: number;
  totalTokens: number;
  costUSD: number;
  model: string;
  tier: 'A' | 'B' | 'C';
}

export interface CostSnapshot {
  sessionId: string;
  timestamp: number;
  sessionTotal: SessionCost;
  dailyTotal: DailyCost;
  monthlyTotal: MonthlyCost;
  projectedSessionEnd: ProjectedCost;
}

export interface SessionCost {
  totalTokens: number;
  totalCostUSD: number;
  byTier: Record<'A' | 'B' | 'C', TierCost>;
  byModel: Record<string, ModelCost>;
  byTurn: TurnTokenUsage[];
}

export interface TierCost {
  tokens: number;
  costUSD: number;
  turnCount: number;
}

export interface ModelCost {
  tokens: number;
  costUSD: number;
  callCount: number;
}

export interface DailyCost {
  date: string;  // YYYY-MM-DD
  tokens: number;
  costUSD: number;
  sessionCount: number;
}

export interface MonthlyCost {
  month: string; // YYYY-MM
  tokens: number;
  costUSD: number;
  sessionCount: number;
}

export interface ProjectedCost {
  estimatedFinalTokens: number;
  estimatedFinalCostUSD: number;
  confidence: 'low' | 'medium' | 'high';
  basedOnTurns: number;
}
```

---

## 3. Pricing Engine

### 3.1 가격표 (2025년 기준, 정기 업데이트 필요)

```typescript
// src/cost/PricingTable.ts

export const MODEL_PRICING: Record<string, ModelPrice> = {
  // Tier A - Flash models
  'gemini-2.5-flash': { input: 0.075, output: 0.30, cacheRead: 0.01875, cacheWrite: 0.0375, per: 1_000_000 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30, cacheRead: 0.01875, cacheWrite: 0.0375, per: 1_000_000 },
  'gpt-4o-mini': { input: 0.15, output: 0.60, cacheRead: 0.075, per: 1_000_000 },
  'claude-3.5-haiku': { input: 0.25, output: 1.25, cacheRead: 0.0625, per: 1_000_000 },
  
  // Tier B - Pro models
  'gemini-1.5-pro': { input: 1.25, output: 5.00, cacheRead: 0.3125, cacheWrite: 0.625, per: 1_000_000 },
  'gpt-4o': { input: 2.50, output: 10.00, cacheRead: 1.25, per: 1_000_000 },
  'gpt-4o-2024-08-06': { input: 2.50, output: 10.00, cacheRead: 1.25, per: 1_000_000 },
  'claude-3.5-sonnet': { input: 3.00, output: 15.00, cacheRead: 0.75, per: 1_000_000 },
  'claude-3.5-sonnet-20241022': { input: 3.00, output: 15.00, cacheRead: 0.75, per: 1_000_000 },
  
  // Tier C - Local (비용 0)
  'local-llama': { input: 0, output: 0, per: 1_000_000 },
  'local-phi3': { input: 0, output: 0, per: 1_000_000 },
};

export interface ModelPrice {
  input: number;          // $ per million tokens
  output: number;
  cacheRead?: number;     // 캐시 읽기 할인
  cacheWrite?: number;    // 캐시 쓰기 비용
  per: number;            // 단위 (보통 1M)
}
```

### 3.2 비용 계산기

```typescript
// src/cost/CostCalculator.ts
export class CostCalculator {
  calculate(usage: TokenUsage, model: string): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) {
      console.warn(`Unknown model pricing: ${model}, using default`);
      return this.estimateUnknown(usage);
    }

    const units = usage.totalTokens / pricing.per;
    
    let cost = 0;
    cost += (usage.inputTokens / pricing.per) * pricing.input;
    cost += (usage.outputTokens / pricing.per) * pricing.output;
    
    if (usage.cacheReadTokens && pricing.cacheRead) {
      cost += (usage.cacheReadTokens / pricing.per) * pricing.cacheRead;
    }
    if (usage.cacheWriteTokens && pricing.cacheWrite) {
      cost += (usage.cacheWriteTokens / pricing.per) * pricing.cacheWrite;
    }
    
    // 도구 결과 토큰은 입력 토큰으로 간주 (다음 턴 컨텍스트에 포함)
    cost += (usage.toolResultTokens / pricing.per) * pricing.input;
    
    return Math.round(cost * 10000) / 10000;  // 4 decimal places
  }

  private estimateUnknown(usage: TokenUsage): number {
    // 알 수 없는 모델: Flash 티어 가격 적용
    const flashPrice = MODEL_PRICING['gemini-2.5-flash'];
    return (usage.totalTokens / flashPrice.per) * (flashPrice.input + flashPrice.output) / 2;
  }
}
```

---

## 4. Budget Guard

### 4.1 예산 설정

```typescript
// src/cost/BudgetGuard.ts

export interface BudgetConfig {
  // 세션 단위
  sessionHardLimitUSD?: number;      // 하드 리밋 (초과 시 즉시 중단)
  sessionSoftLimitUSD?: number;      // 소프트 리밋 (경고만)
  sessionWarningThresholdPct: number; // 소프트 리밋 대비 % (기본 80%)
  
  // 일 단위
  dailyHardLimitUSD?: number;
  dailySoftLimitUSD?: number;
  
  // 월 단위
  monthlyHardLimitUSD?: number;
  monthlySoftLimitUSD?: number;
  
  // 자동 대응
  autoDowngradeOnSoftLimit: boolean;   // 소프트 리밋 시 A 티어로 강제
  autoStopOnHardLimit: boolean;        // 하드 리밋 시 세션 중단
  notifyOnWarning: boolean;            // 경고 알림
}

export const DEFAULT_BUDGET: BudgetConfig = {
  sessionSoftLimitUSD: 0.50,
  sessionHardLimitUSD: 1.00,
  sessionWarningThresholdPct: 80,
  dailySoftLimitUSD: 5.00,
  dailyHardLimitUSD: 10.00,
  monthlySoftLimitUSD: 50.00,
  monthlyHardLimitUSD: 100.00,
  autoDowngradeOnSoftLimit: true,
  autoStopOnHardLimit: true,
  notifyOnWarning: true
};
```

### 4.2 가드 로직

```typescript
export class BudgetGuard {
  constructor(
    private config: BudgetConfig,
    private costTracker: CostTracker,
    private router: ModelRouter,
    private notifier: NotificationService
  ) {}

  // 턴 완료 후 호출
  async checkAndEnforce(sessionId: string): Promise<BudgetCheckResult> {
    const snapshot = await this.costTracker.getSnapshot(sessionId);
    const sessionCost = snapshot.sessionTotal.totalCostUSD;
    const dailyCost = snapshot.dailyTotal.costUSD;
    const monthlyCost = snapshot.monthlyTotal.costUSD;

    const results: BudgetCheckResult = {
      session: this.checkLimit('session', sessionCost, this.config.sessionSoftLimitUSD, this.config.sessionHardLimitUSD),
      daily: this.checkLimit('daily', dailyCost, this.config.dailySoftLimitUSD, this.config.dailyHardLimitUSD),
      monthly: this.checkLimit('monthly', monthlyCost, this.config.monthlySoftLimitUSD, this.config.monthlyHardLimitUSD),
      projected: this.checkProjected(snapshot)
    };

    // 조치 실행
    await this.enforceActions(sessionId, results);
    
    return results;
  }

  private checkLimit(
    scope: string, 
    current: number, 
    soft?: number, 
    hard?: number
  ): LimitCheckResult {
    if (hard && current >= hard) {
      return { scope, status: 'hard_exceeded', current, limit: hard, action: 'stop' };
    }
    if (soft && current >= soft) {
      return { scope, status: 'soft_exceeded', current, limit: soft, action: 'warn' };
    }
    if (soft && current >= soft * (this.config.sessionWarningThresholdPct / 100)) {
      return { scope, status: 'warning', current, limit: soft, action: 'notify' };
    }
    return { scope, status: 'ok', current, limit: soft };
  }

  private async enforceActions(sessionId: string, results: BudgetCheckResult): Promise<void> {
    const hardExceeded = Object.values(results).some(r => r.status === 'hard_exceeded');
    const softExceeded = Object.values(results).some(r => r.status === 'soft_exceeded');

    if (hardExceeded && this.config.autoStopOnHardLimit) {
      await this.router.forceTier('C');  // 로컬 모델로 강제 다운그레이드
      this.notifier.error('Budget hard limit reached. Session paused. Switching to local model.');
    } else if (softExceeded && this.config.autoDowngradeOnSoftLimit) {
      await this.router.forceTier('A');  // Flash 티어로 강제
      this.notifier.warning('Budget soft limit reached. Downgraded to Flash tier.');
    } else if (Object.values(results).some(r => r.status === 'warning')) {
      if (this.config.notifyOnWarning) {
        this.notifier.info(`Budget at ${this.config.sessionWarningThresholdPct}% of soft limit.`);
      }
    }
  }
}
```

---

## 5. UI Integration

### 5.1 상태 바 표시

```typescript
// src/ui/CostStatusBar.ts
export class CostStatusBar {
  private item: vscode.StatusBarItem;

  update(snapshot: CostSnapshot): void {
    const sessionCost = snapshot.sessionTotal.totalCostUSD;
    const dailyCost = snapshot.dailyTotal.costUSD;
    const projected = snapshot.projectedSessionEnd.estimatedFinalCostUSD;
    
    // 색상 결정
    let color = 'white';
    if (sessionCost > 0.80) color = 'error';      // 빨강
    else if (sessionCost > 0.40) color = 'warning'; // 노랑
    
    this.item.text = `$(dollar) $${sessionCost.toFixed(4)} / $${projected.toFixed(4)} proj`;
    this.item.tooltip = new vscode.MarkdownString(
      `**Session**: $${sessionCost.toFixed(4)}\n` +
      `**Projected**: $${projected.toFixed(4)}\n` +
      `**Today**: $${dailyCost.toFixed(2)}\n` +
      `**This Month**: $${snapshot.monthlyTotal.costUSD.toFixed(2)}`
    );
    this.item.color = color;
    this.item.show();
  }
}
```

### 5.2 상세 패널 (명령어: `agent-k.showCostDetails`)

```markdown
## Session Cost Breakdown

| Tier | Model | Turns | Tokens | Cost |
|------|-------|-------|--------|------|
| A | gemini-2.5-flash | 12 | 45,230 | $0.0123 |
| B | gpt-4o | 3 | 28,100 | $0.0892 |
| **Total** | | **15** | **73,330** | **$0.1015** |

### Per-Turn Detail
| Turn | Model | In | Out | Tools | Cost |
|------|-------|-----|-----|-------|------|
| 1 | gemini-2.5-flash | 2,100 | 450 | 0 | $0.0002 |
| 2 | gpt-4o | 3,200 | 1,100 | 2,300 | $0.0185 |
| ... | | | | | |

### Budget Status
- **Session**: $0.10 / $1.00 (10%) ✅
- **Daily**: $2.45 / $10.00 (24%) ✅
- **Monthly**: $18.30 / $100.00 (18%) ✅

[Export CSV] [Reset Session] [Adjust Budget]
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Cost Tracker & Budget Guard

  Scenario: Token usage tracked per turn
    Given a session with 3 turns
    When turn 1 uses gemini-2.5-flash (1000 in, 500 out)
    And turn 2 uses gpt-4o (2000 in, 1000 out, 500 tool)
    And turn 3 uses gemini-2.5-flash (1500 in, 300 out)
    Then session total tokens = 5300
    And session cost = $0.0002 + $0.0065 + $0.0001 = $0.0068
    And breakdown shows per-model, per-turn detail

  Scenario: Soft limit triggers warning
    Given sessionSoftLimitUSD = 0.50
    And sessionWarningThresholdPct = 80
    When session cost reaches $0.40
    Then warning notification shown
    And status bar turns yellow
    But session continues

  Scenario: Soft limit triggers auto-downgrade
    Given sessionSoftLimitUSD = 0.50
    And autoDowngradeOnSoftLimit = true
    When session cost reaches $0.50
    Then router forced to Tier A only
    And warning notification shown
    And status bar turns orange

  Scenario: Hard limit stops session
    Given sessionHardLimitUSD = 1.00
    And autoStopOnHardLimit = true
    When session cost reaches $1.00
    Then session paused
    And router forced to Tier C (local)
    And error notification shown
    And user must acknowledge to continue

  Scenario: Daily/Monthly limits tracked separately
    Given multiple sessions today
    When daily total exceeds dailySoftLimitUSD
    Then daily warning shown
    But individual sessions continue if under session limit

  Scenario: Cost projection shown in UI
    Given session at turn 5 of estimated 20
    When cost panel opened
    Then projected final cost shown with confidence
    And based on average cost per turn so far

  Scenario: Local model costs zero
    Given Tier C local model used
    When tokens consumed
    Then cost = $0.00
    And budget unaffected
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 7. References

- `PRD-Spec-03_Context_Budget.md` — 토큰 예산과 연동
- `PRD-Harness-11_Context_Rules.md` — A-Tier 예산 수치
- `PRD-23_Model_Router.md` — 티어 강제 다운그레이드 연동
- `PRD-Infra-16_Telemetry_Observability.md` — 비용 메트릭 익스포트
- LiteLLM Pricing: https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json