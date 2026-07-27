# VS Code 확장프로그램 AI Agent 구현 가이드

> opencode CLI 등 기능을 분석한 VS Code Extension AI Agent 기능 명세.  
> **이 문서의 목적**: 원본 명세를 유지하되, 상단에 **Agent K에 필요한 기능**과 **현재 부족한 부분**을 명시한다. (본문 압축 아님)  
> 기준일: 2026-07-27 · `src/` 코드 인벤토리 기준. §17·§18 원본 중복만 제거.

---

## Agent K 필요 / 부족 분석 (프로젝트 적용)

### 판정 범례

| 기호 | 의미 |
|------|------|
| ✅ 충족 | Agent K에 이미 실질 구현됨 |
| 🔶 부분 | 모듈/UI는 있으나 제품급 깊이·배선 부족 |
| ❌ 부족 | 없거나 스텁·placeholder |
| ⭐ 필수 | Agent K 미션(소형/로컬 모델 하네스)에 특히 중요 |
| ➖ 비우선 | 가이드엔 있으나 Agent K 당분가 후순위 |

### A. Agent K에 필요한 기능 (가이드에서 추림)

Agent K 포지션 = **BYOLLM / Flash급 로컬 모델 + 검증·컨텍스트·도구 루프로 실무 신뢰성**.

| 우선 | 기능 | 가이드 위치 | Agent K 상태 | 부족한 점 |
|------|------|-------------|--------------|-----------|
| P0 ⭐ | Lint→피드백→재시도 검증 마이크로루프 | §16.2, §16.5, §19.2 | ✅ | 유지. 실패 메시지를 모델이 바로 고치게 하는 경로 점검 |
| P0 ⭐ | **관련 테스트 자동 검증** (edit 후 test) | §16.5, §19.2 | 🔶 | Tier B/`testEnabled` 기본 off. **켜고 관련 테스트 자동 실행·실패 주입**이 핵심 갭 |
| P0 ⭐ | 턴/런 **wall-clock 타임아웃** + 취소 | §3 | 🔶 | Stop/Abort·도구 timeout은 있음. **전체 turn/run 120s급 wall timeout** 약함 |
| P0 ⭐ | IDE 컨텍스트 자동 주입 (파일/탭/진단/심볼/git) | §6, §16.1, §19.1 | ✅~🔶 | Prefetch·Assembler 있음. **작업유형별 템플릿·git/심볼 안정 주입** 강화 필요 |
| P0 ⭐ | 강제 계획 / Plan 승인 전 write 게이트 | §16.2, §19.4, Plan | 🔶 | Plan FSM·승인 UI 있음. **복잡 작업에서 write 차단 강제**가 약할 수 있음 |
| P0 ⭐ | 실패를 tool_result로·빈 응답/JSON 복구·Doom loop | §14, 하네스 | ✅ | 차별점 — 유지 |
| P0 ⭐ | A-tier 도구 화이트리스트 / DontDo | §16, harness | ✅ | 유지 |
| P1 | 세션 저장/복원 (호스트 영속) | §2 | 🔶 | `ChatSessionStore`(webview)는 됨. **`SessionManager` workspaceState 미배선** |
| P1 | 체크포인트/롤백 UX | §18.3 Cline | 🔶 | `CheckpointManager` 존재. **쓰기 전 자동 스냅샷 + UI 원클릭 복원** 제품화 부족 |
| P1 | 규칙 파일 자동 로드 (`AGENTS.md` / `.cursorrules`) | §18.4 | 🔶 | 규칙 로더 약함/불완전 — **시스템 프롬프트 자동 주입 강화** |
| P1 | Task 서브에이전트 격리·결과만 반환 | §7, §18.2 | 🔶 | `TaskTool` 스폰 가능. **별도 컨텍스트·부모 병합·트리 UI** 부족 |
| P1 | 슬래시 명령 `/compact` `/cost` `/model` `/permissions` | §18.2 | 🔶 | 설정·컴팩션은 분산. **채팅 `/` UX로 통합** 부족 |
| P1 | 비용·토큰 Status Bar | §6.3, §18.1 | 🔶 | telemetry/budget 키 있음. **실시간 Status Bar UX** 부족 |
| P1 | LSP/진단/참조 깊이 | §5.5, §19.5 | 🔶 | `lsp_*`·`read_lints` 있음. **커서 기준 타입/정의/호출계층 자동 첨부** 깊이 중간 |
| P2 | Worktree Best-of-N + 비교 UX | §18.1, worktree | 🔶 | 모듈 있음. **채팅 진입·비교·Adopt 흐름** 약함 |
| P2 | Agent Review LM 루프 | 리뷰 | 🔶 | 정적 힌트 중심. **풀 LM 리뷰→픽스** 약함 |
| P2 | MCP 스키마 예산/deferred | §18.2 | ✅~🔶 | stdio 연결됨. HTTP·스키마 폭발 대비 지속 관리 |
| P2 | 시맨틱 임베딩 검색 | §18.4, §19 | 🔶 | placeholder. 로컬 인덱스 안정화 후 |
| P2 | Side chat | Cline/가이드 | ❌ | `SideChatSession` **명시적 stub** |
| ➖ | Tab 고스트 / Cmd+K | §18.4 | 🔶 | 휴리스틱 수준 — 확장 한계, 후순위 |
| ➖ | Browser preview | §18.3 | 🔶 | Playwright optional — C7 |
| ➖ | B급 도메인(펌웨어/MISRA/시리얼) | PRD B | ❌ | 코어 미션과 거리 — 당분간 비우선 |
| ➖ | 세션 공유 URL / Cloud Agents | §18 | ❌ | 스코프 밖 |
| ➖ | OpenRouter 전제 설정 | §10 | ➖ | Agent K는 **LiteLLM/Ollama/BYOLLM** |

### B. 지금 가장 부족한 것 (실행 갭 Top)

1. **자동 Test 검증 루프** — lint만으로는 Flash 모델 신뢰성 한계. 관련 테스트 실패를 즉시 tool_result로 돌려주는 축이 약함.  
2. **Run/Turn wall-clock timeout** — 도구별 timeout만으로는 무한·장시간 루프를 막기 부족.  
3. **Plan/write 강제 게이트** — 소형 모델의 “계획 없이 바로 쓰기”를 구조적으로 막는지가 제품 요구에 못 미침.  
4. **작업유형별 컨텍스트 전략** — bug/refactor/feature마다 필수 컨텍스트가 다른데 템플릿화가 약함.  
5. **체크포인트 UX + 규칙 파일 주입** — 모듈은 있으나 “항상 동작하는 제품 경로”가 아님.  
6. **Session 호스트 영속 / Task 격리 / 슬래시·비용 UI** — 편의·운영 완성도 갭.

### C. 이미 충분해서 가이드를 새로 깔 필요 없는 것

- Webview 채팅·스트리밍·도구 스텝 UI (`chat/*`)  
- `AgentLoopController` 멀티턴·Stop·Queue·Doom loop  
- ToolRegistry + read/edit/grep/glob/terminal/web  
- PermissionGate + Diff 승인  
- Prefetch / Compaction / Mentions  
- Harness(whitelist, verification-first, DontDo, turn structure)  
- Ask/Agent/Plan/Debug 모드 골격  

→ 가이드 §1~§14의 “처음부터 만들기” 순서(**§13**)는 Agent K에 **해당 없음**. 아래 본문은 **참조 명세**로 유지하고, 구현은 위 갭을 메우는 방향.

### D. 본문 사용법

- 아래 §1~§20 = 원본 기능 명세(코드 예시 포함).  
- 구현 우선순위는 **위 A/B**를 따른다.  
- §17·§18은 원본에 중복 붙여넣기가 있어 **한 번만** 남겼다.

### E. 구현 태스크

갭 → 태스크 매핑: [`TODO_TASKS/tasks/ADDON/`](./TODO_TASKS/tasks/ADDON/) (18개, `ADDON-T01`~`T18`)  
인덱스: [`TODO_TASKS/tasks/ADDON/README.md`](./TODO_TASKS/tasks/ADDON/README.md) · [`TODO_TASKS/MASTER_TASK_INDEX.md`](./TODO_TASKS/MASTER_TASK_INDEX.md)

| 갭 | Task IDs |
|----|----------|
| Test 검증 루프 | T01 |
| Wall timeout | T02 |
| Plan/write 게이트 | T03 |
| 컨텍스트 전략·IDE 주입 | T04, T05, T12 |
| 세션 영속 | T06 |
| 체크포인트 UX | T07 |
| 규칙 파일 | T08 |
| Task 격리 | T09 |
| 슬래시 / Status Bar | T10, T11 |
| BoN / Review / MCP / Side / Semantic | T13–T17 |
| P0 스모크 | T18 |

### F. P0 스모크 ↔ 테스트 매핑 (ADDON-T18)

| Checklist / Gap | Task | Automated test |
|-----------------|------|----------------|
| 관련 테스트 자동 검증 | T01 | `tests/unit/verification/auto-verification-test-loop.test.ts` |
| Wall-clock turn timeout | T02 | `tests/unit/loop/wall-clock-timeout.test.ts` |
| Plan/write 게이트 | T03 | `tests/unit/plan/write-gate.test.ts` |
| 작업유형별 컨텍스트 전략 | T04 | `tests/unit/prefetch/task-context-strategy.test.ts` |
| IDE 진단/git/심볼 주입 | T05 | `tests/unit/prefetch/ide-context-injector.test.ts` |
| Session host 영속 | T06 | `tests/unit/session/session-manager.test.ts`, `host-session-bridge.test.ts` |
| Checkpoint UX | T07 | `tests/unit/checkpoint/checkpoint-manager-persist.test.ts` |
| Project rules | T08 | `tests/unit/harness/project-rules-loader.test.ts` |
| Task 격리 | T09 | `tests/unit/orchestration/task-tool.test.ts` |
| Slash commands | T10 | `tests/unit/chat/slash-commands.test.ts` |
| Status Bar cost | T11 | `tests/unit/telemetry/status-bar-cost.test.ts` |
| LSP cursor | T12 | `tests/unit/prefetch/lsp-cursor-context.test.ts` |
| Best-of-N | T13 | command `agent-k.bestOfN.run` + `/bon` (manual/host) |
| Review LM | T14 | `tests/unit/review/agent-review-loop.test.ts` |
| MCP schema budget | T15 | `tests/unit/mcp/schema-budget.test.ts` |
| Side chat unsupported | T16 | `tests/unit/sidechat/side-chat-unsupported.test.ts` |
| Local semantic embedding | T17 | `tests/unit/indexing/semantic-local-embedding.test.ts` |
| P0–P2 회귀 묶음 | T18 | `tests/unit/addon/p0-smoke.test.ts` + `npm run test:addon` |

실행: `npm run test:addon`

---

## 1. 전체 아키텍처

