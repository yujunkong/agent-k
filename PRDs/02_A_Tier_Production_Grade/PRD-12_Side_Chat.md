# PRD-12: Side Chat (Side Chat / `/side`)

> **Priority**: A급 (메인 Agent 안 끊고 탐색)  
> **Phase**: C4~C7  
> **관련 PRD**: `PRD-17_Message_Queue.md`, `PRD-Tools-F_Orchestration_Extension.md`, `PRD-15_Memories.md`

---

## 1. Overview

### 목적
메인 Agent 루프가 **실행 중**일 때도 별도의 **읽기 전용 세션**을 열어 코드 탐색·질문·분석을 병행한다. 결과를 메인 채팅에서 `@side-결과`로 인용해 컨텍스트에 합친다.

### 비즈니스 가치
- **컨텍스트 오염 방지**: 메인 루프의 토큰 예산·도구 호출 이력에 영향 없음
- **병렬 탐색**: "이 함수 어디서 쓰여?" 같은 탐색을 메인 작업 막히지 않게 수행
- **하네스 친화**: 읽기 전용이라 중급 모델도 안전하게 사용 가능

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, Agent가 20턴째 리팩터링 중일 때 옆에서 "이 인터페이스 구현체 어디야?"라고 묻고 싶다 |
| US-02 | 개발자로서, Side chat에서 찾은 파일 3개를 `@side-findings`로 메인에 넘겨 Agent가 바로 쓰게 하고 싶다 |
| US-03 | 개발자로서, Side chat은 쓰기 도구가 없어서 실수로 코드 고치는 일 없길 원한다 |

---

## 2. Functional Requirements

### 2.1 Side Chat 세션 관리
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 진입 명령 | 채팅 입력에서 `/side` 또는 사이드바 "+ Side Chat" 버튼 |
| FR-02 | 독립 컨텍스트 | 별도 메시지 히스토리, 별도 시스템 프롬프트(읽기 전용) |
| FR-03 | 도구 화이트리스트 | `grep`, `glob`, `list_dir`, `read_file`, `codebase_search`, `lsp_*`, `ask_question` **만** |
| FR-04 | 쓰기 도구 완전 차단 | `edit_file`, `write_file`, `delete_file`, `run_terminal_cmd` 등 등록 안 함 |
| FR-05 | 메인 세션 참조 | 메인 세션의 열린 파일, @멘션, 규칙 읽기 가능 (단방향) |
| FR-06 | 결과물 생성 | `/side done` 또는 "결과 저장" 버튼 → 요약 + 파일 리스트를 아티팩트로 저장 |

### 2.2 결과 인용 (`@side-<id>`)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-07 | 아티팩트 저장 | Side chat 종료 시 `workspaceState`에 `{ id, summary, files[], timestamp }` 저장 |
| FR-08 | 메인에서 인용 | 메인 채팅에서 `@side-<id>` 입력 → 자동완성 → 아티팩트 내용 컨텍스트 주입 |
| FR-09 | 인용 포맷 | `<side_ref id="side-abc123">Summary: Found 3 implementations... Files: [src/a.ts, src/b.ts]</side_ref>` |
| FR-10 | 다중 Side chat | 동시에 여러 Side chat 가능 (탭 UI), 각각 고유 ID |

### 2.3 UI/UX
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-11 | 탭 인터페이스 | 사이드바 패널 상단 탭: [Main] [Side: auth] [Side: api] |
| FR-12 | 상태 표시 | 메인 루프 실행 중일 때 Side chat 탭에 🟢 "Main running" 뱃지 |
| FR-13 | 빠른 전환 | `Ctrl+Shift+S`로 Main ↔ 최근 Side chat 토글 |
| FR-14 | 자동 요약 | Side chat 10턴마다 자동 요약 블록 생성 (토큰 절약) |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 메인 루프 영향도 | Side chat 도구 실행이 메인 루프 지연시키지 않음 (별도 이벤트 루프) |
| NFR-02 | 메모리 오버헤드 | Side chat 세션당 < 50MB |
| NFR-03 | 동시 세션 수 | 최대 5개 Side chat 동시 유지 |
| NFR-04 | 아티팩트 영속성 | 워크스페이스 재시작 후에도 `@side-` 인용 가능 |

---

## 4. API & Technical Spec

### 4.1 Side Chat 컨트롤러 (`src/chat/sideChat.ts`)

