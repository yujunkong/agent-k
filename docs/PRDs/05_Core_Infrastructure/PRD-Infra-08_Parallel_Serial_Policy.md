# PRD-Infra-08: Parallel / Serial Policy (병렬/직렬 실행 정책)

> **Category**: Core Infrastructure  
> **Phase**: C1 (Ask 모드부터) ~ C3 (멀티턴 완성)  
> **관련 PRD**: `PRD-C1_Ask_Mode.md`, `PRD-C3_Agent_MultiTurn.md`, `PRD-07_Parallel_File_Search.md`, `PRD-Infra-07_Streaming_Tool_Executor.md`

---

## 1. Overview

### 목적
도구 호출을 **읽기 전용(병렬 허용)** vs **쓰기/터미널/네트워크(직렬 필수)**로 분류해, **동시성 제어**와 **순서 보장**을 자동화한다. `p-limit` 스타일 동시성 제한으로 리소스 보호 + 결정적 실행 순서 보장.

### 비즈니스 가치
- **성능**: 읽기 도구 16개 동시 실행으로 탐색 5~10배 가속
- **안전성**: 쓰기/터미널 순서 보장, 레이스 컨디션 방지
- **예측 가능**: 결정적 실행 순서로 디버깅/재현 용이

---

## 2. Functional Requirements

### 2.1 도구 분류 (Registry 메타데이터 기반)
| 분류 | 도구 예시 | 동시성 | 순서 보장 | 비고 |
|------|-----------|--------|-----------|------|
| **readonly** | `grep`, `glob`, `list_dir`, `read_file`, `codebase_search`, `lsp_*`, `web_search`, `web_fetch` | **병렬** (기본 16) | 불필요 | 부작용 없음, 멱등 |
| **write** | `edit_file`, `write_file`, `apply_patch`, `reapply` | **직렬** (1) | **호출 순서** | 파일 단위 락, 라인 번호 드리프트 방지 |
| **destructive** | `delete_file`, `chmod`, `rm` | **직렬** (1) | **호출 순서** | 추가 확인, 롤백 불가능 |
| **exec** | `run_terminal_cmd` | **직렬** (1) | **호출 순서** | 상태ful(파이프, CWD), 포트 충돌 방지 |
| **network** | `web_search`, `web_fetch`, `browser_*` | **제한 병렬** (4) | 불필요 | 레이트 리밋, 타임아웃 관리 |
| **orchestrate** | `task`, `subagent`, `ask_user` | **직렬** (1) | **호출 순서** | 서브에이전트 완료 대기 |

### 2.2 동시성 제한 설정
```typescript
export const CONCURRENCY_LIMITS = {
  readonly: 16,      // p-limit(16)
  network: 4,        // p-limit(4) - 레이트 리밋 고려
  write: 1,          // 순차
  exec: 1,           // 순차
  destructive: 1,    // 순차
  orchestrate: 1,    // 순차
} as const;
```

### 2.3 실행 정책 엔진
```typescript
export class ExecutionPolicyEngine {
  constructor(private limits: ConcurrencyLimits) {}
  
  async executeBatch(calls: ToolCall[], ctx: ToolContext): Promise<ToolResult[]> {
    const readonlyCalls = calls.filter(c => this.registry.isReadOnly(c.name));
    const writeCalls = calls.filter(c => this.registry.isWriteTool(c.name) && !this.registry.isDestructive(c.name));
    const destructiveCalls = calls.filter(c => this.registry.isDestructive(c.name));
    const execCalls = calls.filter(c => c.name === 'run_terminal_cmd');
    const networkCalls = calls.filter(c => this.registry.isNetworkTool(c.name));
    const orchestrateCalls = calls.filter(c => this.registry.isOrchestrateTool(c.name));
    
    // 1. 읽기: 병렬
    const readonlyResults = await pLimit(this.limits.readonly)(
      readonlyCalls.map(c => () => this.execute(c))
    );
    
    // 2. 네트워크: 제한 병렬
    const networkResults = await pLimit(this.limits.network)(
      networkCalls.map(c => () => this.execute(c))
    );
    
    // 3. 쓰기/실행/파괴적/오케스트레이션: 순차 (호출 순서 유지)
    const sequentialCalls = [...writeCalls, ...execCalls, ...destructiveCalls, ...orchestrateCalls];
    const sequentialResults = [];
    for (const call of sequentialCalls) {
      sequentialResults.push(await this.execute(call));
    }
    
    // 결과 순서 복원 (원래 호출 순서대로)
    return this.mergeResultsInOrder(calls, {
      readonly: readonlyResults,
      network: networkResults,
      sequential: sequentialResults,
    });
  }
}
```