```
┌──────────────────────────────────────────────────────┐
│                   VS Code Extension                   │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  Webview │  │  Status  │  │   Activity Bar     │  │
│  │  (Chat)  │  │  Bar UI  │  │   (Side Panel)     │  │
│  └────┬─────┘  └──────────┘  └────────┬───────────┘  │
│       │                                │              │
│  ┌────▼────────────────────────────────▼───────────┐  │
│  │              Agent Core Engine                    │  │
│  │  ┌─────────┐ ┌────────┐ ┌──────┐ ┌──────────┐  │  │
│  │  │ Session │ │ Turn   │ │Tool  │ │Context   │  │  │
│  │  │Manager  │ │Manager │ │System│ │Manager   │  │  │
│  │  └─────────┘ └────────┘ └──────┘ └──────────┘  │  │
│  └─────────────────────────────────────────────────┘  │
│       │                                                │
│  ┌────▼────────────────────────────────────────────┐  │
│  │           VS Code API Layer                       │  │
│  │  (editor, workspace, terminal, diagnostics, ...)  │  │
│  └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 2. Session Manager (세션 관리)

### 2.1 기능 목록

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| 세션 생성/종료 | 새 대화 세션 시작 및 종료 | 상 |
| 세션 상태 저장/복원 | VS Code 재시작 시 이전 세션 복원 | 중 |
| 다중 세션 지원 | 여러 프로젝트/작업별 세션 동시 유지 | 중 |
| 세션 히스토리 | 과거 세션 목록 조회 및 재개 | 하 |

### 2.2 VS Code 적용 방법

```tsx
// Session 저장소 (WorkspaceState 활용)
class SessionManager {
  constructor(private context: vscode.ExtensionContext) {}

  async saveSession(session: AgentSession): Promise<void> {
    const sessions = this.context.workspaceState.get<AgentSession[]>('sessions', []);
    sessions.push(session);
    await this.context.workspaceState.update('sessions', sessions);
  }

  async restoreSession(sessionId: string): Promise<AgentSession | undefined> {
    const sessions = this.context.workspaceState.get<AgentSession[]>('sessions', []);
    return sessions.find(s => s.id === sessionId);
  }
}
```

### 2.3 데이터 구조

```tsx
interface AgentSession {
  id: string;
  workspaceFolder: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  systemPrompt: string;
  turnCount: number;
  tokenUsage: TokenUsage;
  messages: Message[];  // 전체 대화 내역
  metadata: Record<string, any>;
}
```

---

## 3. Turn Manager (턴 관리)

### 3.1 기본 개념

Turn = 사용자 입력 1회 + AI 응답 1회 + Tool 호출 N회의 단위

```
[User Message]
    │
    ▼
[AI Thinking] ──→ [Tool Call 1] ──→ [Tool Result]
    │                                       │
    └───────────→ [Tool Call 2] ──→ [Tool Result]
    │                                       │
    └───────────→ ... 반복 ...
    │
    ▼
[AI Final Response]  (1 Turn 완료)
```

### 3.2 기능 목록

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| 턴 카운트 관리 | 현재 턴 번호 추적 및 최대 턴 제한 | 상 |
| 자동 재시도 | Tool 실패 시 자동 재시도 (지수 백오프) | 상 |
| 턴 타임아웃 | 1턴 최대 시간 제한 (기본 120초) | 상 |
| 턴 히스토리 표시 | Webview에 각 턴별 메시지 구분 표시 | 중 |
| 턴 취소 | 사용자의 현재 턴 강제 종료 | 상 |
| 턴 저장/복원 | 특정 턴에서 재개 | 하 |

### 3.3 VS Code 적용 방법

```tsx
class TurnManager {
  private currentTurn: number = 0;
  private maxTurns: number = 50;
  private abortController: AbortController = new AbortController();

  async executeTurn(userInput: string): Promise<TurnResult> {
    this.currentTurn++;
    this.abortController = new AbortController();

    const turn: Turn = {
      number: this.currentTurn,
      userMessage: userInput,
      toolCalls: [],
      status: 'running',
      startTime: Date.now(),
    };

    try {
      // 타임아웃 설정
      const timeout = setTimeout(() => {
        this.abortController.abort();
        turn.status = 'timeout';
      }, 120000);

      const result = await this.runAgentLoop(turn, this.abortController.signal);
      clearTimeout(timeout);
      turn.status = 'completed';
      turn.result = result;
      return turn;
    } catch (error) {
      if (error.name === 'AbortError') {
        turn.status = 'cancelled';
      } else {
        turn.status = 'error';
        turn.error = error.message;
      }
      return turn;
    }
  }

  cancelTurn(): void {
    this.abortController.abort();
    vscode.window.setStatusBarMessage('$(x) Agent turn cancelled', 3000);
  }

  getRemainingTurns(): number {
    return this.maxTurns - this.currentTurn;
  }
}
```

### 3.4 턴 제한 정책

| 항목 | 기본값 | 설정 가능 |
| --- | --- | --- |
| 최대 턴 수 | 50 | yes |
| 턴당 타임아웃 | 120초 | yes |
| 연속 Tool 호출 제한 | 25회 | yes |
| 턴당 최대 토큰 | 4096 | yes |

---

## 4. Tool System (도구 시스템)

### 4.1 아키텍처

```
┌──────────────────────────────────────────────────┐
│                  Tool Registry                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ FileOps │ │ BashExec │ │ Web / Search     │  │
│  ├──────────┤ ├──────────┤ ├──────────────────┤  │
│  │ - read   │ │ - exec   │ │ - webFetch       │  │
│  │ - write  │ │ - output │ │ - webSearch      │  │
│  │ - edit   │ │ - timeout│ │ - scrape         │  │
│  │ - glob   │ │ - cancel │ │                  │  │
│  │ - grep   │ └──────────┘ └──────────────────┘  │
│  └──────────┘                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ VSCode   │ │ Git      │ │ SubAgent         │  │
│  ├──────────┤ ├──────────┤ ├──────────────────┤  │
│  │ - diag   │ │ - status │ │ - spawn          │  │
│  │ - symbol │ │ - diff   │ │ - list           │  │
│  │ - refactor│ │ - commit │ │ - kill           │  │
│  │ - quickfix│ └──────────┘ └──────────────────┘  │
│  └──────────┘                                     │
└──────────────────────────────────────────────────┘
```

### 4.2 Tool 정의 인터페이스

```tsx
interface ToolDefinition {
  name: string;              // 고유 이름
  description: string;       // LLM이 이해할 설명
  parameters: JSONSchema;    // 파라미터 스키마
  handler: (params: any, ctx: ToolContext) => Promise<ToolResult>;
  requiresApproval: boolean; // 사용자 승인 필요 여부
  sensitive: boolean;        // 민감 정보 포함 여부
  timeout?: number;          // 실행 타임아웃 (ms)
}

interface ToolContext {
  session: AgentSession;
  turnNumber: number;
  workspaceRoot: string;
  abortSignal: AbortSignal;
  reportProgress: (msg: string) => void;
}

interface ToolResult {
  success: boolean;
  data: any;
  error?: string;
  truncated?: boolean;  // 결과가 잘렸는지 여부
}
```

### 4.3 Tool 등록 및 호출

```tsx
class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  // LLM 응답 파싱: <tool_call>...</tool_call> 또는 function_call 형식
  async executeToolCall(
    toolCall: ToolCall,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return { success: false, data: null, error: `Unknown tool: ${toolCall.name}` };
    }

    // 승인 필요 시 사용자 확인
    if (tool.requiresApproval) {
      const approved = await this.requestUserApproval(tool, toolCall.arguments);
      if (!approved) {
        return { success: false, data: null, error: 'User rejected tool call' };
      }
    }

    // 타임아웃 처리
    const timeout = tool.timeout ?? 60000;
    const timer = setTimeout(() => context.abortSignal.abort(), timeout);

    try {
      const result = await tool.handler(toolCall.arguments, context);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

### 4.4 Tool 호출 형식 (LLM ↔ System)

**형식 1: function_call (OpenAI 형식)**

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "read",
        "arguments": "{\"filePath\": \"src/main.ts\"}"
      }
    }
  ]
}
```

**형식 2: XML 태그 (직접 파싱)**

```xml
<tool_call>
<tool_name>read</tool_name>
<parameters>
<filePath>src/main.ts</filePath>
</parameters>
</tool_call>
```

**형식 3: JSON 코드 블록**

```
```tool_call
{
  "name": "read",
  "arguments": {
    "filePath": "src/main.ts"
  }
}
```
```

### 4.5 Tool 응답 반환 형식

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "// src/main.ts\nimport { ... }\n\nfunction main() { ... }"
}
```

---

## 5. Tool 유형 상세

### 5.1 파일 시스템 Tool

| Tool | 설명 | 파라미터 | 승인 필요 |
| --- | --- | --- | --- |
| `read` | 파일 내용 읽기 | filePath, offset?, limit? | 아니오 |
| `write` | 새 파일 생성/덮어쓰기 | filePath, content | 예 |
| `edit` | 정확한 문자열 치환 | filePath, oldString, newString | 예 |
| `glob` | 파일 패턴 검색 | pattern, path? | 아니오 |
| `grep` | 파일 내용 검색 | pattern, include?, path? | 아니오 |
| `delete` | 파일 삭제 | filePath | 예 |
| `rename` | 파일/폴더 이름 변경 | oldPath, newPath | 예 |

**VS Code 특화:**

```tsx
// 1. TextEdit API 활용 (undo/redo 지원)
const edit = new vscode.WorkspaceEdit();
edit.replace(uri, range, newText);
await vscode.workspace.applyEdit(edit);

// 2. 문서 상태 변경 감지
vscode.workspace.onDidChangeTextDocument(e => {
  // 에이전트가 변경한 내용 추적
});

// 3. Diff 보기
vscode.commands.executeCommand('vscode.diff', oldUri, newUri, 'Agent Changes');
```

### 5.2 터미널/Bash Tool

| Tool | 설명 | 파라미터 | 승인 필요 |
| --- | --- | --- | --- |
| `bash` | 명령어 실행 | command, timeout?, workdir? | 예 |
| `bash_interactive` | 인터랙티브 명령 | command, timeout? | 예 |
| `terminal_create` | VS Code 터미널 생성 | name?, cwd? | 아니오 |
| `terminal_send` | 터미널에 입력 전송 | text, terminalId | 예 |

**VS Code 적용:**

```tsx
class BashTool {
  async execute(command: string, timeout: number = 30000): Promise<ToolResult> {
    const output = await new Promise<string>((resolve, reject) => {
      const cp = require('child_process');
      const child = cp.exec(command, {
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        timeout,
        maxBuffer: 10 * 1024 * 1024,  // 10MB
      });

      let stdout = '';
      child.stdout?.on('data', (data: string) => { stdout += data; });
      child.stderr?.on('data', (data: string) => { stdout += data; });

      child.on('close', (code: number) => {
        resolve(stdout.slice(0, 50000));  // 결과 50KB 제한
      });
      child.on('error', reject);
    });

    return { success: true, data: output };
  }

  // VS Code 통합 터미널 활용
  async createTerminal(name: string, cwd?: string): Promise<vscode.Terminal> {
    const terminal = vscode.window.createTerminal({
      name,
      cwd: cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    });
    terminal.show();
    return terminal;
  }
}
```

### 5.3 검색 Tool

| Tool | 설명 | 파라미터 | 승인 필요 |
| --- | --- | --- | --- |
| `glob` | 파일 패턴 매칭 | pattern, path? | 아니오 |
| `grep` | 텍스트 검색 (Regex) | pattern, include?, path? | 아니오 |
| `find_in_files` | VS Code 검색 API 활용 | query, include?, exclude? | 아니오 |
| `find_symbols` | 심볼 검색 | query | 아니오 |
| `find_references` | 참조 찾기 | symbol, filePath | 아니오 |

