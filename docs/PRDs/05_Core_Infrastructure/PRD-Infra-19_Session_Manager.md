# PRD-Infra-19: Session Manager (세션 관리자)

> **Category**: Core Infrastructure  
> **Priority**: P0  
> **Phase**: C0 (Chat UI부터 필요)  
> **관련 PRD**: `PRD-C0_Chat_UI_Streaming.md`, `PRD-Infra-17_Extension_Lifecycle_Config.md`, `PRD-16_Chat_Search_Artifacts.md`, `PRD-Harness-04_Memories_Minimal.md`

---

## 1. Overview

### 목적
에이전트 **대화 세션의 전체 생명주기**를 관리: 생성, 지속, 분기, 체크포인트, 내보내기/가져오기, 검색.

### 핵심 기능
| 기능 | 설명 |
|------|------|
| **세션 CRUD** | 생성, 조회, 업데이트, 삭제, 이름 변경, 고정 |
| **분기(Fork)** | 특정 턴에서 새로운 세션 분기 (실험/대안 탐색) |
| **체크포인트** | 중요 시점 스냅샷 (자동 + 수동) |
| **영속성** | VS Code GlobalState + 선택적 파일 내보내기 |
| **검색** | 전체 텍스트 + 메타데이터 검색 (PRD-11) |
| **메모리 연동** | 세션 간 메모리 공유/상속 |

---

## 2. Data Model

### 2.1 세션 엔티티

```typescript
// src/session/types.ts

export interface ChatSession {
  id: string;                    // UUID v4
  name: string;                  // 사용자 지정 이름 또는 "Session 1"
  createdAt: number;             // Unix ms
  updatedAt: number;
  pinned: boolean;               // 고정 세션 (리스트 상단)
  archived: boolean;             // 아카이브 (숨김)
  
  // 현재 상태
  currentTurn: number;           // 현재 턴 번호 (0부터)
  maxTurns: number;              // 설정된 최대 턴
  modelTier: 'A' | 'B' | 'C';    // 사용 중인 티어
  activeMode: 'ask' | 'agent' | 'plan' | 'debug';
  
  // 컨텍스트
  systemPrompt: string;          // 적용된 시스템 프롬프트
  activeRules: string[];         // 활성 규칙 파일 경로들
  activeMemories: string[];      // 활성 메모리 ID들
  stickyContext: StickyContext;  // PRD-Infra-02 참조
  
  // 메시지 히스토리
  messages: ChatMessage[];
  
  // 체크포인트
  checkpoints: Checkpoint[];
  
  // 메타데이터
  workspaceRoot: string;         // 워크스페이스 루트 경로
  gitBranch?: string;            // 생성 시점 git 브랜치
  tags: string[];                // 사용자 태그
}

export interface ChatMessage {
  id: string;                    // UUID
  sessionId: string;
  turnNumber: number;            // 1부터 시작
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: number;
  
  // 도구 호출 (role === 'assistant' && tool_calls 존재)
  toolCalls?: ToolCall[];
  
  // 도구 결과 (role === 'tool')
  toolResult?: ToolResult;
  
  // 메타데이터
  metadata?: {
    modelUsed?: string;          // 실제 사용된 모델
    tokensUsed?: TokenUsage;
    durationMs?: number;
    verification?: VerificationResult;  // PRD-Harness-10
    checkpointId?: string;       // 이 메시지 후 체크포인트 생성됨
  };
}

export interface Checkpoint {
  id: string;                    // UUID
  sessionId: string;
  turnNumber: number;            // 이 턴 이후 상태
  label: string;                 // "Before refactor", "After test fix" 등
  createdAt: number;
  messageCount: number;
  tokenCount: number;
  snapshot: SessionSnapshot;     // 전체 상태 스냅샷
}

export interface SessionSnapshot {
  messages: ChatMessage[];       // 체크포인트 시점까지의 메시지
  stickyContext: StickyContext;
  activeMemories: string[];
  activeRules: string[];
  workingDirectory: string;
  openFiles: string[];           // 에디터에서 열린 파일들
}
```

### 2.2 세션 분기 (Fork)

```typescript
export interface SessionFork {
  parentSessionId: string;
  parentTurnNumber: number;      // 분기 기준 턴
  childSessionId: string;
  reason: string;                // 사용자 입력 이유
  createdAt: number;
}
```

---

## 3. Session Manager Implementation

### 3.1 핵심 클래스

