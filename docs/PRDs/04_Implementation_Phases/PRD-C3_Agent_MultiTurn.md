# PRD-C3: Agent 멀티턴 (Agent Multi-Turn Loop)

> **Phase**: C3 (C2 단일 턴 안정화 후)  
> **Priority**: 높음 (에이전트 핵심 루프)  
> **관련 PRD**: `PRD-C2_Agent_SingleTurn.md`, `PRD-Infra-07_Streaming_Tool_Executor.md`, `PRD-Infra-08_Parallel_Serial_Policy.md`, `PRD-Infra-11_Doom_Loop_Detection.md`, `PRD-Infra-12_MaxTurns_Timeout_Stop.md`, `PRD-Infra-13_Error_Recovery.md`

---

## 1. Overview

### 목적
Agent 모드에서 **멀티턴 자율 루프**를 완성한다: 사용자 요청 → 탐색 → 수정 → 검증 → 완료까지 **도구 호출을 반복**하며 이슈 하나를 끝낸다. 중단 조건(maxTurns, Stop, 권한 거부, Doom Loop)과 에러 복구(도구 실패 → tool_result로 반환 → 모델이 재시도)를 포함한다.

### 비즈니스 가치
- "이 버그 고쳐줘" 한 마디로 탐색→수정→테스트까지 자동 완료
- 중급 모델(Flash)도 하네스(최대 턴, Doom Loop 감지, 에러 복구) 덕분에 루프 안정적
- 사용자 개입 최소화: 필요할 때만 승인/질문

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "로그인 500 에러 고쳐줘" 하면 관련 파일 찾고 수정하고 테스트 통과할 때까지 알아서 돌게 하고 싶다 |
| US-02 | 팀 리더로, 무한 루프 방지(최대 15턴, 동일 도구 3회 반복 시 중단)돼서 리소스 낭비 없게 하고 싶다 |
| US-03 | 개발자로서, 도구 실행 중 에러 나면 루프 안 멈추고 에러 메시지 모델에 줘서 스스로 복구하게 하고 싶다 |

---

## 2. Functional Requirements

### 2.1 코어 루프 (전 모드 공통, Agent 모드에서 풀 가동)
```
사용자 메시지 (+ Rules / 모드 시스템 프롬프트)
  → 컨텍스트 조립 (열린 탭, @멘션, 규칙, 선택 영역, 최근 도구 결과)
  → 모델 스트리밍 호출
  → tool_calls 있으면:
       · 읽기/검색 → Promise.all 병렬 실행 (최대 16동시)
       · 쓰기/터미널 → 직렬 실행 + 승인 게이트
       · 결과 messages에 append (tool role)
       → 다시 모델 호출 (다음 턴)
  → tool_calls 없으면 종료 (또는 maxTurns / Stop / 권한 거부 / 동일 도구 반복)
```

### 2.2 중단 조건 (Stop Conditions)
| 조건 | 동작 | 구현 |
|------|------|------|
| **도구 호출 없음** | 정상 종료 (최종 응답 출력) | `toolCalls.length === 0` |
| **maxTurns 도달** | "최대 턴 수(15) 초과. 계속하려면 '계속' 입력" 메시지 + 정지 | 턴 카운터 + `yield { type: 'max_turns' }` |
| **사용자 Stop 클릭** | `AbortController`로 스트리밍/도구 실행 중단 | `abortController.abort()` |
| **권한 거부** | `tool_result: { error: "permission denied" }` → 모델이 우회 설명 | `PermissionGate.deny()` |
| **Doom Loop 감지** | 동일 도구·동일 인자 3회 연속 → `ask_question`으로 사용자 개입 유도 | `DoomLoopDetector.check()` |

### 2.3 에러 복구 (Error Recovery)
| 상황 | 기존 동작 | 개선 동작 (C3) |
|------|-----------|----------------|
| 도구 실행 에러 (파일 없음, 권한, 타임아웃) | 루프 중단/예외 던짐 | **에러를 tool_result로 반환** → 모델이 다음 턴에서 재시도/우회 |
| 모델 JSON 파싱 실패 | 예외/루프 중단 | `Spec-01` 파서: 펜스 추출 → 재파싱 → 1회 재시도 → 실패 시 `tool_result`로 에러 전달 |
| 모델이 유효하지 않은 도구 호출 | 에러/무시 | `unknown tool` tool_result 반환 → 모델이 사용 가능한 도구로 재시도 |

