# PRD-03: Cursor형 Agent 루프 (Ask/Agent/Plan/Debug 4모드)

> **Priority**: S급 (Cursor의 핵심 체감 60% = "알아서 고치는" 경험)  
> **Phase**: C1~C6 (단계적 구현)  
> **관련 PRD**: `PRD-C1_Ask_Mode.md`, `PRD-C2_Agent_SingleTurn.md`, `PRD-C3_Agent_MultiTurn.md`, `PRD-C4_Infrastructure.md`, `PRD-C5_Plan_Mode.md`, `PRD-C6_Debug_Mode.md`, `PRD-Harness-01_Model_Tiers.md`, `PRD-Harness-08_Harness_Duties.md`

---

## 1. Overview

### 목적
**단일 코어 루프** 위에 4가지 모드(Ask/Agent/Plan/Debug)만 도구 화이트리스트·시스템 프롬프트·승인 정책을 바꿔가며 구현한다. Cursor의 Agent 루프와 동등한 "탐색 → 가설 → 수정 → 검증" 자율 사이클을 로컬/중급 모델에서도 안정적으로 돌린다.

### 비즈니스 가치
- **Ask**: 코드 설명·탐색만 (쓰기 금지) → 안심하고 질문 가능
- **Agent**: 구현·리팩터·버그픽스 자율 수행 → "한 번에 끝내는" 체감
- **Plan**: 큰 작업 전 계획 합의 → 재작업 방지
- **Debug**: 런타임 증거(로그/스택) 기반 최소 패치 → 추측성 수정 제거

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, "이 함수 뭐 하는 거야?"라고 물으면 파일 읽기만 하고 수정은 안 하길 원한다 (Ask) |
| US-02 | 개발자로서, "로그인 버그 고쳐줘"라고 하면 관련 파일 탐색→수정→테스트까지 한 번에 돌길 원한다 (Agent) |
| US-03 | 개발자로서, "결제 모듈 리팩터링해줘"라고 하기 전에 계획서(Mermaid 포함) 보고 승인하고 싶다 (Plan) |
| US-04 | 개발자로서, "간헐적 500 에러 잡아줘"라고 하면 로그 찍고 재현 기다렸다가 최소 패치해주길 원한다 (Debug) |

---

## 2. Functional Requirements

### 2.1 모드별 도구 화이트리스트 & 정책

| 모드 | 읽기 도구 | 쓰기 도구 | 터미널 | 승인 정책 | 시스템 프롬프트 포커스 |
|------|-----------|-----------|--------|-----------|------------------------|
| **Ask** | `grep`, `glob`, `list_dir`, `read_file`, `codebase_search`, `lsp_*` | ❌ | ❌ | 자동 (읽기만) | "설명만, 수정 금지, 불확실하면 ask_question" |
| **Agent** | 전체 읽기 | `edit_file`, `write_file`, `delete_file`, `apply_patch` | `run_terminal_cmd` (allowlist) | Diff 승인 / allowlist 자동 | "자율 구현, 조사→가설→수정→검증 루프, todo_write 필수" |
| **Plan** | 전체 읽기 | ❌ (계획 단계) | ❌ | 자동 | "탐색→질문 UI→계획서(MD+Mermaid)→승인→Agent 분기" |
| **Debug** | 전체 읽기 | `edit_file` (계측용), `add_instrumentation` | `run_terminal_cmd` (재현) | Diff 승인 | "가설→계측→재현→로그 분석→최소패치→검증→계측제거" |

### 2.2 코어 루프 (전 모드 공통)

```
사용자 메시지 (+ Rules / 모드 시스템 프롬프트)
  → 컨텍스트 조립 (열린 탭, @멘션, 규칙, 선택 영역, 최근 툴 결과)
  → 모델 스트리밍 호출
  → tool_calls 있으면:
       · 읽기/검색 도구 → Promise.all 병렬 실행
       · 쓰기/터미널 도구 → 직렬 실행 + (필요시) 승인 게이트
       · 결과를 messages에 append (tool role)
       → 다시 모델 호출 (다음 턴)
  → tool_calls 없으면 종료 (또는 maxTurns / Stop / 권한 거부 / 동일 도구 반복 감지)
```