```typescript
// src/session/SessionManager.ts
export class SessionManager {
  private sessions = new Map<string, ChatSession>();
  private activeSessionId: string | null = null;
  private readonly maxSessions = 100;
  private readonly maxMessagesPerSession = 500;

  constructor(
    private stateManager: StateManager,      // PRD-Infra-17
    private memoryManager: MemoryManager,    // PRD-Harness-04
    private checkpointManager: CheckpointManager  // PRD-Infra-09
  ) {}

  // 세션 생성
  async createSession(options: CreateSessionOptions = {}): Promise<ChatSession> {
    const session: ChatSession = {
      id: crypto.randomUUID(),
      name: options.name || `Session ${this.sessions.size + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
      archived: false,
      currentTurn: 0,
      maxTurns: options.maxTurns || this.config.maxTurns,
      modelTier: options.modelTier || this.config.defaultTier,
      activeMode: options.mode || 'ask',
      systemPrompt: await this.buildSystemPrompt(),
      activeRules: [],
      activeMemories: [],
      stickyContext: { goals: [], facts: [], artifacts: [], recentFiles: [] },
      messages: [],
      checkpoints: [],
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
      gitBranch: await this.getGitBranch(),
      tags: options.tags || []
    };

    this.sessions.set(session.id, session);
    this.activeSessionId = session.id;
    await this.persist();
    return session;
  }

  // 세션 분기 (Fork)
  async forkSession(parentId: string, turnNumber: number, reason: string): Promise<ChatSession> {
    const parent = this.sessions.get(parentId);
    if (!parent) throw new Error('Parent session not found');
    if (turnNumber > parent.currentTurn) throw new Error('Invalid turn number');

    const child = await this.createSession({
      name: `${parent.name} (fork @ turn ${turnNumber})`,
      modelTier: parent.modelTier,
      mode: parent.activeMode,
      tags: [...parent.tags, 'fork']
    });

    // 부모 메시지 복사 (분기 지점까지)
    child.messages = parent.messages.filter(m => m.turnNumber <= turnNumber);
    child.currentTurn = turnNumber;
    child.stickyContext = { ...parent.stickyContext };
    child.activeMemories = [...parent.activeMemories];
    child.activeRules = [...parent.activeRules];

    // 분기 기록
    const fork: SessionFork = {
      parentSessionId: parentId,
      parentTurnNumber: turnNumber,
      childSessionId: child.id,
      reason,
      createdAt: Date.now()
    };
    await this.saveFork(fork);

    return child;
  }

  // 메시지 추가
  async addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'sessionId'>): Promise<ChatMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const fullMessage: ChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      sessionId,
      turnNumber: message.role === 'user' ? session.currentTurn + 1 : session.currentTurn
    };

    session.messages.push(fullMessage);
    session.updatedAt = Date.now();

    // 턴 카운터 증가 (사용자 메시지일 때)
    if (message.role === 'user') {
      session.currentTurn++;
    }

    // 자동 체크포인트 (중요한 도구 호출 후)
    if (this.shouldAutoCheckpoint(fullMessage)) {
      await this.checkpointManager.createAutoCheckpoint(session);
    }

    // 메시지 수 제한 (오래된 것 압축/삭제)
    if (session.messages.length > this.maxMessagesPerSession) {
      await this.compactOldMessages(session);
    }

    await this.persist();
    return fullMessage;
  }

  // 활성 세션 조회
  getActiveSession(): ChatSession | null {
    return this.activeSessionId ? this.sessions.get(this.activeSessionId) || null : null;
  }

  // 세션 목록 (필터링/정렬)
  getSessions(filter: SessionFilter = {}): ChatSession[] {
    let sessions = Array.from(this.sessions.values());
    
    if (!filter.includeArchived) {
      sessions = sessions.filter(s => !s.archived);
    }
    if (filter.pinnedOnly) {
      sessions = sessions.filter(s => s.pinned);
    }
    if (filter.tags?.length) {
      sessions = sessions.filter(s => filter.tags!.some(t => s.tags.includes(t)));
    }

    // 정렬: 고정 > 최근 업데이트
    return sessions.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }

  // 세션 검색 (PRD-11 연동)
  async searchSessions(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    // 메시지 내용 + 메타데이터 검색
    // 구현은 PRD-11 ChatSearchArtifacts 참조
  }

  // 세션 내보내기
  async exportSession(sessionId: string, format: 'json' | 'markdown' | 'html'): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    switch (format) {
      case 'json':
        return JSON.stringify(session, null, 2);
      case 'markdown':
        return this.exportToMarkdown(session);
      case 'html':
        return this.exportToHtml(session);
    }
  }

  // 세션 가져오기
  async importSession(data: string, format: 'json'): Promise<ChatSession> {
    const session = JSON.parse(data) as ChatSession;
    session.id = crypto.randomUUID();  // 새 ID 부여
    session.name = `${session.name} (imported)`;
    session.createdAt = Date.now();
    session.updatedAt = Date.now();
    
    this.sessions.set(session.id, session);
    await this.persist();
    return session;
  }

  // 영속화
  private async persist(): Promise<void> {
    const sessions = Array.from(this.sessions.values());
    await this.stateManager.saveSessions(sessions);
  }
}
```

---

## 4. Checkpoint Integration (PRD-Infra-09)

```typescript
// src/session/CheckpointManager.ts
export class CheckpointManager {
  constructor(private sessionManager: SessionManager) {}

