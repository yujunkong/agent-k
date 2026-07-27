# PRD-23b: 모델 라우터 A/B 티어 상세 (Model Router A/B Tier Details)

> **Priority**: B급 (라우터 핵심 로직 상세화)  
> **Phase**: C4~C5  
> **관련 PRD**: `PRD-23_Model_Router.md`, `PRD-Harness-01_Model_Tiers.md`, `PRD-Harness-12_Routing_Heuristics.md`

---

## 1. Overview

`PRD-23_Model_Router.md`의 **티어별 모델 매핑, 폴백 체인, 비용 계산, 동시성 제어**를 구현 가능한 수준으로 상세화한다. 특히 **DGX 2대(vLLM + TRT-LLM)** 환경에서 Flash/Pro/TRT 모델을 어떻게 배분할지 정의한다.

---

## 2. Tier Model Registry (티어별 모델 레지스트리)

### 2.1 모델 메타데이터 스키마

```typescript
export interface TierModel {
  id: string;                      // 고유 ID: 'flash', 'pro', 'trt-70b'
  tier: 'A' | 'B';                 // A=기본(Flash급), B=강력(Pro/TRT)
  providerId: string;              // 'dgx-vllm', 'dgx-trtllm'
  modelName: string;               // 서버에 등록된 모델명
  displayName: string;             // UI 표시명
  contextWindow: number;           // 최대 컨텍스트 토큰
  defaultParams: ModelParams;      // temperature, max_tokens 등
  pricing: PricingInfo;            // 비용 계산용
  capabilities: ModelCapabilities; // tool_calling, vision, json_mode 등
  concurrencyLimit: number;        // 동시 요청 제한
  healthCheckEndpoint: string;     // '/health' 또는 '/v1/models'
  tags: string[];                  // ['flash', 'daily', 'fast'] 등
}

export interface ModelCapabilities {
  toolCalling: boolean;
  parallelToolCalls: boolean;
  vision: boolean;
  jsonMode: boolean;
  streaming: boolean;
  systemPrompt: boolean;
}

export interface PricingInfo {
  inputPer1k: number;   // $ per 1k input tokens (로컬은 0)
  outputPer1k: number;  // $ per 1k output tokens
  currency: 'USD';
  note?: string;        // 'Local GPU, electricity only'
}
```

### 2.2 DGX 2대 구성 예시 (설정 파일)

```json
// .agentk/model-registry.json
{
  "models": [
    {
      "id": "flash",
      "tier": "A",
      "providerId": "dgx-vllm-1",
      "modelName": "deepseek-v4-flash",
      "displayName": "DeepSeek V4 Flash",
      "contextWindow": 8192,
      "defaultParams": { "temperature": 0.1, "max_tokens": 8192 },
      "pricing": { "inputPer1k": 0, "outputPer1k": 0, "currency": "USD", "note": "Local DGX" },
      "capabilities": { "toolCalling": true, "parallelToolCalls": false, "vision": false, "jsonMode": true, "streaming": true, "systemPrompt": true },
      "concurrencyLimit": 8,
      "healthCheckEndpoint": "/health",
      "tags": ["flash", "daily", "fast", "tier-a"]
    },
    {
      "id": "pro",
      "tier": "B",
      "providerId": "dgx-vllm-1",
      "modelName": "deepseek-v4-pro",
      "displayName": "DeepSeek V4 Pro",
      "contextWindow": 32768,
      "defaultParams": { "temperature": 0.2, "max_tokens": 16384 },
      "pricing": { "inputPer1k": 0, "outputPer1k": 0, "currency": "USD", "note": "Local DGX" },
      "capabilities": { "toolCalling": true, "parallelToolCalls": true, "vision": false, "jsonMode": true, "streaming": true, "systemPrompt": true },
      "concurrencyLimit": 2,
      "healthCheckEndpoint": "/health",
      "tags": ["pro", "complex", "tier-b"]
    },
    {
      "id": "trt-70b",
      "tier": "B",
      "providerId": "dgx-trtllm-1",
      "modelName": "trt-llama-3.1-70b",
      "displayName": "TRT-LLM Llama-3.1-70B",
      "contextWindow": 32768,
      "defaultParams": { "temperature": 0.2, "max_tokens": 16384 },
      "pricing": { "inputPer1k": 0, "outputPer1k": 0, "currency": "USD", "note": "Local DGX TRT-LLM" },
      "capabilities": { "toolCalling": true, "parallelToolCalls": true, "vision": false, "jsonMode": true, "streaming": true, "systemPrompt": true },
      "concurrencyLimit": 2,
      "healthCheckEndpoint": "/health",
      "tags": ["trt", "llama", "high-throughput", "tier-b"]
    }
  ],
  "providers": [
    { "id": "dgx-vllm-1", "name": "DGX-1 vLLM", "baseUrl": "https://dgx-1.internal/v1", "type": "vllm" },
    { "id": "dgx-trtllm-1", "name": "DGX-2 TRT-LLM", "baseUrl": "https://dgx-2.internal/v1", "type": "trtllm" }
  ]
}
```

