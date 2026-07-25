# PRD-Infra-14: Tool Call Orchestration (도구 호출 오케스트레이션)

> **Category**: Core Infrastructure  
> **Priority**: P0  
> **Phase**: C4  
> **관련 PRD**: `PRD-Infra-04_Tool_Registry.md`, `PRD-Infra-08_Parallel_Serial_Policy.md`, `PRD-Infra-07_Streaming_Tool_Executor.md`

---

## 1. Overview

### 목적
에이전트가 도구를 호출할 때 **의도-실행-검증-복구** 전 과정을 오케스트레이션한다. 병렬/직렬 정책, 타임아웃, 재시도, 체크포인트 연동을 단일 진입점에서 처리.

### 핵심 책임
1. **Intent Validation**: 호출 전 스키마/권한/예산 검증
2. **Execution Dispatch**: 병렬/직렬 정책에 따른 실행 분기
3. **Result Verification**: 결과 스키마 검증 + 하네스 검증 루프 연동
4. **Recovery Orchestration**: 실패 시 재시도/롤백/대체 도구 자동 선택

---

## 2. Architecture

### 2.1 오케스트레이터 인터페이스

```typescript
// src/infra/toolOrchestrator.ts
export interface ToolOrchestrator {
  execute(intent: ToolIntent, context: OrchestrationContext): Promise<OrchestrationResult>;
}

export interface ToolIntent {
  toolName: string;
  args: Record<string, unknown>;
  metadata?: {
    idempotencyKey?: string;      // 멱등성 키
    expectedDurationMs?: number;  // 예상 소요 시간
    criticality?: 'low' | 'medium' | 'high';  // 실패 영향도
    verificationRequired?: boolean;
  };
}

export interface OrchestrationContext {
  sessionId: string;
  turnNumber: number;
  checkpointId?: string;
  budget: TokenBudget;
  parallelPolicy: ParallelPolicy;
  hooks: HookRegistry;
}

export interface OrchestrationResult {
  success: boolean;
  result?: ToolResult;
  error?: OrchestrationError;
  verification?: VerificationResult;
  checkpointCreated?: string;
  metrics: OrchestrationMetrics;
}
```

### 2.2 실행 파이프라인

```
ToolIntent
    │
    ▼
┌─────────────────────────────────────┐
│ 1. PRE-FLIGHT CHECKS                │
│    ├─ Schema validation (Zod)       │
│    ├─ Permission check (auto-run?)  │
│    ├─ Budget check (tokens, time)   │
│    └─ Idempotency check             │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 2. PRE-EXECUTION HOOKS              │
│    ├─ onToolCallStart               │
│    ├─ prefetch hints                │
│    └─ checkpoint (if critical)      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 3. EXECUTION (Policy-driven)        │
│    ├─ PARALLEL: Promise.all()       │
│    ├─ SERIAL: sequential await      │
│    └─ StreamingToolExecutor         │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 4. POST-EXECUTION                   │
│    ├─ Result schema validation      │
│    ├─ Verification micro-loop       │
│    ├─ onToolCallEnd hooks           │
│    └─ Checkpoint (if success)       │
└─────────────────────────────────────┘
    │
    ▼
OrchestrationResult
```

---

## 3. Parallel/Serial Policy Integration

### 3.1 정책 결정 로직

```typescript
// src/infra/parallelPolicy.ts
export function decideExecutionPolicy(
  intents: ToolIntent[],
  context: OrchestrationContext
): ExecutionPlan {
  // 1. 명시적 병렬 그룹 (사용자/프롬프트 지정)
  const explicitGroups = groupByParallelHint(intents);
  if (explicitGroups.length > 1) {
    return { type: 'parallel-groups', groups: explicitGroups };
  }

  // 2. 도구 카테고리 기반 자동 결정
  const categories = intents.map(i => getToolCategory(i.toolName));
  
  // 읽기 전용 도구들 → 병렬
  if (categories.every(c => c === 'read')) {
    return { type: 'parallel', intents };
  }

  // 쓰기 도구 포함 → 직렬 (충돌 방지)
  if (categories.some(c => c === 'write')) {
    return { type: 'serial', intents };
  }

  // 혼합 → 읽기 병렬 후 쓰기 직렬
  const reads = intents.filter(i => getToolCategory(i.toolName) === 'read');
  const writes = intents.filter(i => getToolCategory(i.toolName) === 'write');
  
  return { 
    type: 'mixed', 
    phases: [
      { type: 'parallel', intents: reads },
      { type: 'serial', intents: writes }
    ]
  };
}
```