**VS Code API 활용:**

```tsx
// 1. Workspace search (grep 대체)
const results = await vscode.commands.executeCommand<vscode.Location[]>(
  'vscode.executeSearch',
  { pattern: 'function.*compute' }
);

// 2. 문서 심볼 검색
const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
  'vscode.executeDocumentSymbol',
  documentUri
);

// 3. 참조 찾기
const references = await vscode.commands.executeCommand<vscode.Location[]>(
  'vscode.executeReferenceProvider',
  documentUri,
  position
);
```

### 5.4 Web Tool

| Tool | 설명 | 파라미터 | 승인 필요 |
| --- | --- | --- | --- |
| `webFetch` | URL 내용 가져오기 | url, format? | 아니오 |
| `webSearch` | 웹 검색 | query, numResults? | 아니오 |

### 5.5 VS Code 특화 Tool

| Tool | 설명 | 파라미터 | 승인 필요 |
| --- | --- | --- | --- |
| `openFile` | 파일 열기 | filePath, line?, column? | 아니오 |
| `getDiagnostics` | 문제 패널 진단 가져오기 | filePath? | 아니오 |
| `applyQuickFix` | 자동 수정 적용 | filePath, diagnosticIndex | 예 |
| `runTask` | VS Code 태스크 실행 | taskName | 예 |
| `debugStart` | 디버깅 세션 시작 | configName | 예 |
| `getWorkspaceInfo` | 워크스페이스 구조 조회 | - | 아니오 |
| `gitStatus` | Git 상태 조회 | - | 아니오 |
| `gitDiff` | 변경사항 Diff | filePath? | 아니오 |

```tsx
class VSCodeSpecificTools {
  // 진단 정보 가져오기
  async getDiagnostics(filePath?: string): Promise<ToolResult> {
    const diagnostics: vscode.Diagnostic[] = [];
    if (filePath) {
      const uri = vscode.Uri.file(filePath);
      diagnostics.push(...vscode.languages.getDiagnostics(uri));
    } else {
      for (const [uri, diags] of vscode.languages.getDiagnostics()) {
        diagnostics.push(...diags.map(d => ({ ...d, uri: uri.toString() })));
      }
    }
    return { success: true, data: diagnostics };
  }

  // 파일 열기 + 특정 라인 이동
  async openFile(filePath: string, line?: number): Promise<ToolResult> {
    const doc = await vscode.workspace.openTextDocument(filePath);
    const editor = await vscode.window.showTextDocument(doc);
    if (line !== undefined) {
      const position = new vscode.Position(line - 1, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
    }
    return { success: true, data: `Opened ${filePath}` };
  }
}
```

---

## 6. Context Manager (컨텍스트 관리)

### 6.1 컨텍스트 구성

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Context                          │
├─────────────────────────────────────────────────────────┤
│  [System Prompt] - 역할 정의, 규칙, 제약사항              │
│                                                          │
│  [Workspace Context]                                     │
│  ├── 현재 프로젝트 구조 (폴더/파일 목록)                 │
│  ├── 열려 있는 파일 목록 및 내용                          │
│  └── 최근 변경 파일 목록                                  │
│                                                          │
│  [Conversation History]                                  │
│  ├── User: ...                                           │
│  ├── Assistant: ...                                      │
│  ├── Tool Call: ... → Tool Result: ...                   │
│  └── ... (token budget에 따라 슬라이딩 윈도우)           │
│                                                          │
│  [Active File] - 현재 편집 중인 파일                      │
│                                                          │
│  [Problems/Diagnostics] - 에러, 경고                     │
│                                                          │
│  [Terminal Outputs] - 최근 터미널 실행 결과              │
└─────────────────────────────────────────────────────────┘
```

### 6.2 컨텍스트 윈도우 관리

```tsx
class ContextManager {
  private maxTokens: number = 128000;
  private tokenEstimator: (text: string) => number;
  private messages: Message[] = [];

  // 슬라이딩 윈도우 - 토큰 예산 초과 시 오래된 메시지부터 제거
  trimContext(): void {
    let totalTokens = this.estimateTotalTokens();

    while (totalTokens > this.maxTokens && this.messages.length > 1) {
      // System 메시지는 항상 유지
      const removed = this.messages.splice(1, 1)[0];
      totalTokens -= this.estimateToken(removed);
    }
  }

  // 중요도 기반 컨텍스트 요약
  async summarizeContext(): Promise<string> {
    // 오래된 메시지를 요약하여 compact 형태로 교체
    const oldMessages = this.messages.slice(1, -5);  // 최근 5개 제외
    if (oldMessages.length < 3) return '';

    const summary = await this.summarizer.summarize(oldMessages);
    this.messages = [
      this.messages[0],  // system prompt
      { role: 'system', content: `[Context Summary]: ${summary}` },
      ...this.messages.slice(-5),
    ];

    return summary;
  }

  // VS Code 관련 컨텍스트 수집
  async buildWorkspaceContext(): Promise<WorkspaceContext> {
    const folders = vscode.workspace.workspaceFolders ?? [];

    const openEditors = vscode.window.tabGroups.all
      .flatMap(g => g.tabs)
      .filter(tab => tab.input instanceof vscode.TabInputText)
      .map(tab => (tab.input as vscode.TabInputText).uri.fsPath);

    const diagnostics = vscode.languages.getDiagnostics();

    return {
      workspaceRoot: folders[0]?.uri.fsPath ?? '',
      openFiles: openEditors,
      activeFile: vscode.window.activeTextEditor?.document.uri.fsPath,
      fileCount: await this.countProjectFiles(),
      diagnostics: diagnostics.length,
    };
  }

  private estimateTotalTokens(): number {
    return this.messages.reduce(
      (sum, msg) => sum + this.estimateToken(msg.content), 0
    );
  }
}
```

### 6.3 토큰 사용량 추적

```tsx
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUSD: number;
}

class TokenTracker {
  private usage: TokenUsage[] = [];

  addUsage(usage: TokenUsage): void {
    this.usage.push(usage);
    this.updateStatusBar();
  }

  getTotalUsage(): TokenUsage {
    return {
      promptTokens: this.usage.reduce((s, u) => s + u.promptTokens, 0),
      completionTokens: this.usage.reduce((s, u) => s + u.completionTokens, 0),
      totalTokens: this.usage.reduce((s, u) => s + u.totalTokens, 0),
      costUSD: this.usage.reduce((s, u) => s + u.costUSD, 0),
    };
  }

  // VS Code Status Bar 표시
  private updateStatusBar(): void {
    const total = this.getTotalUsage();
    const statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left, 100
    );
    statusBar.text = `$(database) ${(total.totalTokens / 1000).toFixed(1)}K tokens`;
    statusBar.tooltip = `Prompt: ${total.promptTokens.toLocaleString()}\n`
                      + `Completion: ${total.completionTokens.toLocaleString()}\n`
                      + `Cost: $${total.costUSD.toFixed(4)}`;
    statusBar.show();
  }
}
```

---

## 7. Sub-Agent 시스템 (작업 분할)

### 7.1 기능 목록

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| Sub-Agent 생성 | 특정 작업 전용 자식 에이전트 생성 | 상 |
| Sub-Agent 통신 | 부모 ↔ 자식 간 메시지 교환 | 상 |
| 결과 수집 | Sub-Agent 실행 결과 취합 | 상 |
| 병렬 실행 | 여러 Sub-Agent 동시 실행 | 중 |
| Sub-Agent 모니터링 | 실행 상태 및 진행률 표시 | 중 |

### 7.2 인터페이스

```tsx
interface SubAgent {
  id: string;
  parentId: string | null;
  task: string;          // 수행할 작업 설명
  model?: string;        // 서브 전용 모델 (선택)
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  createdAt: number;
  completedAt?: number;
  tokenUsage?: TokenUsage;
}

class SubAgentManager {
  private agents: Map<string, SubAgent> = new Map();

  async spawnAgent(task: string, options?: {
    model?: string;
    tools?: string[];
    maxTurns?: number;
  }): Promise<string> {
    const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const agent: SubAgent = {
      id,
      parentId: this.currentAgentId ?? null,
      task,
      model: options?.model,
      status: 'running',
      createdAt: Date.now(),
    };

    this.agents.set(id, agent);
    this.notifyView(id, 'created');

    // 실제 실행은 별도 큐에서 관리
    this.executeAgent(id);

    return id;
  }

  private async executeAgent(id: string): Promise<void> {
    const agent = this.agents.get(id)!;
    try {
      // Sub-Agent 전용 LLM 호출
      const result = await this.callSubAgentLLM(agent);
      agent.status = 'completed';
      agent.result = result;
      agent.completedAt = Date.now();
      this.notifyView(id, 'completed');
    } catch (error) {
      agent.status = 'failed';
      agent.result = { error: error.message };
      this.notifyView(id, 'failed');
    }
  }

  async getResults(agentId: string): Promise<any> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== 'completed') return null;
    return agent.result;
  }

  // 모든 Sub-Agent 결과 병렬 수집
  async collectAll(): Promise<Map<string, any>> {
    const results = new Map();
    const running = Array.from(this.agents.values())
      .filter(a => a.status === 'running');

    if (running.length > 0) {
      // 모든 실행 중인 에이전트 완료 대기
      await Promise.all(
        running.map(a => this.waitForCompletion(a.id))
      );
    }

    for (const [id, agent] of this.agents) {
      results.set(id, agent.result);
    }
    return results;
  }
}
```

### 7.3 VS Code Webview 연동

```tsx
// Webview에 Sub-Agent 진행상황 실시간 표시
class AgentViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  updateAgentStatus(agentId: string, status: SubAgent['status']): void {
    this.view?.webview.postMessage({
      type: 'agentStatusUpdate',
      agentId,
      status,
    });
  }

  // Agent 트리 표시
  buildAgentTree(agents: SubAgent[]): string {
    return agents.map(a => `
      <div class="agent-node ${a.status}">
        <span class="agent-id">${a.id.slice(0, 12)}...</span>
        <span class="agent-status">${a.status}</span>
        <span class="agent-task">${this.truncate(a.task, 50)}</span>
      </div>
    `).join('');
  }
}
```

---

## 8. 권한 및 승인 시스템

### 8.1 권한 등급

| 등급 | 설명 | 적용 대상 |
| --- | --- | --- |
| **안전** | 자동 실행, 승인 불필요 | read, glob, grep, webSearch |
| **확인** | 사용자 확인 후 실행 | edit, write, rename |
| **위험** | 반드시 사용자 승인 필요 | bash, delete, network write |
| **거부** | 기본 차단 | 민감 명령어 (rm -rf / 등) |

### 8.2 VS Code 적용

```tsx
class PermissionManager {
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();

  async requestApproval(toolCall: ToolCall): Promise<boolean> {
    const id = `approval_${Date.now()}`;

    const request: ApprovalRequest = {
      id,
      toolName: toolCall.name,
      arguments: toolCall.arguments,
      timestamp: Date.now(),
    };

    // QuickPick 또는 Custom Dialog
    const choice = await vscode.window.showWarningMessage(
      `Agent wants to execute: ${toolCall.name}`,
      {
        modal: true,
        detail: JSON.stringify(toolCall.arguments, null, 2),
      },
      'Allow Always', 'Allow Once', 'Deny'
    );

    if (choice === 'Allow Always') {
      this.addToWhitelist(toolCall.name, toolCall.arguments);
      return true;
    }

    return choice !== 'Deny';
  }

