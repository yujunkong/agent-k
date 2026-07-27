# PRD-Infra-11: Doom Loop Detection (둠 루프 감지)

> **Category**: Core Infrastructure  
> **Phase**: C3 (멀티턴 루프 안정화)  
> **관련 PRD**: `PRD-C3_Agent_MultiTurn.md`, `PRD-Harness-06_A_Tier_Whitelist.md`, `PRD-Infra-06_Hooks.md`

---

## 1. Overview

### 목적
모델이 **동일 도구·동일 인자**를 반복 호출해 **무한 루프(Doom Loop)**에 빠지는 것을 감지하고, 사용자 개입으로 탈출시킨다. Cursor/Claude Code와 동등한 보호 장치.

### 비즈니스 가치
- **리소스 보호**: 무한 루프로 인한 토큰/시간/비용 낭비 방지
- **중급 모델 보호**: Flash급 모델이 "어디를 봐야 할지" 모를 때 같은 파일 반복 읽기 방지
- **사용자 통제**: 루프 감지 시 사용자가 힌트 주거나 중단 가능

---

## 2. Functional Requirements

### 2.1 감지 조건
| 조건 | 기본값 | 설정 가능 |
|------|--------|-----------|
| **동일 도구** | `tool.name` 완전 일치 | - |
| **동일 인자** | `JSON.stringify(args)` 완전 일치 (정규화 후) | 허용 오차 설정 가능 |
| **연속 횟수** | **3회 연속** | 2~5 사이 설정 |
| **턴 범위** | 연속된 턴 내 | - |

### 2.2 감지 시 액션
| 액션 | 설명 |
|------|------|
| **루프 일시정지** | 에이전트 루프 일시정지, 사용자 프롬프트 표시 |
| **사용자 옵션** | 1) 힌트 주기 (`ask_question`) 2) 루프 무시하고 계속 3) 강제 중단 |
| **카운터 리셋** | 다른 도구 호출 시 해당 도구 카운터 리셋 |
| **로깅** | `doom_loop_detected` 이벤트 로깅 (도구, 인자, 횟수, 턴) |

### 2.3 정규화 규칙 (인자 비교 시)
| 규칙 | 적용 |
|------|------|
| 객체 키 정렬 | `JSON.stringify(args, Object.keys(args).sort())` |
| 경로 정규화 | `path.resolve()` + `path.normalize()` |
| 문자열 트림 | 앞/뒤 공백 제거 |
| 숫자 정밀도 | 부동소수점 6자리 반올림 |

---

## 3. Technical Spec

### 3.1 Doom Loop Detector (`src/agent/doomLoopDetector.ts`)

```typescript
export interface DoomLoopConfig {
  maxConsecutiveCalls: number;    // 기본 3
  normalizeArgs: boolean;         // true
  ignoreKeys?: string[];          // 비교 제외 키 (예: 'timestamp', 'requestId')
}

export interface DoomLoopEvent {
  detected: boolean;
  toolName: string;
  args: unknown;
  consecutiveCount: number;
  turnNumbers: number[];
  suggestion: 'ask_user' | 'continue' | 'abort';
}

export class DoomLoopDetector {
  private history: Map<string, ConsecutiveCall[]> = new Map();  // key: "toolName:argsHash"
  private readonly config: DoomLoopConfig;

  constructor(config: Partial<DoomLoopConfig> = {}) {
    this.config = { maxConsecutiveCalls: 3, normalizeArgs: true, ...config };
  }

  recordCall(toolName: string, args: unknown, turnNumber: number): DoomLoopEvent {
    const normalizedArgs = this.config.normalizeArgs ? this.normalizeArgs(args) : args;
    const argsHash = this.hashArgs(normalizedArgs);
    const key = `${toolName}:${argsHash}`;

    const history = this.history.get(key) || [];
    const lastEntry = history[history.length - 1];

    if (lastEntry && lastEntry.turnNumber === toolCallTurn - 1) {
      // 직전 턴에도 같은 호출 → 카운트 증가
      const count = (lastEntry.count || 1) + 1;
      history.push({ turnNumber, count, args: normalizedArgs });
    } else {
      // 새로운 시퀀스 시작
      history.push({ turnNumber, count: 1, args: normalizedArgs });
    }

    // 윈도우 정리 (최근 10턴만 유지)
    this.history.set(key, history.slice(-10));

    const currentCount = history[history.length - 1].count;
    if (currentCount >= this.config.maxConsecutiveCalls) {
      return {
        detected: true,
        toolName,
        args: normalizedArgs,
        consecutiveCount: currentCount,
        turnNumbers: history.map(h => h.turnNumber),
        suggestion: 'ask_user',
      };
    }

    return { detected: false, toolName, args: normalizedArgs, consecutiveCount: currentCount, turnNumbers: [], suggestion: 'continue' };
  }

  private normalizeArgs(args: unknown): unknown {
    if (Array.isArray(args)) return args.map(a => this.normalizeArgs(a));
    if (args && typeof args === 'object') {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(args).sort()) {
        if (this.config.ignoreKeys?.includes(key)) continue;
        sorted[key] = this.normalizeArgs((args as any)[key]);
      }
      return sorted;
    }
    if (typeof args === 'string') return args.trim();
    if (typeof args === 'number') return Math.round(args * 1e6) / 1e6;
    return args;
  }

  private hashArgs(args: unknown): string {
    return createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16);
  }

  // 다른 도구 호출 시 해당 도구 카운터 리셋
  resetForTool(toolName: string): void {
    for (const [key] of this.history) {
      if (key.startsWith(`${toolName}:`)) {
        this.history.delete(key);
      }
    }
  }

  // 전체 리셋 (모드 전환 시 등)
  resetAll(): void {
    this.history.clear();
  }
}
```