### 2.4 파일 단위 락 (Write 도구)
```typescript
class FileLockManager {
  private locks = new Map<string, Promise<void>>();
  
  async acquire(filePath: string): Promise<() => void> {
    const existing = this.locks.get(filePath);
    if (existing) await existing;  // 이전 작업 완료 대기
    
    let release: () => void;
    const promise = new Promise<void>(resolve => { release = resolve; });
    this.locks.set(filePath, promise);
    return release;
  }
  
  // edit_file 실행 전 호출
  async withFileLock(filePath: string, fn: () => Promise<ToolResult>): Promise<ToolResult> {
    const release = await this.acquire(filePath);
    try {
      return await fn();
    } finally {
      release();
      this.locks.delete(filePath);
    }
  }
}
```

---

## 3. Technical Spec

### 3.1 실행기 통합 (`src/agent/executor.ts`)

```typescript
export class ToolExecutor {
  private policyEngine = new ExecutionPolicyEngine(CONCURRENCY_LIMITS);
  private fileLocks = new FileLockManager();
  
  async executeToolCalls(calls: ToolCall[], ctx: ToolContext): Promise<ToolResult[]> {
    // 1. 도구 분류
    const classification = this.classifyCalls(calls);
    
    // 2. 병렬 읽기 실행
    const readonlyResults = await this.executeParallel(
      classification.readonly,
      ctx,
      this.concurrencyLimits.readonly
    );
    
    // 3. 네트워크 제한 병렬
    const networkResults = await this.executeParallel(
      classification.network,
      ctx,
      this.concurrencyLimits.network
    );
    
    // 4. 순차 실행 (쓰기/실행/파괴적/오케스트레이션)
    const sequentialCalls = [
      ...classification.write,
      ...classification.exec,
      ...classification.destructive,
      ...classification.orchestrate,
    ];
    
    const sequentialResults = [];
    for (const call of sequentialCalls) {
      // 파일 락 적용 (쓰기 도구)
      if (this.registry.isWriteTool(call.name)) {
        const filePath = call.args.path;
        const result = await this.fileLocks.withFileLock(filePath, () => 
          this.executeWithApproval(call, ctx)
        );
        sequentialResults.push(result);
      } else {
        sequentialResults.push(await this.executeWithApproval(call, ctx));
      }
    }
    
    // 5. 원래 호출 순서대로 결과 병합
    return this.mergeResultsInOriginalOrder(calls, {
      readonly: readonlyResults,
      network: networkResults,
      sequential: sequentialResults,
    });
  }
  
  private async executeParallel(
    calls: ToolCall[],
    ctx: ToolContext,
    limit: number
  ): Promise<ToolResult[]> {
    return pLimit(limit)(calls.map(call => () => this.execute(call, ctx)));
  }
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Parallel/Serial Execution Policy

  Scenario: 10 grep calls execute in parallel
    Given 10 grep calls in single turn
    When executed
    Then all 10 run in parallel (max 16 concurrent)
    And total time ≈ slowest single grep (not sum)

  Scenario: 5 edit_file calls execute sequentially
    Given 5 edit_file calls on different files in one turn
    When executed
    Then each waits for previous to complete
    And file locks prevent concurrent edits to same file
    And total time ≈ sum of individual edit times

  Scenario: Mixed read/write in same turn
    Given turn with: grep, read_file, edit_file, run_terminal_cmd
    When executed
    Then grep + read_file run in parallel immediately
    And edit_file waits for reads to complete
    And run_terminal_cmd waits for edit_file
    And results returned in original call order

  Scenario: File lock prevents concurrent edits
    Given two edit_file calls on same file in same turn
    When executed
    Then second waits for first to complete
    And no data corruption

  Scenario: Network tools limited concurrency
    Given 10 web_search calls
    When executed
    Then max 4 run concurrently
    And respects rate limits

  Scenario: Terminal commands sequential
    Given 3 run_terminal_cmd calls
    When executed
    Then each waits for previous to complete
    And CWD/ENV state preserved between calls

  Scenario: Result order matches call order
    Given calls: [grep, edit, read, terminal]
    When executed with mixed parallel/serial
    Then results array order = [grep_result, edit_result, read_result, terminal_result]
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 5. References

- `PRD-Infra-04_Tool_Registry.md` — 도구 메타데이터(`category`, `readonly` 등) 기반 분류
- `PRD-Infra-07_Streaming_Tool_Executor.md` — 선실행 시 읽기 도구 병렬 실행
- `PRD-07_Parallel_File_Search.md` — `p-limit` 병렬 읽기 구현체 재사용
- `p-limit`: https://github.com/sindresorhus/p-limit