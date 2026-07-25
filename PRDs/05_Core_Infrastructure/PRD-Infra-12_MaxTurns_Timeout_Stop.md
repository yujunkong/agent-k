# PRD-Infra-12: Max Turns / Timeout / Stop (최대 턴 / 타임아웃 / 중단)

> **Category**: Core Infrastructure  
> **Phase**: C3 (멀티턴 루프 안정화)  
> **관련 PRD**: `PRD-C3_Agent_MultiTurn.md`, `PRD-Infra-11_Doom_Loop_Detection.md`, `PRD-Infra-13_Error_Recovery.md`

---

## 1. Overview

### 목적
에이전트 루프가 **무한히 돌지 않게** 하드 캡(Hard Cap)을 두고, 사용자가 **언제든 중단(Stop)**할 수 있게 한다. 타임아웃으로 **비동기 도구 실행 중 무한 대기** 방지.

### 비즈니스 가치
- **비용 폭증 방지**: 로컬 모델도 무한 루프면 토큰/시간 무한 소모
- **사용자 통제권**: "이건 아니야" 즉시 중단 → 수정 재시도
- **자원 보호**: 타임아웃으로 걸린 프로세스/소켓 정리

---

## 2. Functional Requirements

### 2.1 하드 캡 (Hard Caps)
| 캡 | 기본값 | 설정 가능 | 초과 시 동작 |
|------|--------|-----------|--------------|
| **maxTurns** | Ask: 10, Agent: 15, Plan: 10, Debug: 25 | ✅ | 루프 강제 종료 + "Max turns reached" 메시지 |
| **turnTimeout** | 5분/턴 | ✅ | 현재 턴 강제 중단 + 부분 결과 반환 |
| **toolTimeout** | 읽기 30초, 쓰기 30초, 터미널 5분 | ✅ | 개별 도구 타임아웃 → 에러 반환 |
| **sessionTimeout** | 30분 (유휴) | ✅ | 세션 자동 일시정지 |

### 2.2 중단(Stop) 메커니즘
| 중단 타입 | 트리거 | 범위 | 정리 작업 |
|-----------|--------|------|-----------|
| **User Stop** | UI Stop 버튼 / `Ctrl+C` | 현재 세션 전체 | 스트리밍 중단, 진행 중 도구 `AbortSignal` 전송, 체크포인트 자동 생성 |
| **Max Turns** | `turn >= maxTurns` | 현재 에이전트 세션 | 현재 턴 완료 후 종료 메시지 |
| **Turn Timeout** | 단일 턴 > `turnTimeout` | 현재 턴만 | 진행 중 도구 `AbortSignal`, 부분 결과 저장 |
| **Tool Timeout** | 개별 도구 > `toolTimeout` | 해당 도구만 | 도구 중단, 에러 결과 반환, 루프 계속 |
| **Idle Timeout** | 유저 입력 없음 `sessionTimeout` | 세션 전체 | 체크포인트 저장, 슬립 모드 |

---

## 3. Technical Spec

### 3.1 Abort Controller 통합 (`src/agent/abortController.ts`)

```typescript
export class AgentAbortController {
  private abortController: AbortController;
  private childAborts: Map<string, AbortController> = new Map(); // toolId -> AbortController
  private isAborted = false;

  constructor() {
    this.abortController = new AbortController();
  }

  get signal(): AbortSignal { return this.abortController.signal; }
  get aborted(): boolean { return this.isAborted || this.abortController.signal.aborted; }

  // 사용자 Stop 버튼
  abort(reason = 'User stopped'): void {
    this.isAborted = true;
    this.abortController.abort(reason);
    // 자식 도구들도 중단
    for (const [, ctrl] of this.childAborts) {
      ctrl.abort(reason);
    }
    this.childAborts.clear();
  }

  // 개별 도구용 하위 AbortSignal 생성
  createChildSignal(toolCallId: string): AbortSignal {
    const ctrl = new AbortController();
    this.childAborts.set(toolCallId, ctrl);
    
    // 부모 중단 시 자식도 중단
    this.abortController.signal.addEventListener('abort', () => {
      ctrl.abort(this.abortController.signal.reason);
    });
    
    return ctrl.signal;
  }

  // 도구 완료 시 정리
  releaseChild(toolCallId: string): void {
    this.childAborts.delete(toolCallId);
  }

  // 타임아웃용 자동 중단
  setTimeout(ms: number, reason = 'Timeout'): void {
    setTimeout(() => {
      if (!this.aborted) this.abort(reason);
    }, ms);
  }
}
```

### 3.2 타임아웃 래퍼 (`src/utils/withTimeout.ts`)