### 2.4 동시성 정책 (C2에서 검증된 것 재사용)
| 도구 분류 | 예시 | 동시성 | 비고 |
|-----------|------|--------|------|
| **readonly** | grep, glob, read_file, lsp_* | Promise.all (최대 16) | 순서 무관 |
| **write** | edit_file, write_file, delete_file | 직렬 (순서 보장) | 라인 번호 드리프트 방지 |
| **exec** | run_terminal_cmd | 직렬 (또는 백그라운드 분리) | 터미널 세션 공유 |
| **network** | web_search, web_fetch | 제한적 병렬 (최대 4) | 레이트 리밋 고려 |

### 2.5 컨텍스트 관리 (C3에서 첫 적용)
| 기능 | 구현 |
|------|------|
| **Max Tokens Budget** | 128k 컨텍스트 중 60% 대화+도구결과, 10% 응답 여유 |
| **Tool Result Truncation** | 단일 tool_result > 32KB → 잘라내기 + `(truncated, path=...)` |
| **Read File Limit** | `read_file` 기본 250줄, `offset`/`limit` 필수 |
| **Compaction Trigger** | 토큰 > 90% 시 자동 컴팩션 (C4에서 완성, C3은 트리거만) |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 턴 간 지연 | 모델 추론 제외 < 500ms (도구 실행 병렬화 효과) |
| NFR-02 | 메모리 안정성 | 50턴 루프 후 메모리 증가 < 50MB |
| NFR-03 | 중단 응답성 | Stop 클릭 → 200ms 내 스트리밍/도구 중단 |
| NFR-04 | Doom Loop 정확도 | 동일 도구·인자 3회 → 100% 감지, 거짓 양성 < 5% |

---

## 4. Technical Spec

### 4.1 AgentLoop 메인 (`src/agent/loop.ts`)

```typescript
export class AgentLoop {
  private turn = 0;
  private consecutiveToolCalls = new Map<string, number>(); // doom loop용
  private abortController = new AbortController();

  constructor(
    private registry: ToolRegistry,
    private provider: LLMProvider,
    private contextAssembler: ContextAssembler,
    private config: LoopConfig
  ) {}

  async *run(initialMessages: ChatMessage[]): AsyncGenerator<TurnEvent> {
    let messages = [...initialMessages];
    const maxTurns = this.config.maxTurns || 15;

    while (this.turn < maxTurns && !this.abortController.signal.aborted) {
      this.turn++;
      
      // 1. 컨텍스트 조립 (컴팩션 포함)
      const context = await this.contextAssembler.assemble(messages, this.config.mode);
      
      // 2. 모델 스트리밍
      const stream = this.provider.chatCompletionStream({
        model: this.config.model,
        messages: context,
        tools: this.registry.getSchemas(this.config.mode),
        tool_choice: 'auto',
        parallel_tool_calls: true,
        temperature: 0.1,
        stream: true,
      }, this.abortController.signal);

      // 3. 툴콜 수집 (스트리밍 중 파싱)
      const toolCalls = await this.collectToolCalls(stream);
      
      if (toolCalls.length === 0) {
        yield { type: 'done', finalMessage: stream.accumulatedContent, turn: this.turn };
        break;
      }

      // 4. Doom Loop 체크
      const doomCheck = this.checkDoomLoop(toolCalls);
      if (doomCheck.detected) {
        yield { type: 'doom_loop', tool: doomCheck.tool, count: doomCheck.count };
        const userResponse = await this.askUser(`Same tool ${doomCheck.tool} called ${doomCheck.count} times. Continue?`);
        if (!userResponse) break;
      }

      // 5. 도구 실행 (병렬/직렬 정책)
      const results = await this.executeTools(toolCalls);
      
      // 6. 결과 메시지에 추가
      messages.push(...results.map(r => ({
        role: 'tool' as const,
        tool_call_id: r.callId,
        content: r.output,
        error: r.error,
      })));

      yield { type: 'turn_complete', turn: this.turn, toolCalls, results };
    }

    if (this.turn >= maxTurns) {
      yield { type: 'max_turns', message: `Max turns (${maxTurns}) reached. Type 'continue' to resume.` };
    }
  }

  private async executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
    const readonlyCalls = calls.filter(c => this.registry.isReadOnly(c.name));
    const writeCalls = calls.filter(c => !this.registry.isReadOnly(c.name));

    // 읽기: 병렬 (p-limit 16)
    const readResults = await pLimit(16)(readonlyCalls.map(c => 
      () => this.registry.execute(c.name, c.args, { mode: this.config.mode, turn: this.turn })
    ));

    // 쓰기/터미널: 직렬 + 승인
    const writeResults: ToolResult[] = [];
    for (const call of writeCalls) {
      const result = await this.executeWithApproval(call);
      writeResults.push(result);
    }

    return [...readResults, ...writeResults].sort((a, b) => a.callId.localeCompare(b.callId));
  }

  private checkDoomLoop(calls: ToolCall[]): DoomCheckResult {
    for (const call of calls) {
      const key = `${call.name}:${JSON.stringify(call.args)}`;
      const count = (this.consecutiveToolCalls.get(key) || 0) + 1;
      this.consecutiveToolCalls.set(key, count);
      
      if (count >= 3) {
        // 다른 도구 호출 시 카운터 리셋
        for (const [k] of this.consecutiveToolCalls) {
          if (k !== key) this.consecutiveToolCalls.delete(k);
        }
        return { detected: true, tool: call.name, count };
      }
    }
    return { detected: false };
  }

  stop() { this.abortController.abort(); }
}
```