```typescript
export class SideChatManager {
  private sessions = new Map<string, SideChatSession>();
  private mainSession: AgentLoop;
  private maxSessions = 5;

  createSession(name?: string): SideChatSession {
    if (this.sessions.size >= this.maxSessions) {
      // LRU 제거
      const oldest = this.sessions.values().next().value;
      this.closeSession(oldest.id);
    }

    const id = `side-${Date.now().toString(36)}`;
    const session = new SideChatSession({
      id,
      name: name || `Side ${this.sessions.size + 1}`,
      mainLoop: this.mainSession,
      toolWhitelist: SIDE_CHAT_WHITELIST,
      onArtifact: (artifact) => this.saveArtifact(artifact),
    });
    
    this.sessions.set(id, session);
    this.updateUI();
    return session;
  }

  private saveArtifact(artifact: SideArtifact): void {
    const key = `sideArtifact.${artifact.id}`;
    this.context.workspaceState.update(key, artifact);
  }

  getArtifact(id: string): SideArtifact | undefined {
    return this.context.workspaceState.get(`sideArtifact.${id}`);
  }

  listArtifacts(): SideArtifact[] {
    // workspaceState에서 sideArtifact.* 키 스캔
  }
}

const SIDE_CHAT_WHITELIST = [
  'grep', 'glob', 'list_dir', 'read_file', 
  'codebase_search', 'lsp_definition', 'lsp_references',
  'ask_question', 'todo_write'
] as const;
```

### 4.2 Side Chat 세션 (`src/chat/sideChatSession.ts`)

```typescript
export class SideChatSession {
  private messages: ChatMessage[] = [];
  private loop: AgentLoop;

  constructor(private config: SideChatConfig) {
    this.loop = new AgentLoop({
      mode: 'ask',  // 강제 Ask 모드
      toolWhitelist: config.toolWhitelist,
      provider: config.mainLoop.provider,
      contextAssembler: new SideContextAssembler(config.mainLoop),
      // 승인 불필요 (읽기만)
      approvalPolicy: { ask: false, accept_edits: true, auto: true, bypass: true },
    });
  }

  async *sendMessage(text: string): AsyncGenerator<ChatEvent> {
    this.messages.push({ role: 'user', content: text });
    
    // 메인 세션 컨텍스트 읽기 전용 접근
    const mainContext = this.config.mainLoop.getReadOnlyContext();
    
    for await (const event of this.loop.run([
      ...mainContext,
      ...this.messages,
    ])) {
      if (event.type === 'tool_call') {
        // 쓰기 도구 차단 검증 (이중 안전장치)
        if (!this.config.toolWhitelist.includes(event.tool.name)) {
          yield { type: 'error', message: `Tool ${event.tool.name} not allowed in Side Chat` };
          continue;
        }
      }
      yield event;
    }
  }

  async finish(): Promise<SideArtifact> {
    // 마지막 모델 응답에서 요약 추출
    const summary = await this.summarize();
    const files = this.extractReferencedFiles();
    
    const artifact: SideArtifact = {
      id: this.config.id,
      name: this.config.name,
      summary,
      files,
      messages: this.messages.slice(-20), // 최근 20턴만
      createdAt: Date.now(),
    };
    
    this.config.onArtifact(artifact);
    this.cleanup();
    return artifact;
  }
}
```

### 4.3 메인 컨텍스트 읽기 전용 뷰 (`src/context/sideContextAssembler.ts`)

```typescript
export class SideContextAssembler {
  constructor(private mainLoop: AgentLoop) {}

  assemble(): ChatMessage[] {
    return [
      {
        role: 'system',
        content: SIDE_CHAT_SYSTEM_PROMPT,
      },
      {
        role: 'system',
        content: this.formatMainContext(),
      },
    ];
  }

  private formatMainContext(): string {
    const main = this.mainLoop.getState();
    return `<main_context>
<open_files>${main.openTabs.map(t => t.path).join(', ')}</open_files>
<active_rules>${main.activeRules.map(r => r.name).join(', ')}</active_rules>
<current_mode>${main.mode}</current_mode>
<current_task>${main.currentUserGoal}</current_task>
</main_context>`;
  }
}

const SIDE_CHAT_SYSTEM_PROMPT = `당신은 읽기 전용 탐색 어시스턴트입니다.
- 메인 Agent가 실행 중인 동안 병렬로 코드베이스를 탐색합니다.
- 사용 가능한 도구: grep, glob, list_dir, read_file, codebase_search, lsp_*, ask_question
- 파일 수정·삭제·실행은 절대 금지입니다.
- 탐색 결과를 간결히 요약해 "완료" 시 아티팩트로 저장하세요.
- 메인 컨텍스트(열린 파일, 규칙, 현재 작업)를 참고하되 변경하지 마세요.`;
```

