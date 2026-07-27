# PRD-Infra-20: Agent Loop Controller (에이전트 루프 컨트롤러)

> **Category**: Core Infrastructure  
> **Priority**: P0 (Agent 모드의 심장)  
> **Phase**: C2 (Ask) → C3 (Agent Multi-turn)  
> **관련 PRD**: `PRD-03_Agent_Loop_Modes.md`, `PRD-Infra-14_Tool_Call_Orchestration.md`, `PRD-Infra-05_Permission_Autorun.md`, `PRD-Infra-11_Doom_Loop_Detection.md`, `PRD-Harness-08_Harness_Duties.md`

---

## 1. Overview

### 목적
에이전트 모드(Ask/Plan/Act/Debug)의 **메인 이벤트 루프**를 제어한다. 턴 제한, 타임아웃, 스톱 토큰, 하네스 의무(검증/프리패치/압축)를 **단일 진입점**에서 오케스트레이션.

### 핵심 책임
| 책임 | 설명 |
|------|------|
| **턴 관리** | 최대 턴 수, 현재 턴 추적, 턴 간 컨텍스트 전달 |
| **모드별 동작** | Ask(1턴) / Plan(플랜 생성) / Act(멀티턴) / Debug(에러 중심) |
| **하네스 연동** | 검증 루프, 프리패치, 둠 루프 감지, 컨텍스트 압축 강제 실행 |
| **중단/재개** | 사용자 Stop, 타임아웃, 에러 시 체크포인트 저장 후 안전 종료 |
| **관측가능성** | 턴 단위 텔레메트리, 상태 전이 로깅 |

---

## 2. Architecture

### 2.1 상태 머신

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT LOOP                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐    User Input / Resume                             │
│   │  IDLE   │──────────────────────────────────────┐             │
│   └────┬────┘                                      │             │
│        │                                           ▼             │
│        │                                  ┌───────────────┐     │
│        │                                  │  PREPARE TURN │     │
│        │                                  │  - Load ctx   │     │
│        │                                  │  - Prefetch   │     │
│        │                                  │  - Checkpoint │     │
│        │                                  └───────┬───────┘     │
│        │                                          │             │
│        ▼                                          ▼             │
│   ┌─────────┐    LLM Call (stream)         ┌─────────────┐     │
│   │ THINKING│──────────────────────────────▶│  LLM STREAM │     │
│   └────┬────┘                                └──────┬──────┘     │
│        │                                            │             │
│        │           Tool Calls Parsed                │             │
│        │                                            ▼             │
│        │                                  ┌─────────────────┐    │
│        │                                  │  ORCHESTRATE    │    │
│        │                                  │  TOOL CALLS     │    │
│        │                                  │  (Parallel/Ser) │    │
│        │                                  └────────┬────────┘    │
│        │                                           │             │
│        │                    Verification Required  │             │
│        │                                           ▼             │
│        │                                  ┌─────────────────┐    │
│        │                                  │ VERIFICATION    │    │
│        │                                  │ MICRO-LOOP      │    │
│        │                                  │ (max 3 attempts)│    │
│        │                                  └────────┬────────┘    │
│        │                                           │             │
│        │                    Turn Complete          │             │
│        └───────────────────────────────────────────┘             │
│                                                                  │
│   Terminal States: COMPLETE | STOPPED | ERROR | MAX_TURNS       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 핵심 타입