### 2.3 중단 조건
| 조건 | 동작 |
|------|------|
| **도구 호출 없음** | 정상 종료 (응답 완료) |
| **maxTurns 도달** | "최대 턴 수 초과, 계속하려면 '계속' 입력" 메시지 + Stop 버튼 |
| **사용자 Stop 클릭** | `AbortController`로 스트리밍/도구 실행 중단 |
| **권한 거부** | `tool_result: { error: "permission denied" }` → 모델이 우회 설명 |
| **Doom Loop 감지** | 동일 도구·동일 인자 3회 반복 → `ask_question`으로 사용자 개입 유도 |

### 2.4 모드 전환 시 컨텍스트 리셋 (Cursor 방식)
- 모드 변경 = **새 채팅 세션**과 동등하게 컨텍스트 초기화
- 단, 워크스페이스 상태(열린 파일, 규칙, 메모리)는 유지

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 턴 간 지연 | 로컬 모델 기준 < 2초 (도구 실행 제외) |
| NFR-02 | 병렬 읽기 처리량 | 동시 16개 파일 읽기 완료 < 500ms (SSD 기준) |
| NFR-03 | 메모리 누수 방지 | 50턴 세션 후 Webview 메모리 < 300MB |
| NFR-04 | 중급 모델 성공률 | Flash급 모델로 Agent 모드 단일 이슈 해결률 > 70% (하네스 적용 시) |
| NFR-05 | 디버그 모드 재현 대기 | 사용자 재현 요청 후 5분 타임아웃 → 자동 계측 제거 |

---

## 4. API & Technical Spec

### 4.1 Agent Loop Controller (`src/agent/loop.ts`)

```typescript
export interface AgentLoopOptions {
  mode: 'ask' | 'agent' | 'plan' | 'debug';
  maxTurns: number;
  timeoutMs: number;
  toolWhitelist: string[];
  approvalPolicy: ApprovalPolicy;
  onToolCall: (call: ToolCall) => Promise<ToolResult>;
  onTurnComplete: (turn: TurnResult) => void;
  onError: (err: Error, recoverable: boolean) => void;
}

export class AgentLoop {
  constructor(
    private provider: LLMProvider,
    private tools: ToolRegistry,
    private contextAssembler: ContextAssembler,
    private options: AgentLoopOptions
  ) {}

  async *run(initialMessages: ChatMessage[]): AsyncGenerator<TurnEvent> {
    let messages = [...initialMessages];
    let turn = 0;
    const abortController = new AbortController();

    while (turn < this.options.maxTurns) {
      turn++;
      
      // 1. 컨텍스트 조립 (컴팩션 포함)
      const context = await this.contextAssembler.assemble(messages, this.options.mode);
      
      // 2. 모델 스트리밍
      const stream = this.provider.chatCompletionStream({
        model: this.options.model,
        messages: context,
        tools: this.tools.getSchemas(this.options.toolWhitelist),
        tool_choice: 'auto',
        parallel_tool_calls: this.options.mode === 'agent',
        stream: true,
      }, abortController.signal);

      // 3. 툴콜 수집 및 실행
      const toolCalls = await this.collectToolCalls(stream);
      
      if (toolCalls.length === 0) {
        yield { type: 'done', finalMessage: stream.accumulatedContent };
        break;
      }

      // 4. 도구 실행 (병렬/직렬 정책)
      const results = await this.executeTools(toolCalls);
      
      // 5. 결과 메시지에 추가
      messages.push(...results.map(r => ({
        role: 'tool' as const,
        tool_call_id: r.callId,
        content: r.output,
      })));

      yield { type: 'turn_complete', turn, toolCalls, results };
    }
  }

  private async executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
    const readonlyCalls = calls.filter(c => this.tools.isReadOnly(c.name));
    const writeCalls = calls.filter(c => !this.tools.isReadOnly(c.name));

    // 읽기: 병렬
    const readResults = await Promise.all(
      readonlyCalls.map(c => this.executeWithHooks(c))
    );

    // 쓰기/터미널: 직렬 + 승인
    const writeResults = [];
    for (const call of writeCalls) {
      if (await this.needsApproval(call)) {
        const approved = await this.requestApproval(call);
        if (!approved) {
          writeResults.push({ callId: call.id, output: 'Permission denied', error: true });
          continue;
        }
      }
      writeResults.push(await this.executeWithHooks(call));
    }

    return [...readResults, ...writeResults];
  }
}
```

### 4.2 모드별 시스템 프롬프트 템플릿 (`src/agent/prompts.ts`)