---

## 3. Fallback Chain (폴백 체인) 상세

### 3.1 폴백 우선순위 매트릭스

| 현재 티어 | 트리거 | 1차 폴백 | 2차 폴백 | 비고 |
|-----------|--------|----------|----------|------|
| **A (Flash)** | 연속 lint/test 실패 2회 | **B (Pro)** | **B (TRT-70B)** | 동일 DGX-1 vLLM 우선 |
| **A (Flash)** | JSON 파싱 3회 실패 | **B (Pro)** | — | 모델 교체 제안 |
| **A (Flash)** | 보안/복잡도 키워드 | **B (Pro)** | **B (TRT-70B)** | 강제 승격 |
| **A (Flash)** | Plan 승인 후 실행 | **B (Pro)** | **B (TRT-70B)** | 실행 단계만 |
| **B (Pro)** | Pro 과부하(동시 2개 초과) | **B (TRT-70B)** | **A (Flash)** | 역폴백 허용 |
| **B (TRT-70B)** | TRT 과부하 | **B (Pro)** | **A (Flash)** | — |

### 3.2 폴백 실행 규칙

```typescript
export class FallbackChain {
  private readonly chains: Map<'A' | 'B', FallbackStep[]> = new Map([
    ['A', [
      { targetTier: 'B', preferredModelIds: ['pro', 'trt-70b'], reason: 'Upgrade for quality' },
    ]],
    ['B', [
      { targetTier: 'B', preferredModelIds: ['trt-70b', 'pro'], reason: 'Load balance' },
      { targetTier: 'A', preferredModelIds: ['flash'], reason: 'Last resort' },
    ]],
  ]);

  async getFallback(currentTier: 'A' | 'B', trigger: FallbackTrigger): Promise<FallbackResult> {
    const chain = this.chains.get(currentTier) || [];
    
    for (const step of chain) {
      const available = await this.getAvailableModels(step.targetTier, step.preferredModelIds);
      if (available.length > 0) {
        const selected = this.selectBest(available, step);
        return {
          success: true,
          newTier: step.targetTier,
          modelId: selected.id,
          providerId: selected.providerId,
          reason: `${trigger} → ${step.reason}`,
        };
      }
    }
    return { success: false, reason: 'No fallback available' };
  }

  private async getAvailableModels(tier: 'A' | 'B', preferred: string[]): Promise<TierModel[]> {
    const models = this.registry.getByTier(tier);
    // 1. 선호도 순 정렬
    // 2. 헬스체크 통과만
    // 3. 동시성 제한 미만만
    return models
      .sort((a, b) => preferred.indexOf(a.id) - preferred.indexOf(b.id))
      .filter(m => m.health === 'healthy' && m.currentConcurrency < m.concurrencyLimit);
  }
}
```

---

## 4. Cost Estimation (비용 계산) - 로컬 GPU 기준

### 4.1 비용 모델 (전력비 중심)

```typescript
export interface CostModel {
  gpuType: 'H100' | 'A100' | 'A10G';
  gpuCount: number;
  powerDrawW: number;           // GPU 1장당 전력 (H100 ≈ 700W)
  electricityRate: number;      // $/kWh (한국 산업용 ≈ $0.10)
  utilizationTarget: number;    // 0.7 (70% 목표 가동률)
  amortizationMonths: 36;       // 감가상각 기간
  gpuCost: number;              // GPU 구매가 (H100 ≈ $30,000)
}

export function estimateCost(model: TierModel, tokens: { input: number; output: number }, costModel: CostModel): number {
  // 1. 토큰당 연산량 추정 (대략적)
  const flopsPerToken = estimateFlopsPerToken(model.id); // Flash ≈ 1e12, Pro ≈ 5e12
  
  // 2. 총 FLOPS
  const totalFlops = (tokens.input + tokens.output) * flopsPerToken;
  
  // 3. GPU 시간 (초) = FLOPS / (GPU TFLOPS * 이용률)
  const gpuTflops = getGpuTflops(costModel.gpuType); // H100 FP8 ≈ 2000 TFLOPS
  const gpuSeconds = totalFlops / (gpuTflops * 1e12 * costModel.utilizationTarget);
  
  // 4. 전력비 + 감가상각비
  const powerKwh = (costModel.powerDrawW * costModel.gpuCount * gpuSeconds) / 3600 / 1000;
  const electricityCost = powerKwh * costModel.electricityRate;
  const depreciationPerSec = (costModel.gpuCost * costModel.gpuCount) / (costModel.amortizationMonths * 30 * 24 * 3600);
  const depreciationCost = depreciationPerSec * gpuSeconds;
  
  return electricityCost + depreciationCost;
}

// 대략적 단가 (H100 8장, 전기비 $0.10/kWh 기준)
const COST_PER_1K_TOKENS = {
  'flash': { input: 0.000001, output: 0.000002 }, // $0.001/1M tokens
  'pro':   { input: 0.000005, output: 0.000010 }, // $0.005/1M tokens
  'trt-70b': { input: 0.000008, output: 0.000015 },
};
```