### 4.4 `@side-` 멘션 처리 (`src/chat/mentionHandler.ts`)

```typescript
function resolveSideMention(mention: string): ChatMessage | null {
  const match = mention.match(/^@side-(.+)$/);
  if (!match) return null;
  
  const artifactId = match[1];
  const artifact = sideChatManager.getArtifact(artifactId);
  if (!artifact) return null;

  return {
    role: 'system',
    content: `<side_ref id="${artifact.id}">
<summary>${artifact.summary}</summary>
<files>${artifact.files.join(', ')}</files>
<key_findings>${artifact.messages.filter(m => m.role === 'assistant').slice(-3).map(m => m.content).join('\n---\n')}</key_findings>
</side_ref>`,
  };
}
```

---

## 5. UI/UX Specification

### 5.1 사이드바 탭 인터페이스
```
┌─ Agent K ────────────────────────────────────┐
│  [Main 🟢]  [Side: auth 🔍]  [Side: api 🔍]  [+] │
├────────────────────────────────────────────────┤
│  (Side: auth 탭 선택 시)                       │
│  🔍 Side Chat: auth                            │
│  ────────────────────────────────────────────  │
│  🤖: UserService 구현체 3개 찾음:              │
│     • src/auth/UserServiceImpl.ts              │
│     • src/auth/MockUserService.ts (테스트용)   │
│     • src/auth/OAuthUserService.ts             │
│                                                │
│  [Done - Save Artifact]  [Continue]            │
│  [@file:src/auth/UserServiceImpl.ts]           │
└────────────────────────────────────────────────┘
```

### 5.2 메인 채팅에서 `@side-` 자동완성
```
User: @side-
       ├─ @side-auth-abc123  "UserService 구현체 3개 찾음"  2m ago
       ├─ @side-api-def456   "REST 엔드포인트 12개 매핑"    5m ago
       └─ @side-db-ghi789    "마이그레이션 스크립트 분석"    10m ago
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Side Chat

  Scenario: Open side chat while main agent is running
    Given main agent is in turn 15 of a refactoring task
    When user types "/side" in chat input
    Then new Side Chat tab opens
    And main agent continues running uninterrupted
    And side chat shows "Main running" badge

  Scenario: Side chat uses only read tools
    When user asks "Find all usages of PaymentService" in side chat
    Then side chat calls grep and lsp_references
    And no edit_file or run_terminal_cmd is ever registered
    And results are returned as read-only

  Scenario: Save artifact and reference in main chat
    When user clicks "Done - Save Artifact" in side chat
    Then artifact saved with summary and file list
    When user types "@side-auth-" in main chat
    Then autocomplete shows the saved artifact
    And selecting it injects summary + files into main context

  Scenario: Multiple side chats simultaneously
    When user opens 3 side chats for different topics
    Then all 3 tabs exist independently
    And each has own message history and tool calls
    And switching tabs preserves state

  Scenario: Side chat auto-summarizes long sessions
    Given side chat reaches 10 turns
    Then system injects summary block
    And token count stays under budget
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-17_Message_Queue.md` | 병행 | 메시지 큐로 메인/사이드 비동기 처리 |
| `PRD-Tools-F_Orchestration_Extension.md` | 상위 | 서브에이전트 아키텍처 공유 |
| `PRD-15_Memories.md` | 병행 | 아티팩트 저장소 공유 (workspaceState) |
| `PRD-06_Workspace_Tools.md` | 선행 | 읽기 도구 구현체 의존 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | SideChatManager + 세션 생성/탭 UI | 기본 탭 전환 동작 |
| 2 | 읽기 전용 AgentLoop (Ask 모드 강제) | 도구 화이트리스트 강제 |
| 3 | 메인 컨텍스트 읽기 전용 뷰 + 아티팩트 저장 | `workspaceState` 영속성 |
| 4 | `@side-` 멘션 파서 + 자동완성 | 메인 채팅 인용 플로우 |
| 5 | 자동 요약 (10턴마다) + 세션 정리 | 토큰 예산 준수 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 메인/사이드 컨텍스트 동기화 이슈 | 중간 | 메인 컨텍스트는 스냅샷으로 읽기만, 실시간 동기화 안 함 |
| 아티팩트 누적 저장소 비대 | 낮음 | 최대 50개 보관, 오래된 것 자동 삭제 (설정) |
| Side chat에서 실수로 쓰기 도구 호출 | 중간 | 레지스트리 레벨에서 도구 미등록 + 런타임 이중 체크 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: Side chat (`/side`)**
- Cursor Side Chat: https://cursor.sh/docs/side-chat