```typescript
// src/agent/AgentLoopController.ts

export type AgentMode = 'ask' | 'plan' | 'act' | 'debug';

export interface AgentLoopConfig {
  mode: AgentMode;
  maxTurns: number;              // Ask=1, Plan=3, Act=20, Debug=10
  turnTimeoutMs: number;         // 턴당 최대 시간
  totalTimeoutMs: number;        // 세션 전체 최대 시간
  stopTokens: string[];          // 중단 토큰 (예: "<|STOP|>")
  verificationRequired: boolean; // 하네스 검증 강제 여부
  prefetchEnabled: boolean;
  compactionThreshold: number;   // 토큰 예산 % (예: 90)
  doomLoopThreshold: number;     // 반복 감지 임계값
}

export interface TurnState {
  turnNumber: number;
  mode: AgentMode;
  userInput: string;             // 현재 턴 사용자 입력 (첫 턴) 또는 빈 문자열
  context: AgentContext;         // 조립된 컨텍스트
  llmResponse: LLMResponse | null;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  verificationResults: VerificationResult[];
  checkpoints: string[];         // 생성된 체크포인트 ID
  metrics: TurnMetrics;
  status: TurnStatus;
}

export type TurnStatus = 
  | 'preparing' 
  | 'thinking' 
  | 'streaming' 
  | 'executing_tools' 
  | 'verifying' 
  | 'compacting' 
  | 'complete' 
  | 'stopped' 
  | 'error' 
  | 'max_turns_reached';

export interface AgentContext {
  sessionId: string;
  messages: ChatMessage[];       // 전체 대화 히스토리 (압축 포함)
  stickyContext: StickyContext;  // 시스템, 규칙, 메모리, 아티팩트
  activeGoal: string;            // 현재 목표 (플랜/사용자 요청)
  memories: Memory[];
  artifacts: Artifact[];
  tokenBudget: TokenBudget;
  turnNumber: number;
}
```

---

## 3. Main Loop Implementation

### 3.1 컨트롤러 클래스