### 4.2 사용량 리포트 스키마

```typescript
export interface UsageReport {
  period: { start: Date; end: Date };
  totals: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    avgLatencyMs: number;
  };
  byTier: {
    A: TierUsage;
    B: TierUsage;
  };
  byModel: Record<string, ModelUsage>;
  fallbackStats: {
    totalFallbacks: number;
    byTrigger: Record<string, number>;
    successRate: number;
  };
  bestOfNStats: {
    runs: number;
    tasks: number;
    winRateByModel: Record<string, number>;
  };
}
```

---

## 5. Concurrency Control (동시성 제어)

### 5.1 티어별 세마포어

```typescript
export class TierConcurrencyManager {
  private semaphores: Map<string, Semaphore> = new Map();
  
  constructor(private registry: ModelRegistry) {
    for (const model of registry.getAll()) {
      this.semaphores.set(model.id, new Semaphore(model.concurrencyLimit));
    }
  }

  async acquire(modelId: string, timeoutMs = 30000): Promise<ReleaseFn> {
    const sem = this.semaphores.get(modelId);
    if (!sem) throw new Error(`No semaphore for model ${modelId}`);
    
    const acquired = await sem.acquire(timeoutMs);
    if (!acquired) throw new Error(`Concurrency limit reached for ${modelId}`);
    
    this.registry.incrementConcurrency(modelId);
    return () => {
      this.registry.decrementConcurrency(modelId);
      sem.release();
    };
  }
}
```

### 5.2 동시성 대기 UI

```
⏳ Waiting for Pro slot... (1/2 running)
   Queue position: 2
   Estimated wait: ~45s
   [Cancel]  [Fallback to Flash]
```

---

## 6. Acceptance Criteria (티어/라우팅 상세)

```gherkin
Feature: Tier Model Registry and Fallback

  Scenario: Model registry loads from config
    Given .agentk/model-registry.json with 3 models (flash, pro, trt-70b)
    When extension activates
    Then registry has 3 models with correct tier/tags
    And concurrency limits set (flash=8, pro=2, trt=2)

  Scenario: Flash → Pro fallback on lint failure
    Given current model is flash (Tier A)
    And agent runs lint, fails
    And agent retries, lint fails again (2 consecutive)
    When next turn starts
    Then router selects pro (Tier B)
    And chat header shows "Tier B (fallback: lint failures)"

  Scenario: Pro overload falls back to TRT-70B
    Given 2 Pro requests running (concurrency limit=2)
    And 3rd request needs Tier B
    When router checks availability
    Then selects trt-70b (Tier B, different provider)
    And reason: "Load balance"

  Scenario: Cost estimation matches expected
    Given 1000 requests, 500 input + 500 output tokens each
    When usage report generated
    Then Tier A cost ≈ $0.0015, Tier B cost ≈ $0.0075
    And total ≈ $0.009 (electricity + depreciation only)

  Scenario: Concurrency limit enforced
    Given flash concurrency limit = 2 (for test)
    When 3 parallel requests sent to flash
    Then 2 acquire semaphore immediately
    And 3rd waits, shows queue UI
    And after 1 completes, 3rd acquires
```

---

## 7. Implementation Checklist

| 항목 | 구현 파일 | 테스트 |
|------|-----------|--------|
| 모델 레지스트리 로드 | `src/router/registry.ts` | JSON 스키마 검증 |
| 티어별 화이트리스트 | `src/router/whitelist.ts` | 단위 테스트 |
| 폴백 체인 실행 | `src/router/fallback.ts` | 통합 테스트 |
| 동시성 세마포어 | `src/router/concurrency.ts` | 부하 테스트 (100 병렬) |
| 비용 계산기 | `src/router/cost.ts` | 단위 테스트 (골든 마스터) |
| 사용량 대시보드 | `src/views/usageDashboard.ts` | 스냅샷 테스트 |
| 라우팅 훅 연동 | `src/agent/routingHooks.ts` | E2E 시나리오 |

---


## Out of Scope

- 본 도메인 외 범용 도구화 (Tools A–G에 억지 편입 금지)
- 상세: `00_Master_Context.md` Non-Goals

## 8. References

- `PRD-23_Model_Router.md` (상위 PRD)
- `PRD-Harness-12_Routing_Heuristics.md` (라우팅 휴리스틱 원본)
- DGX H100 스펙: https://www.nvidia.com/en-us/data-center/h100/