```typescript
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => void
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Timeout after ${ms}ms`));
    onTimeout?.();
  }, ms);

  try {
    // Promise가 AbortSignal 지원하면 직접 연결
    if (typeof promise === 'object' && promise && 'abort' in promise) {
      // 이미 AbortSignal 지원하는 함수
      return await promise;
    }
    
    // 일반 Promise면 AbortSignal로 래핑
    const abortPromise = new Promise<never>((_, reject) => {
      const abortHandler = () => reject(new Error('Aborted'));
      controller.signal.addEventListener('abort', abortHandler);
      promise.finally(() => controller.signal.removeEventListener('abort', abortHandler));
    });

    return await Promise.race([promise, abortPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// 도구 실행기에서 사용
async function executeWithTimeout(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const timeout = getToolTimeout(call.name);  // 설정에서 조회
  const abortSignal = ctx.abortController.createChildSignal(call.id);
  
  try {
    return await withTimeout(
      executeTool(call, { ...ctx, abortSignal }),
      timeout,
      () => { /* 툴별 정리: 프로세스 kill, 소켓 close 등 */ }
    );
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return { callId: call.id, error: `Timeout after ${timeout}ms`, error: true };
    }
    throw err;
  }
}
```

### 3.3 에이전트 루프 통합 (`src/agent/loop.ts`)

```typescript
export class AgentLoop {
  private abortController = new AgentAbortController();
  private turnStartTime: number;
  private sessionStartTime = Date.now();

  async *run(initialMessages: ChatMessage[]): AsyncGenerator<TurnEvent> {
    let turn = 0;
    
    while (turn < this.config.maxTurns) {
      turn++;
      this.turnStartTime = Date.now();
      
      // 세션 타임아웃 체크
      if (Date.now() - this.sessionStartTime > this.config.sessionTimeout) {
        yield { type: 'session_timeout', message: 'Session idle timeout' };
        return;
      }

      // 턴 타임아웃 설정
      const turnTimeout = setTimeout(() => {
        this.abortController.abort(`Turn timeout (${this.config.turnTimeout}ms)`);
      }, this.config.turnTimeout);

      try {
        const stream = this.provider.chatCompletionStream({
          messages: await this.assembleContext(),
          tools: this.registry.getSchemas(this.mode),
          signal: this.abortController.signal,  // 스트리밍도 중단 가능
        });

        // 스트리밍 + 도구 실행 (이미 PRD-Infra-07에서 구현)
        const turnResults = await this.executeStreamingWithTools(stream, ctx);
        
        clearTimeout(turnTimeout);
        
        // 턴 완료 처리...
        if (turnResults.some(r => r.isFinal)) break;
        
      } catch (err) {
        clearTimeout(turnTimeout);
        
        if (err.name === 'AbortError') {
          yield { type: 'turn_aborted', reason: err.message };
          // 체크포인트 자동 생성 제안
          yield { type: 'checkpoint_suggested', message: 'Turn aborted. Create checkpoint?' };
          break;
        }
        throw err;
      }
    }

    // maxTurns 도달
    if (turn >= this.config.maxTurns) {
      yield { type: 'max_turns_reached', message: `Max turns (${this.config.maxTurns}) reached. Type 'continue' to resume.` };
    }
  }
}
```

### 3.4 UI Stop 버튼 연결 (`src/views/chatHeader.ts`)

```typescript
// 채팅 헤더 Stop 버튼
const stopButton = document.getElementById('stopBtn');
stopButton.addEventListener('click', () => {
  agentLoopRef.current?.abortController.abort('User clicked Stop');
  // UI 즉시 피드백
  stopButton.disabled = true;
  stopButton.textContent = 'Stopping...';
});

// 키보드 단축키
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    e.preventDefault();
    agentLoopRef.current?.abortController.abort('Ctrl+C');
  }
});
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Max Turns / Timeout / Stop

  Scenario: Max turns stops agent
    Given maxTurns = 3 for Agent mode
    When agent runs 3 turns without finishing
    Then loop stops at turn 3
    And message "Max turns (3) reached. Type 'continue' to resume." shown
    And user can type "continue" to resume with same context

  Scenario: Turn timeout aborts current turn
    Given turnTimeout = 30 seconds
    And agent stuck in long terminal command
    When 30 seconds pass
    Then turn aborted with "Turn timeout (30s)"
    And partial tool results preserved
    And agent prompts "Turn aborted. Continue?"

  Scenario: Tool timeout kills individual tool
    Given toolTimeout.run_terminal_cmd = 10 seconds
    When agent runs `sleep 20`
    After 10 seconds
    Then tool aborted with "Timeout after 10000ms"
    And agent continues to next turn (not whole session aborted)

  Scenario: User Stop button aborts everything
    Given agent running multi-turn task
    When user clicks Stop button
    Then streaming aborts immediately
    And any running tools receive AbortSignal
    And partial results saved to checkpoint
    And UI shows "Stopped by user"

  Scenario: Idle timeout pauses session
    Given sessionTimeout = 10 minutes
    And no user input for 10 minutes
    Then session auto-pauses
    And checkpoint auto-saved
    And UI shows "Session paused due to inactivity. Click to resume."

  Scenario: Ctrl+C keyboard shortcut
    Given agent running
    When user presses Ctrl+C
    Then same as Stop button clicked
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 4. References

- `PRD-C3_Agent_MultiTurn.md` — 멀티턴 루프에서 턴 카운터/타임아웃 사용
- `PRD-Infra-11_Doom_Loop_Detection.md` — 둠 루프와 턴 카운터 연동
- `PRD-Infra-09_Checkpoints_Rollback.md` — 중단 시 체크포인트 자동 생성
- `PRD-Infra-07_Streaming_Tool_Executor.md` — 스트리밍 중단 시 `AbortController` 전파
- Node.js AbortController: https://nodejs.org/api/globals.html#abortcontroller