  async createCheckpoint(sessionId: string, label: string, manual = false): Promise<Checkpoint> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const snapshot: SessionSnapshot = {
      messages: [...session.messages],
      stickyContext: { ...session.stickyContext },
      activeMemories: [...session.activeMemories],
      activeRules: [...session.activeRules],
      workingDirectory: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
      openFiles: vscode.window.visibleTextEditors.map(e => e.document.uri.fsPath)
    };

    const checkpoint: Checkpoint = {
      id: crypto.randomUUID(),
      sessionId,
      turnNumber: session.currentTurn,
      label,
      createdAt: Date.now(),
      messageCount: session.messages.length,
      tokenCount: this.estimateTokens(session.messages),
      snapshot
    };

    session.checkpoints.push(checkpoint);
    
    // 최대 20개 체크포인트 유지 (오래된 것 병합)
    if (session.checkpoints.length > 20) {
      this.consolidateCheckpoints(session);
    }

    await this.sessionManager.persist();
    return checkpoint;
  }

  async rollbackToCheckpoint(sessionId: string, checkpointId: string): Promise<ChatSession> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const checkpoint = session.checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) throw new Error('Checkpoint not found');

    // 현재 상태를 체크포인트로 저장 (롤백 전 백업)
    await this.createCheckpoint(sessionId, `Pre-rollback backup`, true);

    // 복원
    session.messages = [...checkpoint.snapshot.messages];
    session.currentTurn = checkpoint.turnNumber;
    session.stickyContext = checkpoint.snapshot.stickyContext;
    session.activeMemories = checkpoint.snapshot.activeMemories;
    session.activeRules = checkpoint.snapshot.activeRules;
    session.updatedAt = Date.now();

    await this.sessionManager.persist();
    return session;
  }
}
```

---

## 5. Acceptance Criteria

```gherkin
Feature: Session Manager

  Scenario: Create and persist session
    Given extension activates
    When new session created
    Then session has unique ID, timestamp, default settings
    And session saved to globalState
    And survives VS Code restart

  Scenario: Fork session at specific turn
    Given session with 10 turns
    When user forks at turn 5 with reason "try different approach"
    Then new session created with turns 1-5 copied
    And fork relationship recorded
    And both sessions independently modifiable

  Scenario: Auto checkpoint after tool execution
    Given active session
    When assistant executes write_file tool
    Then auto checkpoint created with label "After write_file"
    And checkpoint includes full session snapshot

  Scenario: Rollback to checkpoint
    Given session with 3 checkpoints
    When user rolls back to checkpoint 2
    Then session state restored to checkpoint 2
    And pre-rollback state saved as new checkpoint
    And user can redo/redo from there

  Scenario: Session search across history
    Given 50 sessions over 3 months
    When user searches "authentication bug fix"
    Then matching sessions ranked by relevance
    And preview shows matching message snippets
    And click opens that session at matching turn

  Scenario: Export/Import session
    Given session with 20 turns, checkpoints, memories
    When exported as JSON
    And imported on another machine
    Then session restored with all metadata intact
    And new ID assigned (no conflict)

  Scenario: Memory inheritance on fork
    Given parent session with 3 active memories
    When forked
    Then child session has same 3 memories active
    And modifications to child memories don't affect parent
```

---

## 6. Configuration

```json
{
  "agent-k.session.maxSessions": 100,
  "agent-k.session.maxMessagesPerSession": 500,
  "agent-k.session.autoCheckpointOnTool": ["write_file", "apply_patch", "terminal"],
  "agent-k.session.checkpointRetention": 20,
  "agent-k.session.archiveAfterDays": 30
}
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 7. References

- `PRD-C0_Chat_UI_Streaming.md` — 채팅 UI에서 세션 사용
- `PRD-Infra-17_Extension_Lifecycle_Config.md` — 영속화 백엔드
- `PRD-Infra-09_Checkpoints_Rollback.md` — 체크포인트 상세
- `PRD-16_Chat_Search_Artifacts.md` — 세션 검색
- `PRD-Harness-04_Memories_Minimal.md` — 메모리 상속