### 4.2 에러 복구 래퍼 (`src/agent/errorRecovery.ts`)

```typescript
// 도구 실행기를 감싸 에러를 tool_result로 변환
export async function executeWithErrorRecovery(
  executor: () => Promise<ToolResult>,
  call: ToolCall
): Promise<ToolResult> {
  try {
    return await executor();
  } catch (err) {
    // 모든 에러를 tool_result로 변환 (루프 유지)
    return {
      callId: call.id,
      output: `Tool execution failed: ${err.message}`,
      error: true,
      metadata: { 
        originalError: err.name, 
        stack: err.stack,
        recoverable: isRecoverable(err) 
      },
    };
  }
}

function isRecoverable(err: Error): boolean {
  // 복구 가능: 파일 없음, 권한, 타임아웃, 네트워크
  const recoverableCodes = ['ENOENT', 'EACCES', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'];
  return recoverableCodes.some(c => err.message.includes(c)) || err.name === 'TimeoutError';
}
```

### 4.4 스트리밍 중 도구 선실행 (Streaming Tool Executor) - `Infra-07`

```typescript
// 모델 스트리밍 중 tool_calls 청크가 도착하면 즉시 도구 실행 시작
export async function* streamWithPreExecution(
  stream: AsyncIterable<ChatChunk>,
  executor: (calls: ToolCall[]) => Promise<ToolResult[]>
): AsyncGenerator<ChatChunk | ToolResult[]> {
  const pendingCalls: ToolCall[] = [];
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunk.content || '';
    
    // tool_calls 파싱 시도 (증분)
    const calls = parseToolCallsIncremental(buffer);
    if (calls.length > pendingCalls.length) {
      const newCalls = calls.slice(pendingCalls.length);
      // 읽기 도구면 즉시 실행 시작 (백그라운드)
      const readonly = newCalls.filter(c => isReadOnlyTool(c.name));
      if (readonly.length > 0) {
        // 백그라운드 실행 시작, 결과는 나중에 합치기
        executeInBackground(readonly).then(results => yield results);
      }
      pendingCalls.push(...newCalls);
    }
    
    yield chunk;
  }
  
  // 스트리밍 끝: 남은 쓰기 도구 실행
  const writeCalls = pendingCalls.filter(c => !isReadOnlyTool(c.name));
  if (writeCalls.length > 0) {
    yield executeWithApproval(writeCalls);
  }
}
```