  private whitelist: Map<string, RegExp[]> = new Map();

  // 파일 단위 권한 체크
  isPathAllowed(filePath: string): boolean {
    // workspace 내부만 허용 (기본)
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) return false;
    return filePath.startsWith(workspacePath);
  }
}
```

### 8.3 승인 UI (Webview)

```html
<div class="approval-dialog">
  <div class="tool-name">${toolCall.name}</div>
  <pre class="tool-args">${JSON.stringify(toolCall.arguments, null, 2)}</pre>
  <div class="actions">
    <button onclick="allowOnce()">Allow Once</button>
    <button onclick="allowAlways()">Allow Always</button>
    <button onclick="deny()">Deny</button>
    <button onclick="denyForever()">Deny Forever</button>
  </div>
</div>
```

---

## 9. Webview 채팅 UI

### 9.1 필요한 UI 컴포넌트

```
┌──────────────────────────────────────────────────────────┐
│  Agent Chat [===───]                                    │
├──────────────────────────────────────────────────────────┤
│  [Agent States] ● Ready / ● Thinking / ● Executing       │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐   │
│  │ User: 이 함수 좀 최적화해줘                       │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Agent: 네, 분석해볼게요...                        │   │
│  │                                                    │   │
│  │  🔧 Tool: read src/calculate.ts                   │   │
│  │  📄 Result: [file content...]                     │   │
│  │                                                    │   │
│  │  💭 Thinking...                                    │   │
│  │                                                    │   │
│  │  🔧 Tool: edit src/calculate.ts                   │   │
│  │  ✅ Approved                                       │   │
│  │                                                    │   │
│  │  최적화 완료했습니다. 성능이 40% 개선되었습니다.   │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ▶ Agent: Sub-agent "file-search-1" 실행 중...     │   │
│  │    ├── 검색 중... (read)                          │   │
│  │    └── 완료 ✅                                     │   │
│  └──────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│  [Input: _________________________________] [Send] [🔴]  │
│                                                          │
│  [Tokens: 12.4K] [Turns: 3/50] [Cost: $0.02]            │
└──────────────────────────────────────────────────────────┘
```

### 9.2 메시지 타입별 렌더링

```tsx
// Webview에 전달되는 메시지 타입
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: number;
  type?: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'error' | 'subagent';
  metadata?: {
    toolName?: string;
    toolArgs?: any;
    status?: 'running' | 'completed' | 'failed';
    agentId?: string;
    tokenCount?: number;
    duration?: number;  // 실행 시간 (ms)
  };
};
```

### 9.3 Webview ↔ Extension 통신

```tsx
// Extension -> Webview
webviewView.webview.postMessage({
  type: 'addMessage',
  message: {
    role: 'assistant',
    content: '분석 중입니다...',
    type: 'thinking',
    metadata: { status: 'running' },
  },
});

// Webview -> Extension
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.type) {
    case 'sendMessage':
      vscode.postMessage({ type: 'userInput', text: message.text });
      break;
    case 'cancelTurn':
      vscode.postMessage({ type: 'cancel' });
      break;
    case 'approveTool':
      vscode.postMessage({ type: 'approve', toolCallId: message.id });
      break;
  }
});
```

---

## 10. 설정 시스템 (Configuration)

### 10.1 package.json (VS Code Extension)

```json
{
  "contributes": {
    "configuration": {
      "title": "AI Agent",
      "properties": {
        "agent.model": {
          "type": "string",
          "default": "anthropic/claude-sonnet-4",
          "description": "LLM model ID (OpenRouter 형식)"
        },
        "agent.apiKey": {
          "type": "string",
          "default": "",
          "description": "API Key (저장되지 않음, 별도 인증 권장)"
        },
        "agent.maxTurns": {
          "type": "number",
          "default": 50,
          "minimum": 1,
          "maximum": 200
        },
        "agent.turnTimeout": {
          "type": "number",
          "default": 120000,
          "description": "1턴 최대 시간 (ms)"
        },
        "agent.maxToolCallsPerTurn": {
          "type": "number",
          "default": 25,
          "description": "턴 당 최대 툴 호출 수"
        },
        "agent.autoApproveTools": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["read", "glob", "grep", "webSearch", "webFetch"],
          "description": "자동 승인할 툴 목록"
        },
        "agent.contextWindow": {
          "type": "number",
          "default": 128000,
          "description": "컨텍스트 윈도우 크기 (tokens)"
        },
        "agent.blacklistedCommands": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["rm -rf /", "sudo", "shutdown", "reboot", "format"],
          "description": "블랙리스트 명령어"
        },
        "agent.baseUrl": {
          "type": "string",
          "default": "<https://openrouter.ai/api/v1>",
          "description": "LLM API base URL"
        },
        "agent.subAgentModel": {
          "type": "string",
          "default": "",
          "description": "Sub-Agent 전용 모델 (비워두면 메인 모델과 동일)"
        }
      }
    },
    "commands": [
      { "command": "agent.start", "title": "AI Agent: Start New Session" },
      { "command": "agent.cancel", "title": "AI Agent: Cancel Current Turn" },
      { "command": "agent.clearSession", "title": "AI Agent: Clear Session" },
      { "command": "agent.togglePanel", "title": "AI Agent: Toggle Chat Panel" },
      { "command": "agent.explain", "title": "AI Agent: Explain Selected Code" },
      { "command": "agent.refactor", "title": "AI Agent: Refactor Selected Code" },
      { "command": "agent.fix", "title": "AI Agent: Fix Errors in File" },
      { "command": "agent.terminal", "title": "AI Agent: Execute in Terminal" }
    ],
    "keybindings": [
      { "key": "ctrl+shift+i", "command": "agent.togglePanel" },
      { "key": "ctrl+shift+e", "command": "agent.explain", "when": "editorHasSelection" },
      { "key": "ctrl+shift+r", "command": "agent.refactor", "when": "editorHasSelection" }
    ]
  }
}
```

### 10.2 설정 UI 제공

```tsx
class ConfigManager {
  getConfig<T>(key: string): T {
    return vscode.workspace.getConfiguration('agent').get<T>(key)!;
  }

  // API 키는 SecretStorage에 안전하게 저장
  async setApiKey(key: string): Promise<void> {
    await this.context.secrets.store('agent.apiKey', key);
  }

  async getApiKey(): Promise<string | undefined> {
    return await this.context.secrets.get('agent.apiKey');
  }

  // Workspace별 설정 (프로젝트마다 다른 설정)
  getWorkspaceConfig(): AgentConfig {
    const config = vscode.workspace.getConfiguration('agent');
    return {
      model: config.get('model')!,
      maxTurns: config.get('maxTurns')!,
      autoApproveTools: config.get('autoApproveTools')!,
    };
  }
}
```

---

## 11. 명령어 팔레트 연동

| 명령어 | 설명 | 트리거 조건 |
| --- | --- | --- |
| `Agent: Start Session` | 새 에이전트 세션 시작 | 항상 |
| `Agent: Explain Code` | 선택한 코드 설명 | editorHasSelection |
| `Agent: Refactor` | 선택한 코드 리팩토링 | editorHasSelection |
| `Agent: Find Bug` | 현재 파일 버그 검색 | editorFocus |
| `Agent: Generate Test` | 선택 함수 테스트 생성 | editorHasSelection |
| `Agent: Fix All Errors` | 문제 패널 에러 자동 수정 | workspaceHasDiagnostics |
| `Agent: Commit` | Git 커밋 메시지 + 변경사항 커밋 | gitChanges |
| `Agent: Review` | 현재 변경사항 코드 리뷰 | gitChanges |
| `Agent: Add to Context` | 선택 영역을 컨텍스트로 추가 | editorHasSelection |
| `Agent: Execute Command` | 터미널 명령어 제안 및 실행 | 항상 |

---

## 12. 주요 이벤트 훅

```tsx
// Extension 활성화
activate(context: vscode.ExtensionContext): void {
  // 파일 저장 시 자동 검토
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (this.config.get('autoReviewOnSave')) {
        this.reviewDocument(doc);
      }
    })
  );

  // 에디터 변경 시 컨텍스트 업데이트
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        this.contextManager.setActiveFile(editor.document.uri.fsPath);
      }
    })
  );

  // 문제 패널 변경 감지
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(e => {
      this.contextManager.updateDiagnostics(e.uris);
      if (this.config.get('autoFixOnNewErrors')) {
        this.suggestFixes(e.uris);
      }
    })
  );

  // Git 변경사항 감지
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(e => {
      this.contextManager.resetWorkspaceContext();
    })
  );
}
```

---

## 13. 권장 개발 순서

| 단계 | 기능 | 예상 시간 |
| --- | --- | --- |
| 1 | Webview Chat UI (기본 채팅) | 2일 |
| 2 | LLM API 연동 (OpenRouter) | 1일 |
| 3 | 파일 Read/Write/Edit Tool | 2일 |
| 4 | Turn Manager + 컨텍스트 관리 | 1일 |
| 5 | Bash 실행 Tool | 1일 |
| 6 | 권한/승인 시스템 | 1일 |
| 7 | 검색 Tool (glob, grep) | 0.5일 |
| 8 | VS Code 특화 Tool (진단, 심볼 등) | 2일 |
| 9 | Sub-Agent 시스템 | 2일 |
| 10 | Git 통합 | 1일 |
| 11 | 설정 시스템 + 명령어 등록 | 1일 |
| 12 | Status Bar + 진행률 표시 | 0.5일 |

---

## 14. 참고 사항

- **API Key 보안**: `vscode.SecretStorage` 사용, 절대 설정 파일에 저장 금지
- **Rate Limit**: OpenRouter 무료 티어 호출 수 제한 고려 (50/일 or 1000/일)
- **토큰 비용**: 사용자에게 비용 표시 필수 (Status Bar)
- **취소 지원**: 모든 Tool 호출은 AbortSignal 지원 필수
- **결과 잘림**: Tool 결과 50KB 제한, 초과 시 요약/분할
- **오류 처리**: 모든 Tool 호출 try-catch, 사용자에게 친절한 메시지
- **Workspace Trust**: 신뢰할 수 없는 작업공간에서 제한 모드
- **Progressive Enhancement**: 기본 기능 먼저, 고급 기능은 점진적 추가

## 16. 작은 모델(≤200B)을 VS Code 확장으로 1T급 성능 끌어올리기

> **핵심**: 모델을 바꾸지 않고, **에이전트 아키텍처(도구·컨텍스트·검증·반복)**로 소형 모델의 실수를 보완하고 정교함 확보

### 16.1 컨텍스트 주입으로 '모르는 것' 없애기

소형 모델은 파라미터에 지식이 적다 → **IDE가 실시간으로 주입**

| 주입 대상 | VS Code API | 효과 |
|-----------|-------------|------|
| **현재 파일 전체** | `vscode.window.activeTextEditor.document.getText()` | 문맥 완전 파악 |
| **열린 탭들** | `vscode.window.tabGroups.all.flatMap(g => g.tabs)` | 관련 파일 동시 인식 |
| **진단(에러/경고)** | `vscode.languages.getDiagnostics(uri)` | 컴파일/린트 에러 선지식 |
| **심볼/정의/참조** | `executeDocumentSymbolProvider`, `executeReferenceProvider` | 정확한 타입/시그니처 |
| **Git 변경분** | `git diff HEAD`, `git status` | 변경 의도 파악 |
| **테스트 파일** | `glob('**/*.test.ts')` + 읽기 | 기대 동작 명세 확보 |
| **package.json/설정** | 워크스페이스 루트 파일 읽기 | 의존성/스크립트/런타임 정보 |

```typescript
// 컨텍스트 자동 수집기
class ContextCollector {
  async collectForCurrentTask(): Promise<InjectedContext> {
    const editor = vscode.window.activeTextEditor;
    const uri = editor?.document.uri;
    if (!uri) return {};

    const [diagnostics, symbols, references, gitDiff, testFiles] = await Promise.all([
      this.getDiagnostics(uri),
      this.getSymbols(uri),
      this.getReferences(uri, editor.selection.active),
      this.getGitDiff(),
      this.findRelatedTests(uri),
    ]);

    return {
      currentFile: editor.document.getText(),
      diagnostics: diagnostics.map(d => `${d.range.start.line}: ${d.message}`).join('\n'),
      symbols: symbols.map(s => `${s.name} (${s.kind})`).join(', '),
      references: references.map(r => r.uri.fsPath).slice(0, 10).join(', '),
      gitDiff: gitDiff.slice(0, 3000),
      testFiles: testFiles.slice(0, 5).map(f => f.content).join('\n---\n'),
      openTabs: this.getOpenTabContents().slice(0, 3),
    };
  }

