# PRD-Infra-07: Streaming Tool Executor (스트리밍 중 도구 선실행)

> **Category**: Core Infrastructure  
> **Phase**: C3 (멀티턴 시작 전)  
> **관련 PRD**: `PRD-C3_Agent_MultiTurn.md`, `PRD-Infra-08_Parallel_Serial_Policy.md`, `PRD-Harness-09_Prefetch_Pattern.md`

---

## 1. Overview

### 목적
모델이 **토큰을 스트리밍하는 동안** `tool_calls` 청크가 도착하면 **즉시 도구 실행을 시작**해, 모델이 다음 토큰을 생성하는 동안 I/O 대기 시간을 숨긴다. "스트리밍 중 도구 선실행(Streaming Tool Pre-execution)".

### 비즈니스 가치
- **지연 시간 30~50% 단축**: 모델 생성(TTFB) + 도구 실행 순차 → 병렬
- **체감 속도 향상**: 사용자는 토큰 나오는 동안 백그라운드에서 검색/읽기 완료
- **중급 모델 보완**: Flash가 tool_calls 한 번에 하나만 내도, 스트리밍 중 여러 개 누적 실행

---

## 2. Functional Requirements

### 2.1 선실행 조건
| 조건 | 설명 |
|------|------|
| 스트리밍 중 `tool_calls` 청크 도착 | `delta.tool_calls` 누적 파싱 |
| 도구가 **읽기 전용** (`readonly: true`) | grep, read_file, glob, lsp_* 등 |
| 동시 선실행 상한 | `p-limit(8)` (설정 가능) |
| 모델이 아직 텍스트 생성 중 | `AbortController`로 스트리밍 유지 |

### 2.2 제외 조건 (선실행 안 함)
- 쓰기/실행/파괴적 도구 (`readonly: false`)
- 모델이 `tool_calls` 없이 텍스트만 생성 중
- 사용자가 Stop 버튼 눌러 `AbortController` 발동

### 2.3 결과 처리
| 상황 | 처리 |
|------|------|
| 모델 스트리밍 완료 전 도구 완료 | 결과를 메모리 버퍼에 저장 → 모델 다음 턴에서 즉시 사용 |
| 모델 스트리밍 완료 후 도구 완료 | 다음 턴 시작 시 즉시 사용 가능 |
| 도구 실행 중 에러 | 에러를 `tool_result`로 버퍼링 → 모델 다음 턴에서 인지 |
| 사용자 Stop 중 도구 실행 중 | `AbortSignal`로 도구 취소 시도 → 정리 후 중단 |

---

## 3. Technical Spec

### 3.1 스트리밍 파이프라인 (`src/agent/streamingExecutor.ts`)

```typescript
export interface StreamingToolExecutor {
  // 모델 스트림 + 도구 선실행을 통합한 제너레이터
  *executeWithPreemption(
    stream: AsyncIterable<ChatChunk>,
    ctx: ToolContext
  ): AsyncGenerator<ChatChunk | ToolResult[], void, unknown>;
}

export class StreamingToolExecutor implements StreamingToolExecutor {
  constructor(
    private toolExecutor: ToolExecutor,
    private registry: ToolRegistry,
    private preemptionLimit = 8
  ) {}

  async *executeWithPreemption(stream: AsyncIterable<ChatChunk>, ctx: ToolContext) {
    const pendingPreemptions: Map<string, Promise<ToolResult>> = new Map();
    const toolCallBuffer = '';  // 스트리밍 중 tool_calls JSON 누적
    let toolCallsParsed: ToolCall[] = [];
    const abortController = new AbortController();

    // 1. 스트리밍 청크 처리
    for await (const chunk of stream) {
      // 사용자 Stop 감지
      if (abortController.signal.aborted) {
        // 진행 중인 선실행 취소
        for (const [, promise] of pendingPreemptions) {
          try { await promise; } catch {}  // 정리만
        }
        yield { type: 'stopped' };
        return;
      }

      // 2. 텍스트 델타 즉시 yield (UI 스트리밍 유지)
      if (chunk.content) yield chunk;

      // 3. tool_calls 델타 누적 + 파싱 시도
      if (chunk.tool_calls) {
        toolCallBuffer += chunk.tool_calls;
        const parsed = this.tryParseToolCalls(toolCallBuffer);
        if (parsed.length > toolCallsParsed.length) {
          const newCalls = parsed.slice(toolCallsParsed.length);
          toolCallsParsed = parsed;
          
          // 4. 새로운 tool_calls 중 읽기 전용만 선실행
          for (const call of newCalls) {
            if (this.registry.isReadOnly(call.name) && 
                !pendingPreemptions.has(call.id)) {
              const promise = this.executePreemptively(call, ctx);
              pendingPreemptions.set(call.id, promise);
            }
          }
        }
      }

      // 4. 완료된 선실행 결과 수집 (논블로킹)
      for (const [id, promise] of pendingPreemptions) {
        if (isPromiseSettled(promise)) {
          const result = await promise;
          // 결과를 버퍼에 저장, 모델 다음 턴에서 사용
          preemptedResults.set(id, result);
          pendingPreemptions.delete(id);
        }
      }

      yield chunk;  // 원본 청크도 전달 (툴콜 델타 포함)
    }

    // 5. 스트림 종료 후 남은 선실행 대기
    for (const [id, promise] of pendingPreemptions) {
      const result = await promise;
      preemptedResults.set(id, result);
    }

    // 6. 다음 턴에서 사용할 preemptedResults 컨텍스트에 주입
    ctx.preemptedResults = preemptedResults;
  }

  private async executePreemptively(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    try {
      // 권한 게이트는 이미 통과한 읽기 도구만 오므로 바로 실행
      return await this.executor.execute(call, { ...ctx, preempted: true });
    } catch (err) {
      return { callId: call.id, error: err.message, error: true };
    }
  }

  private tryParseToolCalls(buffer: string): ToolCall[] {
    // 증분 JSON 파싱: 완전한 tool_calls 배열만 파싱
    // 불완전한 JSON이면 빈 배열 반환
    try {
      const match = buffer.match(/("tool_calls"\s*:\s*\[[\s\S]*\])/);
      if (match) return JSON.parse(`{${match[1]}}`).tool_calls;
    } catch {}
    return [];
  }
}
```