```typescript
export const MODE_SYSTEM_PROMPTS = {
  ask: `당신은 코드베이스 탐색 어시스턴트입니다.
- 파일 읽기/검색만 가능합니다. 수정·삭제·실행은 금지입니다.
- 사용자 질문에 답하려면 반드시 관련 코드를 먼저 읽으세요.
- 확신이 없으면 ask_question으로 물어보세요.`,

  agent: `당신은 자율 코딩 에이전트입니다.
목표: 사용자 요청을 도구로 완수하세요.
원칙:
1. 조사(read/grep) → 가설(todo_write) → 수정(edit_file) → 검증(read_lints/test) 순서를 지키세요.
2. 파일을 고치기 전 반드시 해당 구간을 읽으세요.
3. 수정 후 린트/테스트로 검증하세요. 실패하면 다시 조사하세요.
4. todo_write로 진행 상황을 기록하세요.
5. 동일 도구·동일 인자 3회 반복 시 ask_question하세요.`,

  plan: `당신은 계획 수립 어시스턴트입니다.
1. 읽기 전용 도구로 코드베이스를 탐색하세요.
2. 불확실한 점은 객관식 UI(ask_question)로 질문하세요.
3. 계획 문서(Markdown + Mermaid)를 작성해 워크스페이스에 저장하세요.
4. 사용자 승인 후 Agent 모드로 실행을 위임하세요.`,

  debug: `당신은 디버깅 에이전트입니다.
절대 추측으로 고치지 마세요.
1. 증상/스택/로그로 가설 N개를 세우세요.
2. add_instrumentation로 계측 코드를 삽입하세요.
3. request_reproduce로 사용자에게 재현을 요청하세요(대기).
4. collect_runtime_logs로 로그를 수집·분석하세요.
5. 원인에 맞는 최소 패치(edit_file)를 적용하세요.
6. 재현으로 검증 후 remove_instrumentation로 계측을 제거하세요.`,
};
```

### 4.3 도구 레지스트리 & 화이트리스트 (`src/tools/registry.ts`)

```typescript
export const TOOL_WHITELISTS = {
  ask: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'lsp_*'],
  agent: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'lsp_*',
          'edit_file', 'write_file', 'delete_file', 'apply_patch', 'reapply',
          'run_terminal_cmd', 'todo_write', 'read_lints'],
  plan: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'lsp_*',
         'ask_question', 'todo_write'],
  debug: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'lsp_*',
          'edit_file', 'write_file', 'run_terminal_cmd',
          'add_instrumentation', 'collect_runtime_logs', 'request_reproduce',
          'remove_instrumentation', 'read_lints'],
} as const;

export type Mode = keyof typeof TOOL_WHITELISTS;
```

---

## 5. UI/UX Specification

### 5.1 모드 전환 UI (채팅 헤더)
```
[ Ask ▼ ]  [ Agent ]  [ Plan ]  [ Debug ]   [ Model: deepseek-v4-flash ▼ ]
```
- 클릭 시 모드 변경 → **새 컨텍스트 시작** 확인 토스트 표시
- 현재 모드 강조 (배경색)

### 5.2 턴 진행 인디케이터
```
Turn 3/8  🔄 Investigating...  [Stop]
├─ read_file: src/auth.ts
├─ grep: "login" in src/**
└─ todo_write: [x] Find login flow  [ ] Fix token refresh
```

### 5.3 Doom Loop 감지 알림
```
⚠️ 같은 파일(read_file: src/utils.js)을 3번 연속 읽었습니다.
원하는 정보를 찾지 못하셨나요? [질문하기] [계속 탐색]
```