  // 프롬프트에 자동 주입
  buildPrompt(userTask: string, ctx: InjectedContext): string {
    return `
${userTask}

=== IDE Context (Auto-Injected) ===
Current File:
${ctx.currentFile}

Diagnostics (Errors/Warnings):
${ctx.diagnostics || 'None'}

Symbols in File:
${ctx.symbols}

References to Symbol at Cursor:
${ctx.references}

Recent Git Changes:
${ctx.gitDiff}

Related Tests:
${ctx.testFiles}

Open Tabs (Related Context):
${ctx.openTabs.join('\n---\n')}
`;
  }
}
```

### 16.2 도구 사용 강제 루프 (Tool-Use Enforcement)

소형 모델은 도구 호출을 까먹거나 잘못 함 → **구조화된 강제 루프**

```typescript
// 강제 도구 사용 패턴
class EnforcedToolLoop {
  // 1. 계획 단계: 읽기/검색만 허용
  async planPhase(task: string): Promise<Plan> {
    const prompt = `
Task: ${task}
You MUST use tools to explore. Available: read, glob, grep, find_symbols.
Do NOT write code yet. Output a JSON plan.
`;
    return this.runWithTools(prompt, ['read', 'glob', 'grep', 'find_symbols']);
  }

  // 2. 구현 단계: 쓰기/편집 + 즉시 검증
  async implementPhase(plan: Plan): Promise<Implementation> {
    const results = [];
    for (const step of plan.steps) {
      // 쓰기 도구 강제
      const code = await this.runWithTools(step.prompt, ['read', 'write', 'edit', 'bash']);
      
      // 즉시 검증 (컴파일/린트/테스트)
      const verification = await this.verifyImmediately(step.files);
      if (!verification.passed) {
        // 실패 시 자동 재시도 (최대 3회)
        const fixed = await this.fixLoop(step, verification.errors, 3);
        results.push(fixed);
      } else {
        results.push({ ...code, verified: true });
      }
    }
    return { steps: results };
  }

  // 즉시 검증 파이프라인
  private async verifyImmediately(files: string[]): Promise<VerificationResult> {
    const errors: string[] = [];
    
    // TypeScript 컴파일 체크
    for (const file of files) {
      const diags = await this.runTypeCheck(file);
      errors.push(...diags);
    }
    
    // ESLint/Prettier
    for (const file of files) {
      const lintErrors = await this.runLinter(file);
      errors.push(...lintErrors);
    }

    // 관련 테스트 실행
    const testResults = await this.runRelatedTests(files);
    errors.push(...testResults.failures);

    return { passed: errors.length === 0, errors };
  }

  // 자동 수정 루프
  private async fixLoop(step: PlanStep, errors: string[], maxRetries: number): Promise<any> {
    for (let i = 0; i < maxRetries; i++) {
      const fixPrompt = `
Previous attempt failed with errors:
${errors.join('\n')}

Fix the code. Use read/edit/bash tools.
`;
      const fixed = await this.runWithTools(fixPrompt, ['read', 'edit', 'bash']);
      const verification = await this.verifyImmediately(step.files);
      if (verification.passed) return { ...fixed, verified: true, retries: i + 1 };
    }
    throw new Error(`Failed after ${maxRetries} retries`);
  }
}
```

### 16.3 작업별 특화 프롬프트 템플릿 (Prompt Engineering in Extension)

범용 프롬프트 대신 **작업 유형별 최적화된 템플릿** 내장

```typescript
// 프롬프트 템플릿 레지스트리
const PROMPT_TEMPLATES: Record<TaskType, PromptTemplate> = {
  // 버그 수정: 재현 → 원인 분석 → 최소 수정 → 회귀 테스트
  bug_fix: {
    system: `You are a senior debugger. Follow this exact process:
1. READ the failing test/error message
2. READ related source files to understand the bug
3. HYPOTHESIZE root cause (state ONE hypothesis)
4. EDIT to fix ONLY the root cause
5. RUN tests to verify
6. If tests fail, GO TO step 3 (max 3 iterations)`,
    tools: ['read', 'grep', 'edit', 'bash'],
    verification: ['typecheck', 'lint', 'test:related'],
  },

  // 리팩토링: 안전성 우선, 동작 보장
  refactor: {
    system: `You are a refactoring expert. Rules:
1. RUN existing tests FIRST (baseline)
2. Make SMALLEST possible change per step
3. RUN tests AFTER EVERY change
4. NO behavior changes - only structure
5. Use extract function/variable/rename patterns`,
    tools: ['read', 'edit', 'bash', 'find_symbols', 'find_references'],
    verification: ['test:all', 'typecheck'],
  },

  // 새 기능: 설계 → 인터페이스 → 구현 → 테스트
  new_feature: {
    system: `You are a feature engineer. Process:
1. READ related existing code (patterns, conventions)
2. DESIGN: write interface/types first (no impl)
3. IMPLEMENT: one function at a time, test each
4. INTEGRATE: wire up, run integration tests
5. DOCUMENT: update types/comments`,
    tools: ['read', 'glob', 'write', 'edit', 'bash', 'find_symbols'],
    verification: ['typecheck', 'test:new', 'test:related'],
  },

  // 코드 리뷰: 체크리스트 기반
  code_review: {
    system: `Review this code for:
- Correctness: logic errors, edge cases
- Safety: null checks, bounds, async handling
- Performance: N+1, unnecessary allocations
- Maintainability: naming, complexity, duplication
- Tests: coverage, edge cases
Output: JSON { issues: [{severity, line, message, fix}] }`,
    tools: ['read', 'grep', 'find_references'],
    verification: ['typecheck', 'lint'],
  },
};

// 사용 예
async function executeTask(task: string, type: TaskType) {
  const template = PROMPT_TEMPLATES[type];
  const context = await contextCollector.collectForCurrentTask();
  const prompt = template.system + '\n\n' + template.buildPrompt(task, context);
  
  return runAgentLoop(prompt, {
    allowedTools: template.tools,
    verificationSteps: template.verification,
    maxTurns: 20,
  });
}
```

### 16.4 사람 개입 체크포인트 (Human-in-the-Loop)

소형 모델이 판단하기 애매한 지점에서 **사용자 승인 강제**

```typescript
// 체크포인트 매니저
class CheckpointManager {
  // 위험한 작업 전 필수 승인
  async requireApproval(action: RiskyAction): Promise<boolean> {
    const riskyPatterns = [
      { pattern: /delete|remove|drop/i, message: '파일/데이터 삭제 감지' },
      { pattern: /production|deploy|publish/i, message: '프로덕션 영향 작업' },
      { pattern: /schema|migration|alter table/i, message: '스키마 변경 감지' },
      { pattern: /auth|security|permission/i, message: '보안 관련 변경' },
      { pattern: /force|--force|-f\s/, message: '강제 실행 플래그 감지' },
    ];

    for (const { pattern, message } of riskyPatterns) {
      if (pattern.test(action.command) || pattern.test(action.description)) {
        const choice = await vscode.window.showWarningMessage(
          `⚠️ ${message}\n\n작업: ${action.description}\n명령: ${action.command}`,
          { modal: true },
          '승인 후 진행', '취소', '상세 보기'
        );
        if (choice !== '승인 후 진행') return false;
        if (choice === '상세 보기') {
          await this.showDetail(action);
          return this.requireApproval(action); // 재확인
        }
      }
    }
    return true;
  }

  // 모델 불확실성 감지 시 자동 체크포인트
  async checkModelUncertainty(response: ModelResponse): Promise<void> {
    const uncertaintySignals = [
      response.content.includes('I think') ||
      response.content.includes('maybe') ||
      response.content.includes('not sure') ||
      response.toolCalls.length === 0 && response.content.length > 500, // 생각만 하고 도구 안 씀
      response.toolCalls.some(t => t.name === 'bash' && t.args.command.includes('rm')),
    ];

    if (uncertaintySignals.some(s => s)) {
      await vscode.window.showInformationMessage(
        'Agent가 불확실해 보입니다. 다음 단계를 확인해주세요.',
        '계속', '중단', '계획 다시 짜기'
      );
    }
  }
}
```

### 16.5 로컬 실행/검증 환경 내장 (Zero-Roundtrip Verification)

API 호출 없이 **로컬에서 즉시 검증** → 빠른 피드백 루프

```typescript
// 로컬 검증 파이프라인
class LocalVerificationPipeline {
  // TypeScript 타입 체크 (tsc --noEmit)
  async typeCheck(files: string[]): Promise<Diagnostic[]> {
    const config = await this.findTsConfig();
    const args = ['--noEmit', '--skipLibCheck', ...files];
    return this.runCommand('npx', ['tsc', ...args], config.dir);
  }

  // ESLint (캐시 활용)
  async lint(files: string[]): Promise<LintResult[]> {
    return this.runCommand('npx', ['eslint', '--format', 'json', ...files]);
  }

  // Jest/Vitest 관련 테스트만 실행
  async runRelatedTests(changedFiles: string[]): Promise<TestResult> {
    const testFiles = await this.findRelatedTests(changedFiles);
    return this.runCommand('npx', ['jest', '--passWithNoTests', ...testFiles]);
  }

  // 단일 함수 단위 실행 (REPL 스타일)
  async evaluateSnippet(code: string, context: { imports: string; vars: Record<string, any> }): Promise<any> {
    const wrapper = `
${context.imports}
const __context = ${JSON.stringify(context.vars)};
${code}
    `;
    // Node.js vm 모듈로 안전 실행 (타임아웃 5초)
    return this.runInVM(wrapper, 5000);
  }