```typescript
export class AgentLoopController {
  private state: AgentLoopState = 'idle';
  private currentTurn: TurnState | null = null;
  private abortController: AbortController | null = null;
  private turnListeners: Set<(turn: TurnState) => void> = new Set();

  constructor(
    private config: AgentLoopConfig,
    private llm: LLMProvider,
    private orchestrator: ToolOrchestrator,
    private contextAssembler: ContextAssembler,
    private compactionEngine: CompactionEngine,
    private doomLoopDetector: DoomLoopDetector,
    private prefetchPipeline: PrefetchPipeline,
    private checkpointManager: CheckpointManager,
    private telemetry: TelemetryCollector
  ) {}

  // 메인 진입점
  async run(sessionId: string, initialInput: string, mode: AgentMode): Promise<AgentLoopResult> {
    this.config = { ...this.config, mode, maxTurns: this.getMaxTurnsForMode(mode) };
    this.abortController = new AbortController();
    
    const session = await this.loadOrCreateSession(sessionId);
    let turnNumber = 0;
    
    try {
      while (turnNumber < this.config.maxTurns && !this.abortController.signal.aborted) {
        turnNumber++;
        
        const turnResult = await this.executeTurn(session, turnNumber, 
          turnNumber === 1 ? initialInput : '');
        
        if (turnResult.shouldStop) break;
        
        // 턴 완료 후 처리
        await this.postTurnProcessing(session, turnResult);
      }
      
      return { success: true, finalState: this.currentTurn };
      
    } catch (error) {
      return this.handleError(error, session);
    } finally {
      this.cleanup();
    }
  }

  private async executeTurn(session: Session, turnNumber: number, userInput: string): Promise<TurnResult> {
    this.currentTurn = this.createTurnState(turnNumber, userInput);
    this.emitTurnUpdate(this.currentTurn);

    // 1. PREPARE
    await this.prepareTurn(session, this.currentTurn);
    
    // 2. THINK (LLM Stream)
    await this.thinkTurn(session, this.currentTurn);
    
    // 3. EXECUTE TOOLS
    if (this.currentTurn.toolCalls.length > 0) {
      await this.executeTools(session, this.currentTurn);
    }
    
    // 4. VERIFY (Harness Duty)
    if (this.config.verificationRequired) {
      await this.verifyTurn(session, this.currentTurn);
    }
    
    // 5. COMPACTION CHECK
    await this.checkCompaction(session, this.currentTurn);
    
    // 6. DOOM LOOP CHECK
    this.doomLoopDetector.recordTurn(this.currentTurn);
    if (this.doomLoopDetector.isLoopDetected()) {
      await this.handleDoomLoop(session);
    }
    
    return { shouldStop: this.isTurnComplete(this.currentTurn) };
  }

  private async prepareTurn(session: Session, turn: TurnState): Promise<void> {
    turn.status = 'preparing';
    this.emitTurnUpdate(turn);

    // 체크포인트 생성 (중요한 턴 시작 전)
    if (turn.turnNumber === 1 || this.shouldCheckpoint(turn)) {
      const cp = await this.checkpointManager.create(session.id, {
        trigger: 'turn_start',
        turnNumber: turn.turnNumber
      });
      turn.checkpoints.push(cp.id);
    }

    // 컨텍스트 조립
    turn.context = await this.contextAssembler.assemble({
      sessionId: session.id,
      turnNumber: turn.turnNumber,
      userGoal: turn.userInput || session.activeGoal,
      maxTokens: this.config.tokenBudget
    });

    // 프리패치 실행 (비동기, 백그라운드)
    if (this.config.prefetchEnabled) {
      this.prefetchPipeline.predictAndExecute(turn.context).catch(console.error);
    }
  }

  private async thinkTurn(session: Session, turn: TurnState): Promise<void> {
    turn.status = 'thinking';
    this.emitTurnUpdate(turn);

    const prompt = this.buildPrompt(turn.context);
    const stream = this.llm.stream(prompt, {
      model: this.selectModelForMode(this.config.mode),
      maxTokens: this.config.maxOutputTokens,
      stopSequences: this.config.stopTokens,
      signal: this.abortController.signal
    });

    turn.status = 'streaming';
    let fullResponse = '';
    
    for await (const chunk of stream) {
      if (this.abortController.signal.aborted) break;
      fullResponse += chunk.text;
      turn.llmResponse = { text: fullResponse, usage: chunk.usage };
      this.emitTurnUpdate(turn);
    }

    // 툴 호출 파싱
    turn.toolCalls = this.parseToolCalls(fullResponse);
  }

  private async executeTools(session: Session, turn: TurnState): Promise<void> {
    turn.status = 'executing_tools';
    this.emitTurnUpdate(turn);

    const intent = turn.toolCalls.map(tc => ({
      toolName: tc.name,
      args: tc.args,
      metadata: { verificationRequired: this.needsVerification(tc.name) }
    }));

    const result = await this.orchestrator.executeBatch(intent, {
      sessionId: session.id,
      turnNumber: turn.turnNumber,
      parallelPolicy: this.config.parallelPolicy
    });

    turn.toolResults = result.results;
    turn.verificationResults = result.verifications;
  }

  private async verifyTurn(session: Session, turn: TurnState): Promise<void> {
    turn.status = 'verifying';
    this.emitTurnUpdate(turn);

    // 하네스 검증 마이크로루프 (PRD-Harness-10)
    for (const toolResult of turn.toolResults) {
      if (toolResult.verificationRequired && !toolResult.verificationPassed) {
        const verification = await this.runVerificationLoop(toolResult, turn.context);
        turn.verificationResults.push(verification);
        
        if (!verification.passed && verification.fixAttempted) {
          // 수정 재실행 로직
          await this.retryWithFix(toolResult, verification.fixIntent, turn);
        }
      }
    }
  }

  private async checkCompaction(session: Session, turn: TurnState): Promise<void> {
    const tokenUsage = this.calculateTokenUsage(turn.context.messages);
    if (tokenUsage > this.config.compactionThreshold) {
      turn.status = 'compacting';
      this.emitTurnUpdate(turn);
      
      await this.compactionEngine.compact(turn.context.messages, {
        targetTokens: this.config.tokenBudget * 0.7,
        protectedZones: this.getProtectedZones(turn.context)
      });
    }
  }

  // 사용자 중단
  stop(): void {
    this.abortController?.abort();
    if (this.currentTurn) {
      this.currentTurn.status = 'stopped';
      this.emitTurnUpdate(this.currentTurn);
    }
  }

  // 구독
  onTurnUpdate(listener: (turn: TurnState) => void): () => void {
    this.turnListeners.add(listener);
    return () => this.turnListeners.delete(listener);
  }
}
```

---

## 4. Mode-Specific Behavior