### 5.4 Debug 모드 전용 패널
```
┌─ Debug Session ──────────────────┐
│ Hypothesis: [ ] Token expiry not handled  │
│ Instrumentation: ✅ Added (3 files)       │
│ Status: ⏳ Waiting for reproduction...    │
│ [Reproduced]  [Skip & Analyze Logs]       │
└──────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Agent Loop with 4 Modes

  Scenario: Ask mode - read only, no modifications
    Given mode is "Ask"
    When user asks "Explain the auth flow"
    Then model calls read_file and grep only
    And no edit_file or run_terminal_cmd is called
    And response explains the code with references

  Scenario: Agent mode - autonomous fix with verification
    Given mode is "Agent"
    And a failing test exists in tests/auth.test.ts
    When user says "Fix the login test"
    Then model reads test and source files
    And calls edit_file to fix the bug
    And calls run_terminal_cmd to run the test
    And test passes on second turn
    And loop terminates with success

  Scenario: Plan mode - produces plan document
    Given mode is "Plan"
    When user says "Refactor payment module to use strategy pattern"
    Then model explores codebase (read only)
    And asks clarifying questions via ask_question (multiple choice)
    And writes PLAN-payment-refactor.md with Mermaid diagram
    And waits for user approval
    When user clicks "Approve & Execute"
    Then new Agent session starts with the plan as context

  Scenario: Debug mode - instrumentation loop
    Given mode is "Debug"
    When user says "Intermittent 500 on /api/checkout"
    Then model adds console.log instrumentation to checkout flow
    And asks user to reproduce the error
    User reproduces and clicks "Reproduced"
    Model collects logs, identifies root cause (race condition)
    Applies minimal fix (mutex/lock)
    Verifies fix by asking user to reproduce again
    Removes instrumentation code

  Scenario: Doom loop detection
    Given model calls read_file("config.json") 3 times with same args
    Then loop pauses and shows "Doom loop detected" prompt
    User can provide guidance via ask_question
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-C1_Ask_Mode.md` | 선행 | C1에서 Ask 모드(읽기만) 완성 |
| `PRD-C2_Agent_SingleTurn.md` | 선행 | C2에서 Agent 1턴 (쓰기+승인) |
| `PRD-C3_Agent_MultiTurn.md` | 선행 | C3에서 멀티턴 루프 + maxTurns |
| `PRD-C4_Infrastructure.md` | 선행 | C4에서 승인/체크포인트/둠루프/압축 |
| `PRD-C5_Plan_Mode.md` | 후속 | Plan 모드 전용 프롬프트+UI |
| `PRD-C6_Debug_Mode.md` | 후속 | Debug 모드 전용 도구+루프 |
| `PRD-Harness-01_Model_Tiers.md` | 병행 | 티어별 도구 화이트리스트/파라미터 |
| `PRD-Harness-08_Harness_Duties.md` | 병행 | 조사→생각→확인→검증 강제 로직 |
| `PRD-Infra-04_Tool_Registry.md` | 선행 | 도구 스키마/핸들러/권한 메타 |
| `PRD-Infra-07_Streaming_Tool_Executor.md` | 선행 | 스트리밍 중 도구 선실행 |

---

## 8. Implementation Phases

| 단계 | 범위 | 완료 기준 |
|------|------|-----------|
| **C1** | Ask 모드 루프 (읽기 도구만, 병렬) | 코드 설명만, 디스크 변경 0 |
| **C2** | Agent 1턴 (Search-Replace + Diff 승인 + 터미널 1회) | 승인 후 반영 |
| **C3** | Agent 멀티턴 (코어 루프 + maxTurns + Stop + 에러→tool result) | 이슈 하나를 도구로 끝냄 |
| **C4** | 주변 인프라 (승인·체크포인트·둠루프·컴팩션·훅) | 대량 삭제·무한루프 방지 |
| **C5** | Plan 모드 (질문 UI, Mermaid, 계획 MD, todo 분기) | 계획 없이 코드 안 씀 |
| **C6** | Debug 모드 (가설·계측·재현·로그·최소수정·청소) | 런타임 증거 후 패치 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 중급 모델 툴콜 JSON 파싱 실패 | 높음 | `Spec-01` 파서: native → fence 폴백 → 1회 재시도 |
| 무한 루프 (모델이 도구 호출 반복) | 높음 | Doom Loop 감지(동일 도구·인자 3회) + maxTurns 하드캡 |
| 컨텍스트 창 오버플로 (긴 세션) | 중간 | Compaction(C4) + 모드 전환 시 리셋 |
| 터미널 명령 주입 공격 | 높음 | Allowlist + deny patterns(`rm -rf /`, `curl | sh`) + 승인 게이트 |
| Debug 모드 재현 대기 무한정 | 중간 | 5분 타임아웃 → 자동 계측 제거 + 사용자 알림 |

---


## Out of Scope

- 네이티브 Ctrl+K 애니메이션 100% 복제
- Cloud Agents SaaS
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **S급: Cursor형 Agent 루프**, **Cursor 루프 (목표 아키텍처)**, **중급 모델용 하네스**
- Cursor Agent Loop 동작: https://cursor.sh/docs/agent
- VS Code Language Model API: https://code.visualstudio.com/api/extension-guides/ai/language-model