  // 컴파일+실행 원샷 (Go, Rust 등)
  async compileAndRun(file: string): Promise<RunResult> {
    const ext = path.extname(file);
    const commands: Record<string, string[]> = {
      '.ts': ['npx', 'ts-node', file],
      '.py': ['python3', file],
      '.go': ['go', 'run', file],
      '.rs': ['rustc', file, '-o', '/tmp/out', '&&', '/tmp/out'],
    };
    return this.runCommand(...commands[ext] ?? []);
  }
}
```

### 16.6 반복적 정교화 워크플로 (Iterative Refinement)

```
┌─────────────────────────────────────────────────────────────────┐
│                    REFINEMENT LOOP                               │
├─────────────────────────────────────────────────────────────────┤
│  1. ROUGH DRAFT     →  모델이 대략적 구현 생성                   │
│       │                                                         │
│       ▼                                                         │
│  2. STATIC CHECK    →  타입/린트/컴파일 에러 자동 수정           │
│       │                                                         │
│       ▼                                                         │
│  3. UNIT TEST       →  관련 테스트 실행, 실패 시 1로 루프        │
│       │                                                         │
│       ▼                                                         │
│  4. INTEGRATION     →  전체 테스트 스위트, E2E 검증             │
│       │                                                         │
│       ▼                                                         │
│  5. CODE REVIEW     →  체크리스트 기반 자동 리뷰 (복잡도, 안전성)│
│       │                                                         │
│       ▼                                                         │
│  6. PERFORMANCE     →  벤치마크/프로파일링 (옵션)               │
│       │                                                         │
│       ▼                                                         │
│  7. DOCUMENT        →  타입/주석/README 업데이트                 │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
// 정교화 파이프라인 실행기
class RefinementPipeline {
  async refine(initialCode: string, spec: TaskSpec): Promise<RefinedResult> {
    let current = initialCode;
    const stages = [
      { name: 'static', fn: () => this.staticCheck(current), maxRetries: 3 },
      { name: 'unit', fn: () => this.runUnitTests(current, spec), maxRetries: 3 },
      { name: 'integration', fn: () => this.runIntegrationTests(spec), maxRetries: 2 },
      { name: 'review', fn: () => this.autoReview(current), maxRetries: 1 },
      { name: 'perf', fn: () => this.benchmark(current), maxRetries: 0, optional: true },
      { name: 'docs', fn: () => this.updateDocs(current, spec), maxRetries: 1 },
    ];

    for (const stage of stages) {
      for (let attempt = 0; attempt <= stage.maxRetries; attempt++) {
        const result = await stage.fn();
        if (result.passed) {
          current = result.code ?? current;
          break;
        }
        if (attempt === stage.maxRetries) {
          if (!stage.optional) throw new Error(`Stage ${stage.name} failed`);
        } else {
          // 모델에게 피드백 주고 재생성 요청
          current = await this.regenerateWithFeedback(current, result.errors, stage.name);
        }
      }
    }
    return { code: current, stages: this.stageResults };
  }
}
```

### 16.7 소형 모델 한계 보완 패턴 (Anti-Pattern Prevention)

| 소형 모델 약점 | 확장프로그램 대응 |
|---------------|------------------|
| **긴 컨텍스트에서 일관성 잃음** | 파일 단위 분할 + 요약 컨텍스트 주입 |
| **복잡한 멀티스텝 계획 실패** | 플래너(작은 모델) → 실행자(큰 모델) 분리 |
| **예외 처리/에러 핸들링 누락** | 템플릿에 `try/catch` 강제 패턴 내장 |
| **비동기 처리 실수 (await 누락)** | 타입 체크 + 린트 룰(`require-await`) 강제 |
| **경계 조건 미고려** | 퍼즈 테스트/경계값 테스트 자동 생성 |
| **네이밍/컨벤션 불일치** | 워크스페이스 기존 코드 스타일 분석 후 강제 적용 |
| **의존성/임포트 실수** | `find_symbols`/`find_references`로 실제 존재 확인 후 작성 |

```typescript
// 네이밍 컨벤션 자동 추출 & 강제
class ConventionEnforcer {
  async extractConventions(): Promise<CodeConventions> {
    const files = await vscode.workspace.findFiles('**/*.ts', '**/node_modules/**', 50);
    const samples = await Promise.all(files.slice(0, 20).map(f => vscode.workspace.openTextDocument(f)));
    
    return {
      naming: this.analyzeNaming(samples),        // camelCase, PascalCase, UPPER_SNAKE
      imports: this.analyzeImports(samples),      // 그룹화, 정렬 규칙
      types: this.analyzeTypePatterns(samples),   // interface vs type, 제네릭 패턴
      errorHandling: this.analyzeErrorPatterns(samples), // try/catch, Result<T>, throw
      asyncPatterns: this.analyzeAsyncPatterns(samples), // Promise, async/await, Observable
    };
  }

  // 프롬프트에 컨벤션 주입
  buildConventionPrompt(conventions: CodeConventions): string {
    return `
Follow these EXACT conventions from this codebase:

Naming: ${conventions.naming.summary}
Imports: ${conventions.imports.summary}
Types: ${conventions.types.summary}
Error Handling: ${conventions.errorHandling.summary}
Async: ${conventions.asyncPatterns.summary}

VIOLATIONS WILL BE REJECTED BY LINTER.
`;
  }
}
```

### 16.8 실전 설정 예시 (settings.json)

```json
{
  "agent.model": "qwen3-14b",                    // 소형 모델
  "agent.maxTurns": 30,
  "agent.enforcedToolLoop": true,               // 도구 사용 강제
  "agent.contextInjection": "full",             // 전체 컨텍스트 자동 주입
  "agent.verificationPipeline": [               // 검증 파이프라인
    "typecheck",
    "lint", 
    "test:related",
    "test:affected"
  ],
  "agent.refinementStages": [                   // 정교화 단계
    "static",
    "unit",
    "integration", 
    "review",
    "docs"
  ],
  "agent.checkpoints": [                        // 사람 개입 지점
    "delete",
    "production",
    "schema",
    "security",
    "force_flag"
  ],
  "agent.conventionEnforcement": "strict",      // 컨벤션 강제
  "agent.localVerification": true,              // 로컬 즉시 검증
  "agent.maxRetriesPerStage": 3
}
```

---

## 17. 알려진 한계 및 대안

| 한계 | 설명 | 완화 방안 |
|------|------|-----------|
| **컨텍스트 윈도우** | 128K 토큰 초과 시 정보 손실 | 요약 + RAG (벡터 DB) 병행 |
| **결정적이지 않음** | 같은 입력 다른 출력 가능 | Temperature 0, Seed 고정, 검증 단계 추가 |
| **비용 예측 어려움** | 토큰 사용량 사전 예측 불가 | 예산 상한 설정, 실시간 비용 알림 |
| **오프라인 불가** | LLM API 필수 | 로컬 모델 옵션 제공 (Ollama) |
| **VS Code 종속** | 타 IDE 이식 어려움 | Core 로직 별도 패키지화 (framework-agnostic) |
| **대형 코드베이스** | 전체 인덱싱 시간 오래 걸림 | 증분 인덱싱, 파일 시스템 watcher |

---

## 18. 경쟁 에이전트 도구 분석 & 차별화 기능

> opencode, Claude Code, Cline, Cursor, Windsurf 등 기존 도구의 강점 기능 중 **우리가 추가 구현하면 좋은 것들**

### 18.1 opencode 강점 기능

| 기능 | 설명 | 구현 난이도 | 우선순위 |
|------|------|-------------|----------|
| **파일 참조 `@` 멘션** | 채팅에서 `@파일명` 입력 시 자동 컨텍스트 주입 | 낮 | **높음** |
| **터미널 출력 자동 캡처** | 백그라운드 터미널 실행 결과를 자동으로 컨텍스트에 추가 | 중간 | **높음** |
| **Git 워크트리 병렬 실행** | 여러 브랜치에서 동시 작업 후 병합 | 높음 | 중간 |
| **세션 공유 URL** | 현재 세션을 읽기 전용 링크로 공유 | 낮음 | 중간 |
| **비용 실시간 표시** | 토큰/비용을 사이드바에 실시간 업데이트 | 낮음 | **높음** |
| **모델별 프롬프트 템플릿** | 모델별 최적화된 시스템 프롬프트 자동 적용 | 중간 | 중간 |

```typescript
// @멘션 파싱 및 자동 컨텍스트 주입
class MentionParser {
  parse(message: string): { cleanMessage: string; mentions: Mention[] } {
    const mentionRegex = /@([\w\-\.\/]+)/g;
    const mentions: Mention[] = [];
    let cleanMessage = message;
    
    let match;
    while ((match = mentionRegex.exec(message)) !== null) {
      const path = match[1];
      mentions.push({ type: 'file', path, range: [match.index, match.index + match[0].length] });
      cleanMessage = cleanMessage.replace(match[0], '');
    }
    return { cleanMessage, mentions };
  }

  async resolveMentions(mentions: Mention[]): Promise<ContextInjection[]> {
    return Promise.all(mentions.map(async m => {
      if (m.type === 'file') {
        const content = await this.readFile(m.path);
        return { source: `@${m.path}`, content, priority: 'high' };
      }
    }));
  }
}
```

### 18.2 Claude Code 강점 기능

| 기능 | 설명 | 구현 난이도 | 우선순위 |
|------|------|-------------|----------|
| **Bash 툴 네이티브 통합** | 터미널을 도구처럼 사용, 출력 스트리밍, 인터랙티브 지원 | 중간 | **높음** |
| **슬래시 명령어 `/`** | `/compact`, `/cost`, `/model`, `/permissions` 등 내장 명령 | 낮음 | **높음** |
| **서브에이전트 `Task` 툴** | 독립적인 컨텍스트로 서브태스크 위임, 결과만 반환 | 중간 | **높음** |
| **파일 시스템 watcher** | 파일 변경 감지 → 자동 컨텍스트 갱신 | 중간 | 중간 |
| **MCP (Model Context Protocol)** | 외부 도구/데이터 소스 표준화 연동 | 높음 | 중간 |
| **권한 시스템 세분화** | 도구별/경로별/명령별 허용/거부/항상묻기 | 중간 | **높음** |

```typescript
// 슬래시 명령어 시스템
class SlashCommandRegistry {
  private commands: Map<string, SlashCommand> = new Map();

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd);
  }

  async execute(input: string): Promise<CommandResult> {
    const match = input.match(/^\/(\w+)(?:\s+(.*))?$/);
    if (!match) return { handled: false };

    const [, name, args] = match;
    const cmd = this.commands.get(name);
    if (!cmd) return { handled: false, error: `Unknown command: /${name}` };

    return cmd.handler(args?.split(' ') ?? []);
  }
}