### 3.2 에이전트 루프 통합 (`src/agent/loop.ts`)

```typescript
export class AgentLoop {
  private doomDetector = new DoomLoopDetector({ maxConsecutiveCalls: 3 });

  async *run(initialMessages: ChatMessage[]): AsyncGenerator<TurnEvent> {
    let turn = 0;
    
    while (turn < this.maxTurns) {
      turn++;
      
      // 1. 모델 스트리밍 + 도구 실행
      const stream = this.provider.chatCompletionStream({...});
      const results = await this.executeStreaming(stream, this.ctx);
      
      // 2. 각 도구 호출에 대해 둠 루프 체크
      for (const result of results) {
        if (result.toolCall) {
          const doomEvent = this.doomDetector.recordCall(
            result.toolCall.name,
            result.toolCall.args,
            turn
          );

          if (doomEvent.detected) {
            // 둠 루프 감지됨 → 사용자 개입 요청
            const userResponse = await this.handleDoomLoop(doomEvent);
            
            if (userResponse === 'abort') {
              yield { type: 'aborted', reason: 'Doom loop aborted by user' };
              return;
            }
            if (userResponse === 'continue') {
              // 카운터 리셋하고 계속
              this.doomDetector.resetForTool(doomEvent.toolName);
              continue;
            }
            if (userResponse === 'hint') {
              // 사용자 힌트 → ask_question으로 모델에 주입
              const hint = await this.askUserForHint(doomEvent);
              messages.push({ role: 'user', content: `Hint from user: ${hint}` });
              // 현재 턴 다시 시작 (같은 턴 번호 유지)
              turn--;
              break;
            }
          }
        }
      }

      // 턴 종료 시 해당 턴에서 호출된 도구들 카운터 리셋 (다른 도구 호출 시 자연스럽게 리셋됨)
      // 다른 도구 호출 시 자동 리셋됨 (recordCall에서 다른 키로 기록됨)
    }
  }

  private async handleDoomLoop(event: DoomLoopEvent): Promise<'continue' | 'hint' | 'abort'> {
    return new Promise(resolve => {
      vscode.window.showWarningMessage(
        `⚠️ Doom loop detected: ${event.toolName} called ${event.consecutiveCount} times with same arguments.\n` +
        `Recent turns: ${event.turnNumbers.join(', ')}`,
        { modal: true },
        'Continue anyway', 'Give hint', 'Abort'
      ).then(choice => {
        if (choice === 'Continue anyway') resolve('continue');
        else if (choice === 'Give hint') resolve('hint');
        else resolve('abort');
      });
    });
  }
}
```

### 3.3 UI 모달 (`src/views/doomLoopModal.ts`)

```html
<!-- Doom Loop Detection Modal -->
<div class="doom-loop-modal">
  <div class="header">
    <span class="icon">⚠️</span>
    <h3>Doom Loop Detected</h3>
  </div>
  
  <div class="details">
    <p><strong>Tool:</strong> <code>{{toolName}}</code></p>
    <p><strong>Arguments:</strong> <pre>{{argsJson}}</pre></p>
    <p><strong>Repeated:</strong> {{count}} times consecutively</p>
    <p><strong>Turns:</strong> {{turnNumbers.join(', ')}}</p>
  </div>

  <div class="explanation">
    The agent is repeating the same operation without progress. This often means:
    <ul>
      <li>Missing context (need to read more files?)</li>
      <li>Wrong approach (need different tool/strategy?)</li>
      <li>Stuck in validation loop</li>
    </ul>
  </div>

  <div class="actions">
    <button class="primary" data-action="hint">
      💡 Give Hint (ask_question)
    </button>
    <button class="secondary" data-action="continue">
      ▶ Continue Anyway
    </button>
    <button class="danger" data-action="abort">
      ⛔ Abort Agent
    </button>
  </div>
</div>
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Doom Loop Detection

  Scenario: Detect 3 consecutive identical read_file calls
    Given agent calls read_file("config.json") 3 times in a row
    When 3rd call recorded
    Then doom loop event fired with count=3
    And modal shows "read_file called 3 times with same arguments"
    And user can choose Hint/Continue/Abort

  Scenario: Different args reset counter
    Given agent calls read_file("a.ts"), then read_file("b.ts"), then read_file("a.ts")
    When 3rd call recorded
    Then no doom loop detected (args differ)
    And counter for "a.ts" reset to 1

  Scenario: Different tool resets counter
    Given agent calls read_file("x.ts") 3 times
    And then calls grep("pattern")
    When grep recorded
    Then read_file counter reset to 0
    And grep counter = 1

  Scenario: User gives hint, loop breaks
    Given doom loop detected on edit_file
    When user clicks "Give hint" and enters "Check the imports section"
    Then ask_question injected with hint
    And agent re-reads file with new context
    And edit succeeds on next attempt

  Scenario: Abort stops agent cleanly
    Given doom loop detected
    When user clicks "Abort"
    Then agent loop terminates
    And final message "Aborted by user: doom loop" shown
    And no partial tool results applied

  Scenario: Configurable threshold
    Given config maxConsecutiveCalls = 2
    When same tool called 2 times with same args
    Then doom loop detected at 2 (not 3)
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 5. References

- `PRD-C3_Agent_MultiTurn.md` — 멀티턴 루프에서 감시 지점
- `PRD-Harness-06_A_Tier_Whitelist.md` — 중급 모델용 엄격한 제한
- `PRD-Infra-06_Hooks.md` — `PreToolUse` 훅에서 감지 로직 삽입 가능
- Cursor Doom Loop: https://cursor.sh/docs/doom-loop