---

## 5. Acceptance Criteria

```gherkin
Feature: Agent Multi-Turn Loop

  Scenario: Autonomous bug fix completes in 5 turns
    Given a failing test in tests/auth.test.ts
    When user says "Fix the login test"
    Then turn 1: grep/read_file to explore
    And turn 2: edit_file to fix bug
    And turn 3: run_terminal_cmd "npm test" to verify
    And turn 4: test passes, loop terminates
    And final message summarizes fix

  Scenario: Max turns protection
    Given a complex task that would take 20 turns
    When agent reaches turn 15 (maxTurns)
    Then loop pauses with "Max turns reached" message
    And user can type "continue" to resume

  Scenario: Stop button aborts gracefully
    Given agent running turn 5 (streaming + tools)
    When user clicks Stop
    Then streaming aborts within 200ms
    And any running tools cancelled
    And partial results preserved in history

  Scenario: Doom loop detected and resolved
    Given model calls read_file("config.json") 3 times with same args
    When 3rd call detected
    Then loop pauses with "Doom loop detected" prompt
    And user can guide: "Check the imports section instead"

  Scenario: Tool error becomes tool result
    Given model calls read_file on non-existent file
    When tool throws ENOENT
    Then tool_result contains "File not found: ..."
    And model retries with corrected path in next turn

  Scenario: JSON parse failure recovery
    Given model outputs malformed tool_calls JSON
    When parser fails
    Then fence extraction attempted
    And 1 retry with "Fix JSON only" prompt
    Then loop continues with parsed calls
```

---

## 6. Test Plan

| 테스트 | 설명 |
|--------|------|
| `loop.test.ts` | 15턴 루프 정상 종료, maxTurns 중단, Stop 중단 |
| `doomLoop.test.ts` | 동일 도구 3회 감지, 카운터 리셋 로직 |
| `errorRecovery.test.ts` | ENOENT/EACCES/Timeout → tool_result 변환 |
| `parallelExecution.test.ts` | 읽기 16개 병렬 < 500ms, 쓰기 직렬 순서 보장 |
| `streamingPreExec.test.ts` | 스트리밍 중 읽기 도구 선실행 지연 감소 검증 |
| E2E: `multi-turn.spec.ts` | "Fix bug" → 5턴 내 완료, 테스트 통과 |

---

## 7. Implementation Checklist

| 단계 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | `AgentLoop.run()` 제너레이터 + 턴 카운터 + 중단 조건 | 15턴 캡, Stop, 권한 거부 모두 동작 |
| 2 | `executeTools` 병렬/직렬 분기 + `p-limit(16)` | 읽기 16개 병렬 < 500ms |
| 3 | Doom Loop 감지기 (카운터 + 키 생성 + 리셋) | 동일 도구 3회 → 프롬프트 |
| 4 | 에러 복구 래퍼 (`executeWithErrorRecovery`) | 모든 에러 tool_result로 변환 |
| 4 | 스트리밍 선실행 (`streamWithPreExecution`) | 읽기 도구 TTFT 30% 단축 |
| 5 | 컨텍스트 예산 + 도구 결과 절단 (32KB 캡) | 50턴 후 토큰 예산 내 유지 |
| 6 | 통합 E2E 테스트 10개 시나리오 | CI 그린 |

---


## Out of Scope

- 해당 Phase 밖 기능을 완료로 간주하지 말 것 (특히 Browser=C7)
- 상세: `00_Master_Context.md` Non-Goals

## 8. References

- `PRD-Infra-07_Streaming_Tool_Executor.md` — 스트리밍 중 도구 선실행
- `PRD-Infra-08_Parallel_Serial_Policy.md` — 병렬/직렬 분류
- `PRD-Infra-11_Doom_Loop_Detection.md` — 둠 루프 감지 상세
- `PRD-Infra-12_MaxTurns_Timeout_Stop.md` — 최대 턴/타임아웃/중단
- `PRD-Infra-13_Error_Recovery.md` — 에러 복구 철학
- Cursor Agent Loop: https://cursor.sh/docs/agent