// 내장 명령어 예시
const builtInCommands: SlashCommand[] = [
  { 
    name: 'compact', 
    description: '대화 기록 요약하여 토큰 절약',
    handler: async () => { await contextManager.summarize(); return { success: true }; }
  },
  { 
    name: 'cost', 
    description: '현재 세션 비용 상세 표시',
    handler: async () => { return { success: true, data: tokenTracker.getDetailedReport() }; }
  },
  { 
    name: 'model', 
    description: '모델 변경 (예: /model claude-sonnet-4)',
    handler: async (args) => { 
      if (args[0]) { configManager.setModel(args[0]); return { success: true }; }
      return { success: false, error: 'Model name required' };
    }
  },
  { 
    name: 'permissions', 
    description: '도구 권한 설정 변경',
    handler: async () => { await permissionManager.showSettingsUI(); return { success: true }; }
  },
];
```

### 18.3 Cline 강점 기능

| 기능 | 설명 | 구현 난이도 | 우선순위 |
|------|------|-------------|----------|
| **체크포인트/롤백** | 파일 편집 전 자동 스냅샷, 원클릭 복원 | 중간 | **높음** |
| **브라우저 프리뷰** | 웹앱 개발 시 내장 브라우저로 실시간 미리보기 | 높음 | 중간 |
| **MCP 서버 관리 UI** | MCP 서버 설치/설정/디버깅 GUI 제공 | 높음 | 중간 |
| **작업 계획 시각화** | TODO 리스트를 칸반 스타일로 표시, 진행률 추적 | 낮음 | **높음** |
| **모드 전환** | Plan/Act/Debug 모드별 도구 권한 다름 | 중간 | 중간 |

```typescript
// 체크포인트 시스템 (Cline 스타일)
class CheckpointManager {
  private snapshots: Map<string, FileSnapshot[]> = new Map();

  async createCheckpoint(label: string): Promise<string> {
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const files = await this.getWorkspaceFiles();
    const snapshots = await Promise.all(
      files.map(async f => ({
        path: f,
        content: await vscode.workspace.fs.readFile(vscode.Uri.file(f)),
        mtime: fs.statSync(f).mtimeMs,
      }))
    );
    this.snapshots.set(id, snapshots);
    
    // UI에 표시
    this.webview.postMessage({ type: 'checkpointCreated', id, label, time: Date.now() });
    return id;
  }

  async rollback(checkpointId: string): Promise<void> {
    const snapshots = this.snapshots.get(checkpointId);
    if (!snapshots) throw new Error('Checkpoint not found');

    const edits = new vscode.WorkspaceEdit();
    for (const snap of snapshots) {
      const uri = vscode.Uri.file(snap.path);
      // 현재 내용과 비교 후 diff 적용
      const current = await vscode.workspace.fs.readFile(uri);
      if (!current.equals(snap.content)) {
        edits.replace(uri, new vscode.Range(0, 0, 999999, 999999), 
          new TextDecoder().decode(snap.content));
      }
    }
    await vscode.workspace.applyEdit(edits);
  }

  // 자동 체크포인트 (쓰기 도구 호출 전)
  async autoCheckpointBeforeWrite(filePath: string): Promise<void> {
    const id = await this.createCheckpoint(`Before edit: ${path.basename(filePath)}`);
    // 50개 이상이면 오래된 것 정리
    if (this.snapshots.size > 50) this.pruneOld();
  }
}
```

### 18.4 Cursor/Windsurf 강점 기능

| 기능 | 설명 | 구현 난이도 | 우선순위 |
|------|------|-------------|----------|
| **Tab 완성은 코드 생성** | 인라인 편집 제안 (Ghost Text), Tab으로 수락 | 높음 | **높음** |
| **Cmd+K 인라인 편집** | 선택 영역에 자연어로 수정 지시 | 높음 | **높음** |
| **코드베이스 임베딩 검색** | `@codebase` 멘션으로 전체 코드 시맨틱 검색 | 높음 | 중간 |
| **규칙 파일 (`.cursorrules`)** | 프로젝트별 규칙 파일을 자동 로드하여 프롬프트에 주입 | 낮음 | **높음** |
| **멀티파일 편집 뷰** | 여러 파일 변경사항을 통합 Diff 뷰로 표시 | 중간 | 중간 |

```typescript
// .agentrules 파일 자동 로드 (CursorRules 스타일)
class RulesLoader {
  async loadRules(): Promise<string> {
    const patterns = ['.agentrules', '.cursorrules', '.clinerules', 'AGENTS.md'];
    let combined = '';

    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(`**/${pattern}`, '**/node_modules/**', 5);
      for (const file of files) {
        const content = await vscode.workspace.fs.readFile(file);
        combined += `\n\n=== ${file.fsPath} ===\n${new TextDecoder().decode(content)}`;
      }
    }
    return combined;
  }

  // 시스템 프롬프트에 자동 주입
  buildSystemPrompt(basePrompt: string): string {
    const rules = this.loadRules();
    if (!rules) return basePrompt;
    return `${basePrompt}\n\n--- PROJECT RULES (MANDATORY) ---\n${rules}\n--- END RULES ---`;
  }
}
```

### 18.5 종합 우선순위 매트릭스

| 기능 | 구현 노력 | 사용자 임팩트 | 차별화 | 추천 순서 |
|------|-----------|---------------|--------|-----------|
| `@파일 멘션` | 낮음 | **매우 높음** | 높음 | **1순위** |
| `슬래시 명령어 (/)` | 낮음 | **매우 높음** | 높음 | **2순위** |
| `체크포인트/롤백` | 중간 | **높음** | 높음 | **3순위** |
| `비용 실시간 표시` | 낮음 | **높음** | 중간 | **4순위** |
| `작업 계획 칸반` | 낮음 | 높음 | 중간 | **5순위** |
| `.agentrules 자동 로드` | 낮음 | 높음 | 높음 | **6순위** |
| `서브에이전트 Task 툴` | 중간 | 높음 | 높음 | **7순위** |
| `MCP 연동` | 높음 | 중간 | 높음 | 8순위 |
| `인라인 고스트 텍스트` | 높음 | **매우 높음** | 낮음 | 9순위 |
| `브라우저 프리뷰` | 높음 | 중간 | 중간 | 10순위 |

---

## 19. 모델 성능 향상 핵심 기능 (Model Performance Boosters)

> **UX 편의 기능이 아님**. 모델이 **더 정확하게, 더 적게 실수하며, 더 정교하게 코딩**하게 만드는 핵심 아키텍처 기능들

### 19.1 지능형 컨텍스트 구성 (Smart Context Assembly)

| 기법 | 설명 | 성능 향상 |
|------|------|-----------|
| **작업 유형별 컨텍스트 템플릿** | 버그수정/리팩토링/신기능/리뷰별 필수 컨텍스트 다름 | +20~30% 정확도 |
| **관련도 기반 파일 랭킹** | 임베딩 + 심볼 참조 + Git 이력으로 Top-K 선별 | 토큰 50% 절약 + 정확도↑ |
| **동적 컨텍스트 예산** | 작업 복잡도에 따라 컨텍스트 크기 자동 조절 | 비용 최적화 |
| **실패 패턴 메모리** | 과거 실패 케이스 저장 → 유사 작업 시 경고 주입 | 재실수 방지 |

```typescript
// 작업 유형별 컨텍스트 전략
const CONTEXT_STRATEGIES: Record<TaskType, ContextStrategy> = {
  bug_fix: {
    required: ['failing_test', 'error_message', 'related_files', 'recent_changes'],
    optional: ['similar_bugs_fixed', 'dependency_graph'],
    maxTokens: 40000,
  },
  refactor: {
    required: ['target_files', 'test_files', 'usage_examples', 'type_definitions'],
    optional: ['architectural_docs', 'performance_baselines'],
    maxTokens: 50000,
  },
  new_feature: {
    required: ['spec', 'similar_features', 'api_contracts', 'data_models'],
    optional: ['ui_mocks', 'integration_points'],
    maxTokens: 60000,
  },
  code_review: {
    required: ['changed_files', 'diff', 'related_tests', 'conventions'],
    optional: ['security_checklist', 'performance_guidelines'],
    maxTokens: 30000,
  },
};

class SmartContextAssembler {
  async assemble(task: Task, type: TaskType): Promise<ContextPackage> {
    const strategy = CONTEXT_STRATEGIES[type];
    const items: ContextItem[] = [];

    // 1. 필수 항목 수집 (병렬)
    const required = await Promise.all(
      strategy.required.map(key => this.collect(key, task))
    );
    items.push(...required.filter(Boolean));

    // 2. 토큰 예산 내 선택적 항목 추가 (중요도 순)
    let usedTokens = items.reduce((sum, i) => sum + i.tokens, 0);
    for (const key of strategy.optional) {
      if (usedTokens >= strategy.maxTokens) break;
      const item = await this.collect(key, task);
      if (item && usedTokens + item.tokens <= strategy.maxTokens) {
        items.push(item);
        usedTokens += item.tokens;
      }
    }

    // 3. 실패 패턴 경고 주입
    const warnings = await this.getRelevantFailurePatterns(task);
    if (warnings.length) items.push({ type: 'warning', content: warnings, priority: 'high' });

    return { items, totalTokens: usedTokens, strategy: type };
  }
}
```

### 19.2 검증 루프 자동화 (Automated Verification Loops)

> **핵심**: 모델이 작성한 코드를 **즉시 실행/검증**하고, 실패 시 **자동으로 피드백** 주어 재시도

| 검증 레이어 | 도구 | 시점 | 실패 시 액션 |
|------------|------|------|-------------|
| **구문/타입** | `tsc --noEmit`, `pyright` | 작성 직후 | 즉시 재작성 (최대 3회) |
| **린트/포맷** | ESLint, Prettier, Ruff | 저장 시 | 자동 수정 (`--fix`) |
| **단위 테스트** | Jest, Vitest, pytest | 함수 완성 시 | 관련 테스트 실행, 실패 시 재작성 |
| **통합 테스트** | Playwright, Cypress | 기능 완성 시 | E2E 시나리오 실행 |
| **정적 분석** | SonarQube, CodeQL | PR 전 | 보안/품질 게이트 |
| **성능 벤치마크** | benchmark.js, criterion | 최적화 작업 시 | 기준선 대비 회귀 체크 |

```typescript
// 다층 검증 파이프라인
class VerificationPipeline {
  private stages: VerificationStage[] = [
    { name: 'syntax', tool: 'tsc', args: ['--noEmit'], maxRetries: 3, autoFix: true },
    { name: 'lint', tool: 'eslint', args: ['--fix'], maxRetries: 2, autoFix: true },
    { name: 'typecheck', tool: 'tsc', args: ['--noEmit'], maxRetries: 3, autoFix: false },
    { name: 'unit_test', tool: 'jest', args: ['--passWithNoTests'], maxRetries: 3, autoFix: false },
    { name: 'integration_test', tool: 'playwright', args: ['test'], maxRetries: 1, autoFix: false },
  ];

  async verify(files: string[], task: Task): Promise<VerificationResult> {
    for (const stage of this.stages) {
      for (let attempt = 0; attempt <= stage.maxRetries; attempt++) {
        const result = await this.runStage(stage, files);
        if (result.passed) break;
        
        if (attempt < stage.maxRetries) {
          // 모델에게 피드백 주고 재작성 요청
          const feedback = this.formatFeedback(stage.name, result.errors);
          const fixed = await this.requestFix(task, feedback, files);
          files = fixed.files; // 수정된 파일들로 교체
        } else {
          return { passed: false, failedStage: stage.name, errors: result.errors };
        }
      }
    }
    return { passed: true };
  }