| 모드 | 최대 턴 | 타임아웃 | 검증 | 프리패치 | 주요 동작 |
|------|---------|----------|------|----------|-----------|
| **Ask** | 1 | 30s | 선택적 | 끄기 | 단일 응답, 도구 사용 안 함 |
| **Plan** | 3 | 60s | 필수 | 켜기 | 플랜 생성 → 사용자 승인 → Act로 전환 |
| **Act** | 20 | 300s | 필수 | 켜기 | 멀티턴 실행, 체크포인트 매 턴 |
| **Debug** | 10 | 120s | 필수 | 켜기 | 에러 분석 중심, 테스트 실행 우선 |

```typescript
private getMaxTurnsForMode(mode: AgentMode): number {
  const limits = { ask: 1, plan: 3, act: 20, debug: 10 };
  return limits[mode];
}

private selectModelForMode(mode: AgentMode): ModelTier {
  // Ask/Plan: Tier A (Flash) - 하네스로 품질 보장
  // Act/Debug: Tier B (Pro) - 복잡한 도구 사용 시
  return mode === 'act' || mode === 'debug' ? 'B' : 'A';
}
```

---

## 5. Doom Loop Detection Integration

```typescript
// PRD-Infra-13 참조
private async handleDoomLoop(session: Session): Promise<void> {
  const pattern = this.doomLoopDetector.getPattern();
  const recovery = this.doomLoopDetector.getRecoveryAction();
  
  this.telemetry.recordDoomLoop({
    pattern,
    turnNumber: this.currentTurn!.turnNumber,
    recoveryAction: recovery
  });

  switch (recovery) {
    case 'checkpoint_rollback':
      await this.checkpointManager.rollback(session.id, this.doomLoopDetector.getLastGoodCheckpoint());
      break;
    case 'model_escalation':
      this.config.modelTier = 'B'; // Flash → Pro
      break;
    case 'user_intervention':
      this.currentTurn!.status = 'stopped';
      throw new DoomLoopError(pattern, recovery);
  }
}
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Agent Loop Controller

  Scenario: Ask mode completes in single turn
    Given mode = "ask"
    When user asks "What is TypeScript?"
    Then LLM streams response
    And no tool calls made
    And turn completes with status "complete"
    And total turns = 1

  Scenario: Act mode executes multi-turn with tools
    Given mode = "act"
    And user asks "Create a React component for login"
    When turn 1: LLM proposes file structure
    And turn 2: LLM calls write_file for each file
    And turn 3: LLM calls terminal to run tests
    Then all turns execute sequentially
    And checkpoints created each turn
    And verification runs on write_file calls
    And session completes or stops at turn 3 with success

  Scenario: Stop button interrupts cleanly
    Given agent running in Act mode turn 5
    When user clicks Stop
    Then abort signal sent to LLM stream
    And tool orchestrator cancels pending calls
    And checkpoint saved with current state
    And UI shows "Stopped at turn 5" with resume option

  Scenario: Timeout triggers graceful stop
    Given turnTimeoutMs = 60000
    And LLM stream hangs at turn 3
    When 60 seconds elapse
    Then turn aborted
    And error recorded in telemetry
    And user prompted to resume or stop

  Scenario: Max turns reached
    Given maxTurns = 20
    And agent at turn 20
    When turn 20 completes
    Then loop stops with status "max_turns_reached"
    And summary shown to user
    And option to continue with new session

  Scenario: Doom loop detected and recovered
    Given agent oscillates between read_file and write_file on same file
    When pattern detected at turn 8
    Then rollback to turn 5 checkpoint
    And model escalated to Tier B
    And user notified "Loop detected, recovered to turn 5"
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 7. References

- `PRD-03_Agent_Loop_Modes.md` — 모드별 상세 스펙
- `PRD-Infra-14_Tool_Call_Orchestration.md` — 도구 실행 오케스트레이션
- `PRD-Infra-05_Permission_Autorun.md` — 권한/자동실행
- `PRD-Infra-11_Doom_Loop_Detection.md` — 둠 루프 감지/복구
- `PRD-Harness-08_Harness_Duties.md` — 하네스 의무 (검증/프리패치/압축)
- `PRD-Harness-10_Verification_MicroLoop.md` — 검증 마이크로루프