### 3.2 에이전트 루프 통합 (`src/agent/loop.ts`)

```typescript
export class AgentLoop {
  async *run(initialMessages: ChatMessage[]): AsyncGenerator<TurnEvent> {
    let messages = [...initialMessages];
    let turn = 0;

    while (turn < this.maxTurns) {
      turn++;
      
      // 1. 컨텍스트 조립 (이전 턴 preempted results 포함)
      const context = await this.assembler.assemble(messages, this.mode, this.stickyContext);
      
      // 2. 스트리밍 + 선실행
      const stream = this.provider.chatCompletionStream({
        model: this.model,
        messages: context,
        tools: this.registry.getSchemas(this.mode),
        tool_choice: 'auto',
      });

      const streamingExecutor = new StreamingToolExecutor(this.executor, this.registry);
      const turnResults: ToolResult[] = [];
      let accumulatedContent = '';
      let toolCalls: ToolCall[] = [];

      for await (const event of streamingExecutor.executeWithPreemption(stream, this.ctx)) {
        if (event.type === 'content') {
          accumulatedContent += event.content;
          yield { type: 'delta', content: event.content };
        }
        if (event.type === 'tool_calls_delta') {
          toolCalls = this.parseAccumulatedToolCalls(event);
        }
        if (event.type === 'tool_result') {
          turnResults.push(event);
        }
        if (event.type === 'done') {
          break;
        }
      }

      // 2. 도구 실행 (이미 선실행된 것 제외)
      if (toolCalls.length > 0) {
        const remainingCalls = toolCalls.filter(c => !preemptedResults.has(c.id));
        if (remainingCalls.length > 0) {
          const results = await this.executor.executeToolCalls(remainingCalls, ctx);
          turnResults.push(...results);
        }

        // 3. preempted + 새로 실행된 결과 합쳐서 메시지에 추가
        messages.push(...turnResults.map(r => ({ role: 'tool', content: r.output, tool_call_id: r.callId })));
        yield { type: 'turn_complete', turn, results: turnResults };
      } else {
        // 도구 없으면 종료
        yield { type: 'done', finalMessage: accumulatedContent };
        break;
      }
    }
  }
}
```

### 3.3 비동기 프로미스 상태 확인 유틸

```typescript
function isPromiseSettled<T>(promise: Promise<T>): boolean {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  return settled;
}

// 또는 더 안전한 방식: Promise.race
function createSettledChecker<T>(promise: Promise<T>): () => boolean {
  let settled = false;
  promise.then(() => settled = true, () => settled = true);
  return () => settled;
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Streaming Tool Pre-execution

  Scenario: Read tools pre-executed during streaming
    Given model streams response with tool_calls: [grep, read_file]
    When streaming executor processes chunks
    Then grep and read_file start executing immediately
    And model text tokens continue streaming to UI
    And when model finishes, grep/read results already in memory
    And next turn starts with results already available

  Scenario: Write tools NOT pre-executed
    Given model streams with tool_calls: [edit_file, grep]
    When streaming executor processes
    Then grep starts immediately (readonly)
    And edit_file waits for approval (not pre-executed)
    And grep result available when model finishes

  Scenario: User stops generation mid-stream
    Given user clicks Stop while grep pre-executing
    When AbortController signals
    Then grep execution cancelled
    And no partial results leaked to context

  Scenario: Pre-executed results used in next turn
    Given grep pre-executed and completed during turn 1
    When turn 2 starts
    Then grep result injected as tool_result in context
    And model sees it without re-invoking grep

  Scenario: Pre-execution limit enforced
    Given 20 readonly tool_calls in single stream
    When pre-execution limit = 8
    Then max 8 run concurrently
    And remaining 12 queued, run as slots free
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 4. References

- `PRD-Infra-08_Parallel_Serial_Policy.md` — 병렬 실행 제한(`p-limit`) 재사용
- `PRD-Harness-09_Prefetch_Pattern.md` — 프리페치와 유사하지만 스트리밍 중 실행
- `PRD-C3_Agent_MultiTurn.md` — 멀티턴 루프에 통합
- Node.js `AbortController`: https://nodejs.org/api/globals.html#abortcontroller