  private formatFeedback(stage: string, errors: string[]): string {
    return `### ${stage.toUpperCase()} FAILED (Attempt ${attempt + 1})\n${errors.join('\n')}\n\nFix the above issues.`;
  }
}
```

### 19.3 자기 비판/반성 루프 (Self-Critique & Reflection)

| 기법 | 구현 | 효과 |
|------|------|------|
| **작성 후 자기 리뷰** | 같은 모델에게 "이 코드 리뷰해줘" 프롬프트로 2패스 | 논리 오류 40% 감소 |
| **비판적 페르소나** | "당신은 시니어 리뷰어입니다. 혹독하게 비판하세요" 시스템 프롬프트 | 엣지 케이스 발견 |
| **대안 생성 후 비교** | N개 구현 생성 → 베리파이어가 최선 선택 | Best-of-N 효과 |
| **실행 트레이스 분석** | 실제 실행 로그/스택 트레이스를 다음 턴 컨텍스트에 주입 | 런타임 버그 조기 발견 |

```typescript
// 자기 비판 루프
class SelfCritiqueLoop {
  async critiqueAndImprove(code: string, task: Task): Promise<string> {
    let current = code;
    
    for (let round = 0; round < 2; round++) {
      // 1. 자기 비판 생성
      const critique = await this.model.generate(`
You are a senior code reviewer. Find ALL issues in this code:

${current}

Task: ${task.description}

Check for:
- Logic errors, off-by-one, null derefs
- Missing error handling, edge cases
- Performance anti-patterns
- Security vulnerabilities
- Test coverage gaps
- Convention violations

Output JSON: { issues: [{severity, line, message, fix}] }
      `);

      const issues = JSON.parse(critique).issues;
      if (issues.length === 0) break;

      // 2. 비판 반영해 재작성
      current = await this.model.generate(`
Fix these issues in the code:

${current}

Issues:
${issues.map(i => `- Line ${i.line}: ${i.message} (${i.severity})`).join('\n')}

Output ONLY the fixed code.
      `);
    }
    return current;
  }
}
```

### 19.4 작업 분해/계획 강제 (Enforced Planning)

| 기법 | 구현 | 효과 |
|------|------|------|
| **강제 계획 단계** | 코드 작성 전 `plan` 툴 호출 필수, 승인 후 진행 | 설계 오류 60% 감소 |
| **서브태스크 분리** | 복잡 작업 → 독립 서브에이전트 위임 (`Task` 툴) | 컨텍스트 오염 방지 |
| **체크리스트 강제** | 작업 완료 전 체크리스트 모든 항목 체크 필수 | 누락 방지 |
| **사전/사후 조건 명세** | 각 함수/클래스에 `requires/ensures` 주석 강제 | 계약 기반 개발 |

```typescript
// 강제 계획 도구
const planTool: ToolDefinition = {
  name: 'plan',
  description: 'Create execution plan before coding. MUST be called first for complex tasks.',
  parameters: {
    type: 'object',
    properties: {
      steps: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
      testStrategy: { type: 'string' },
      estimatedTurns: { type: 'number' },
    },
    required: ['steps', 'testStrategy'],
  },
  handler: async (args) => {
    // 계획 저장, 사용자 승인 대기
    await this.showPlanForApproval(args);
    return { success: true, planId: this.storePlan(args) };
  },
};

// 코드 작성 도구는 계획 승인 후에만 활성화
const writeTool: ToolDefinition = {
  name: 'write',
  // ...
  precondition: (ctx) => ctx.approvedPlanId != null, // 계획 승인 필수
};
```

### 19.5 코드베이스 지능 활용 (Code Intelligence Integration)

| 소스 | 추출 정보 | 프롬프트 주입 방식 |
|------|-----------|-------------------|
| **LSP (Language Server)** | 타입, 시그니처, 호출 계층, 정의/참조 | 현재 심볼 컨텍스트 자동 첨부 |
| **Tree-sitter AST** | 구조적 패턴, 임포트 그래프, 의존성 | 관련 파일 자동 추천 |
| **Git 이력** | 핫스팟 파일, 최근 변경자, 버그 도입 커밋 | 위험도 경고 |
| **테스트 커버리지** | 미커버 라인, 취약 모듈 | 테스트 생성 우선순위 |
| **정적 분석 경고** | SonarQube, CodeQL 결과 | 보안/품질 가드레일 |

```typescript
// LSP 기반 컨텍스트 강화
class LSPContextEnhancer {
  async enhanceAtCursor(uri: vscode.Uri, position: vscode.Position): Promise<ContextInjection[]> {
    const injections: ContextInjection[] = [];

    // 1. 심볼 정보 (타입, 시그니처, 문서)
    const hover = await vscode.commands.executeCommand<vscode.Hover>(
      'vscode.executeHoverProvider', uri, position
    );
    if (hover) injections.push({ type: 'type_info', content: hover.contents });

    // 2. 정의 위치 (인터페이스/타입 정의 확인용)
    const defs = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider', uri, position
    );
    if (defs?.length) {
      const defContent = await Promise.all(defs.map(d => this.readFile(d.uri.fsPath)));
      injections.push({ type: 'definition', content: defContent.join('\n') });
    }

    // 3. 참조 위치 (영향 범위 파악)
    const refs = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider', uri, position
    );
    if (refs?.length) {
      injections.push({ 
        type: 'references', 
        content: `Referenced in ${refs.length} places: ${refs.slice(0, 10).map(r => r.uri.fsPath).join(', ')}` 
      });
    }

    // 4. 호출 계층 (상위/하위 함수)
    const calls = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
      'vscode.prepareCallHierarchy', uri, position
    );
    if (calls?.length) {
      const incoming = await this.getIncomingCalls(calls[0]);
      const outgoing = await this.getOutgoingCalls(calls[0]);
      injections.push({ type: 'call_hierarchy', content: { incoming, outgoing } });
    }

    return injections;
  }
}
```

### 19.6 멀티모델 라우팅 (Multi-Model Routing)

| 작업 유형 | 추천 모델 | 이유 |
|-----------|-----------|------|
| **계획/아키텍처** | Claude-4 Opus / GPT-5 | 추론력, 장기 계획 최강 |
| **코드 생성** | DeepSeek-V4-Flash / Qwen3-Coder | 코딩 특화, 속도/비용 균형 |
| **리뷰/비판** | Claude-4 Sonnet / GPT-5 mini | 비판적 사고, 지시 수행 우수 |
| **간단 수정/탭완성** | Qwen-14B / Nemotron-3B (로컬) | 지연시간 <100ms, 비용 0 |
| **테스트 생성** | Qwen3-235B-A22B / DeepSeek-V4 | 패턴 인식, 커버리지 높음 |

```typescript
// 작업별 모델 자동 선택 라우터
class ModelRouter {
  private routes: Record<TaskCategory, ModelConfig> = {
    planning: { model: 'anthropic/claude-4-opus', temperature: 0.1 },
    coding: { model: 'deepseek/deepseek-v4-flash', temperature: 0.2 },
    review: { model: 'anthropic/claude-4-sonnet', temperature: 0.1 },
    quick_edit: { model: 'local/qwen-14b', temperature: 0.0 },
    test_gen: { model: 'qwen/qwen3-235b-a22b', temperature: 0.3 },
  };

  selectModel(task: Task): ModelConfig {
    const category = this.categorize(task);
    return this.routes[category] ?? this.routes.coding;
  }

  // 폴백 체인: 1차 실패 시 자동으로 다음 모델 시도
  async executeWithFallback(task: Task, models: ModelConfig[]): Promise<Result> {
    for (const model of models) {
      try {
        return await this.callModel(model, task);
      } catch (e) {
        if (this.isRetriable(e)) continue;
        throw e;
      }
    }
    throw new Error('All models failed');
  }
}
```

### 19.7 메모리/지식 축적 (Persistent Memory)

| 메모리 유형 | 저장 내용 | 활용 시점 |
|------------|-----------|-----------|
| **패턴 라이브러리** | 성공한 구현 패턴, 자주 쓰는 유틸 | 유사 작업 시 예시 주입 |
| **실패 DB** | 버그 원인, 수정 패턴, 회귀 테스트 | 동일 실수 방지 |
| **프로젝트 컨벤션** | 네이밍, 아키텍처 결정, 라이브러리 선택 | 일관성 강제 |
| **도메인 지식** | 비즈니스 규칙, API 계약, 데이터 플로우 | 도메인 특화 코드 생성 |
| **성능 베이스라인** | 벤치마크 결과, 병목 지점 | 최적화 검증 |

```typescript
// 영구 메모리 저장소
class ProjectMemory {
  private db: VectorDB; // 로컬 SQLite + 벡터 인덱스

  async recordSuccess(pattern: SuccessPattern): Promise<void> {
    await this.db.upsert('patterns', {
      id: hash(pattern),
      embedding: await embed(pattern.description),
      metadata: {
        type: pattern.type, // 'api_wrapper', 'error_handling', 'test_pattern', ...
        files: pattern.files,
        tags: pattern.tags,
        createdAt: Date.now(),
      },
      content: pattern.code,
    });
  }

  async getRelevantPatterns(task: Task, k = 3): Promise<Pattern[]> {
    const queryEmbedding = await embed(task.description);
    return this.db.query('patterns', queryEmbedding, k, {
      filter: { projectId: this.projectId },
    });
  }

  async recordFailure(failure: FailureRecord): Promise<void> {
    await this.db.upsert('failures', {
      id: hash(failure.error + failure.fix),
      embedding: await embed(failure.error),
      metadata: { errorType: failure.type, fixedAt: Date.now() },
      content: `Error: ${failure.error}\nFix: ${failure.fix}\nTest: ${failure.regressionTest}`,
    });
  }

  async getWarnings(task: Task): Promise<string[]> {
    const failures = await this.db.query('failures', await embed(task.description), 5);
    return failures.map(f => `⚠️ Similar past failure: ${f.metadata.errorType} - ${f.content.split('\n')[1]}`);
  }
}
```

### 19.8 성능 향상 기능 우선순위 (Impact vs Effort)

| 기능 | 구현 노력 | 모델 성능 임팩트 | ROI | 추천 |
|------|-----------|------------------|-----|------|
| **다층 검증 파이프라인** | 중간 | **매우 높음** | **최고** | **1순위** |
| **작업별 컨텍스트 전략** | 낮음 | **높음** | **최고** | **2순위** |
| **강제 계획/체크리스트** | 낮음 | **높음** | **최고** | **3순위** |
| **LSP/타입 정보 주입** | 중간 | **높음** | 높음 | **4순위** |
| **자기 비판 루프** | 낮음 | 중간~높음 | 높음 | **5순위** |
| **멀티모델 라우팅** | 중간 | 중간 | 중간 | 6순위 |
| **프로젝트 메모리** | 중간 | 중간 (장기적 누적) | 중간 | 7순위 |
| **코드 임베딩 검색** | 높음 | 중간 | 낮음 | 8순위 |

---

## 20. 참고 자료

- VS Code Extension API
- Language Model API (VS Code 1.95+)
- OpenRouter API Docs
- Anthropic Tool Use Guide
- Model Context Protocol (MCP)
- vLLM Semantic Router
문서 정리좀 해주고 우리 에이전트 k에 필요한 기능 추려줘
</user_query>