### 3.2 실행 플랜 타입

```typescript
type ExecutionPlan = 
  | { type: 'parallel'; intents: ToolIntent[] }
  | { type: 'serial'; intents: ToolIntent[] }
  | { type: 'parallel-groups'; groups: ToolIntent[][] }
  | { type: 'mixed'; phases: ExecutionPhase[] };

type ExecutionPhase = 
  | { type: 'parallel'; intents: ToolIntent[] }
  | { type: 'serial'; intents: ToolIntent[] };
```

---

## 4. Verification Integration

### 4.1 검증 마이크로루프 연동

```typescript
// 검증 필요 도구: write_file, apply_patch, terminal, search_replace
const VERIFICATION_REQUIRED_TOOLS = new Set([
  'write_file', 'apply_patch', 'search_replace', 'terminal'
]);

async function runVerificationLoop(
  intent: ToolIntent,
  result: ToolResult,
  context: OrchestrationContext
): Promise<VerificationResult> {
  if (!intent.metadata?.verificationRequired) return { passed: true };
  
  const verifier = context.verificationEngine;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    const verification = await verifier.verify(intent, result, context);
    
    if (verification.passed) return verification;
    
    // 실패 시: 수정 제안 → 재실행 → 재검증
    const fixIntent = await verifier.suggestFix(verification, context);
    if (!fixIntent) break;
    
    const fixResult = await executeTool(fixIntent, context);
    if (!fixResult.success) break;
    
    result = fixResult;
    attempts++;
  }
  
  return { passed: false, attempts, lastError: verification.error };
}
```

---

## 5. Recovery Strategies

| 실패 유형 | 전략 | 조건 |
|-----------|------|------|
| **Schema validation error** | 인수 수정 재시도 (1회) | LLM이 인수 오류 명백 |
| **Permission denied** | 사용자 확인 요청 | auto-run=false |
| **Timeout** | 타임아웃 2배 연장 재시도 (1회) | criticality !== 'high' |
| **Tool execution error** | 대체 도구 제안 (grep→search) | 대안 도구 존재 |
| **Verification failed** | Fix 제안 → 재실행 (최대 3회) | verificationRequired=true |
| **Critical failure** | 체크포인트 롤백 + 사용자 알림 | criticality='high' |

---

## 6. Acceptance Criteria

```gherkin
Feature: Tool Call Orchestration

  Scenario: Parallel read tools execute concurrently
    Given 3 read_file intents for different files
    When orchestration executes
    Then all 3 execute in parallel
    And total time ≈ max(individual times)
    And results returned in order

  Scenario: Write tools execute serially
    Given write_file then apply_patch intents
    When orchestration executes
    Then write_file completes before apply_patch starts
    And checkpoint created after each

  Scenario: Verification loop fixes failed patch
    Given apply_patch returns malformed result
    When verification runs
    Then fix suggested (correct line numbers)
    And re-execution attempted
    And max 3 attempts before escalation

  Scenario: Timeout recovery
    Given grep takes >30s (timeout)
    When timeout occurs
    Then timeout doubled to 60s
    And re-execution attempted once
    And failure reported if still timeout

  Scenario: Critical failure triggers rollback
    Given critical write_file fails mid-operation
    When failure detected
    Then checkpoint rollback executed
    And user notified with diff
    And session paused for decision
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 7. References

- `PRD-Infra-04_Tool_Registry.md` — 도구 레지스트리/스키마
- `PRD-Infra-08_Parallel_Serial_Policy.md` — 병렬/직렬 정책 상세
- `PRD-Infra-07_Streaming_Tool_Executor.md` — 스트리밍 실행기
- `PRD-Infra-09_Checkpoints_Rollback.md` — 체크포인트/롤백
- `PRD-Harness-10_Verification_MicroLoop.md` — 검증 마이크로루프