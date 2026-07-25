# PRD-C4: 주변 인프라 (Infrastructure - Permissions, Checkpoints, Doom Loop, Compaction, Hooks)

> **Phase**: C4 (C3 멀티턴 루프 안정화 후)  
> **Priority**: 높음 (제품 느낌의 핵심)  
> **관련 PRD**: `PRD-Infra-05_Permission_Autorun.md` ~ `PRD-Infra-13_Error_Recovery.md`, `PRD-Harness-06_A_Tier_Whitelist.md`

---

## 1. Overview

### 목적
루프 바깥 **제품 차이의 본체**를 구축한다. C3까지가 "돌아가는 루프"라면, C4는 "안전하고 쓸만한 제품"으로 만드는 인프라: 승인 게이트, 체크포인트/롤백, 둠 루프 감지, 컨텍스트 컴팩션, 훅 시스템, 에러 복구.

### 비즈니스 가치
- **안전성**: 대량 삭제·무한 루프·스테일 패치 방지
- **지속성**: 긴 세션(50+ 턴)도 컨텍스트 창 오버플로 없이 유지
- **관찰가능성**: 훅으로 사전/사후 검증, 시크릿 스캔, 로깅
- **하네스 완성**: 중급 모델(Flash)이 "잘 도는 것처럼" 보이게 하는 보호장치 완성

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, Agent가 `rm -rf /` 실행하려 하면 승인 창에서 막히고 싶다 |
| US-02 | 팀 리더로, Agent가 20턴째 같은 파일 읽기만 반복하면 "왜 그래?" 물어보게 하고 싶다 |
| US-03 | 개발자로서, 100턴짜리 대형 리팩터링 중에도 컨텍스트 안 잘리고 중요 파일 기억하게 하고 싶다 |
| US-04 | 보안 담당자로, Agent가 실수로 API 키 커밋하려 하면 훅이 막아주길 원한다 |

---

## 2. Functional Requirements

### 2.1 승인/자동실행 게이트 (Permission / Auto-run)
| FR-ID | 레벨 | 쓰기 | 터미널 | 네트워크 | 구현 |
|-------|------|------|--------|----------|------|
| FR-01 | `ask` | 매번 Diff 승인 | 매번 | 매번 | 보수 모드 |
| FR-02 | `accept_edits` | 자동 (delete는 ask) | allowlist만 자동 | ask | **제품 기본값** |
| FR-03 | `auto` | 자동 | allowlist+정책 | 허용 도메인 | 팀 설정 |
| FR-04 | `bypass` | 전부 자동 | 전부 (위험) | 전부 | 개발자만 |

**게이트 로직**:
```typescript
if (tool.readonly) return allow;
if (mode === 'ask' && tool.writes) return deny;
if (path matches denyGlobs) return deny;
if (tool.exec && !allowlist.match(cmd)) return prompt;
if (tool.destructive) return prompt;
return allow per level;
```

### 2.2 체크포인트/롤백 (Checkpoint / Rollback)
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 생성 시점 | 첫 write 전, N파일(기본 5) 이상 변경 전, 사용자 요청 시 |
| FR-02 | 저장 내용 | 변경 파일의 before 스냅샷 (내용 + mtime + hash) |
| FR-03 | UI | 채팅 타임라인에 체크포인트 노드 → [Restore] 버튼 |
| FR-04 | 복원 | 스냅샷 파일만 복구 (untracked 파일 삭제 정책: 보관/삭제 선택) |
| FR-05 | 보관 | 최대 50개, LRU 제거, 세션 간 영속화 (workspaceState) |

### 2.3 Doom Loop 감지
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 감지 조건 | 동일 도구·동일 인자 3회 연속 (C3에서 구현, C4에서 UI/정책 강화) |
| FR-02 | 액션 | 루프 일시정지 → 사용자에게 `ask_question` (계속/가이드/중단) |
| FR-03 | 시각화 | 도구 호출 패널에 🔄 "Loop detected" 배지 + 카운트 |
| FR-04 | 카운터 리셋 | 다른 도구 호출 시 해당 도구 카운터 리셋 |

### 2.4 컨텍스트 컴팩션 (Context Compaction)
| FR-ID | 단계 | 동작 | 비용 |
|-------|------|------|------|
| FR-01 | Truncate | 오래된 tool_result 본문 절단 (32KB 캡) | 무료 |
| FR-02 | Drop | 중복 read/grep 결과 제거 | 무료 |
| FR-03 | Micro-summary | 구간을 짧은 bullet로 치환 (소형 모델/규칙) | 저 |
| FR-04 | Full compact | 대화 요약 1블록 생성 후 히스토리 교체 | 고 (최후) |

**보호 구간**: 시스템, Rules, 최근 6턴, 현재 사용자 목표 문장.  
**트리거**: 토큰 > 90% 예산 시 자동, 또는 수동 명령.

### 2.5 훅 시스템 (Hooks)
| FR-ID | 훅 타입 | 타이밍 | 용도 |
|-------|---------|--------|------|
| FR-01 | `PreToolUse` | 도구 실행 직전 | 차단/수정/로깅/시크릿 스캔 |
| FR-02 | `PostToolUse` | 도구 실행 직후 | 결과 검증/로깅/캐시 무효화 |
| FR-03 | `PreModelCall` | 모델 호출 직전 | 컨텍스트 조립 감시 |
| FR-04 | `PostModelCall` | 모델 응답 후 | 파싱 검증/토큰 카운트 |

**훅 체인**: 순차 실행, 어느 훅이든 `block: true` 반환 시 파이프라인 중단.

### 2.6 에러 복구 강화
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 도구 실패 ≠ 루프 중단 | 실패를 `tool_result`로 반환 → 모델이 재시도 |
| FR-02 | 파싱 실패 복구 | `Spec-01` 파서: 펜스 추출 → 재파싱 → 1회 재시도 |
| FR-03 | 연속 실패 상한 | 동일 도구 3회 실패 → 사용자에게 `ask_question` |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 승인 게이트 지연 | < 50ms (동기 체크) |
| NFR-02 | 체크포인트 생성 | < 500ms (전체 워크스페이스 스냅샷) |
| NFR-03 | 컴팩션 지연 | Full compact < 2s (요약 모델 사용) |
| NFR-04 | 훅 오버헤드 | 훅 체인 통과 < 10ms |

---

## 4. Technical Spec

### 4.1 승인 게이트 (`src/infra/permissionGate.ts`)

```typescript
export type PermissionLevel = 'ask' | 'accept_edits' | 'auto' | 'bypass';

export class PermissionGate {
  constructor(
    private config: PermissionConfig,
    private secretScanner: SecretScanner
  ) {}

  async check(tool: ToolCall, context: ToolContext): Promise<PermissionDecision> {
    // 1. 읽기 전용은 항상 허용
    if (this.registry.isReadOnly(tool.name)) return { allow: true };

    // 2. Ask 모드에서 쓰기 차단
    if (context.mode === 'ask' && this.isWriteTool(tool.name)) {
      return { allow: false, reason: 'Write not allowed in Ask mode' };
    }

    // 3. 금지 글로브
    if (this.matchesDenyGlobs(tool.args.path)) {
      return { allow: false, reason: 'Path matches deny glob' };
    }

    // 3. 파괴적 작업
    if (this.isDestructive(tool.name)) {
      if (this.config.level === 'ask') return this.promptUser(tool);
    }

    // 4. 터미널 명령어 allowlist
    if (tool.name === 'run_terminal_cmd') {
      if (!this.config.allowlist.test(tool.args.cmd)) {
        return this.promptUser(tool);
      }
    }

    // 5. 시크릿 스캔 (PreToolUse 훅에서도 수행)
    if (await this.secretScanner.detect(tool)) {
      return { allow: false, reason: 'Potential secret detected' };
    }

    // 6. 레벨별 허용
    return this.allowByLevel(tool);
  }

  private async promptUser(tool: ToolCall): Promise<PermissionDecision> {
    return new Promise(resolve => {
      vscode.window.showInformationMessage(
        `Allow ${tool.name}?`, { modal: true },
        'Allow Once', 'Allow Session', 'Deny'
      ).then(choice => {
        if (choice === 'Allow Once') resolve({ allow: true, scope: 'once' });
        else if (choice === 'Allow Session') resolve({ allow: true, scope: 'session' });
        else resolve({ allow: false, reason: 'User denied' });
      });
    });
  }
}
```

### 4.2 체크포인트 매니저 (`src/infra/checkpointManager.ts`)

```typescript
export class CheckpointManager {
  private checkpoints: Checkpoint[] = [];
  private readonly maxCheckpoints = 50;

  constructor(private workspaceState: vscode.Memento) {
    this.load();
  }

  async create(label: string): Promise<string> {
    const files = await this.collectTrackedFiles();
    const snapshot: FileSnapshot[] = await Promise.all(
      files.map(async f => ({
        path: f,
        content: await vscode.workspace.fs.readFile(vscode.Uri.file(f)),
        mtime: (await vscode.workspace.fs.stat(vscode.Uri.file(f))).mtime,
        hash: xxhash64(await vscode.workspace.fs.readFile(vscode.Uri.file(f))),
      }))
    );

    const cp: Checkpoint = {
      id: `cp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label,
      timestamp: Date.now(),
      snapshots: snapshot,
    };

    this.checkpoints.unshift(cp);
    if (this.checkpoints.length > this.maxCheckpoints) this.checkpoints.pop();
    this.persist();
    return cp.id;
  }

  async restore(id: string): Promise<void> {
    const cp = this.checkpoints.find(c => c.id === id);
    if (!cp) throw new Error('Checkpoint not found');

    const edit = new vscode.WorkspaceEdit();
    for (const snap of cp.snapshots) {
      const uri = vscode.Uri.file(snap.path);
      if (snap.content) {
        edit.replace(uri, new vscode.Range(0, 0, Infinity, 0), Buffer.from(snap.content).toString('utf8'));
      } else {
        edit.deleteFile(uri);
      }
    }
    await vscode.workspace.applyEdit(edit);
    this.checkpoints = this.checkpoints.filter(c => c.id !== id);
    this.persist();
  }

  private async collectTrackedFiles(): Promise<string[]> {
    // Git 추적 파일 + 언트랙드 중 최근 수정된 것
    const tracked = await vscode.workspace.findFiles('**', '**/.git/**');
    return tracked.map(u => u.fsPath);
  }
}
```

### 4.3 컴팩션 엔진 (`src/infra/compaction.ts`)

```typescript
export class CompactionEngine {
  constructor(
    private llm: LLMProvider,
    private tokenizer: Tokenizer
  ) {}

  async compact(messages: ChatMessage[], budget: TokenBudget): Promise<ChatMessage[]> {
    let tokens = this.countTokens(messages);
    if (tokens <= budget.target) return messages;

    // 1. Truncate: 오래된 tool_result 본문 절단
    messages = this.truncateToolResults(messages, 32 * 1024); // 32KB
    tokens = this.countTokens(messages);
    if (tokens <= budget.target) return messages;

    // 2. Drop: 중복 read/grep 결과 제거
    messages = this.dropDuplicateResults(messages);
    tokens = this.countTokens(messages);
    if (tokens <= budget.target) return messages;

    // 3. Micro-summary: 오래된 구간을 bullet로 치환
    messages = await this.microSummarize(messages, budget);
    tokens = this.countTokens(messages);
    if (tokens <= budget.target) return messages;

    // 4. Full compact: 대화 요약 1블록 생성
    return await this.fullCompact(messages, budget);
  }

  private async fullCompact(messages: ChatMessage[], budget: TokenBudget): Promise<ChatMessage[]> {
    // 보호 구간 추출
    const protected = messages.filter(m => 
      m.role === 'system' || 
      m.content.includes('## Active Memories') ||
      m.timestamp > Date.now() - 6 * 3600 * 1000 // 최근 6시간
    );
    
    const toSummarize = messages.filter(m => !protected.includes(m));
    const summary = await this.llm.summarize(toSummarize.map(m => m.content).join('\n'), 500);
    
    return [
      ...protected,
      { role: 'system', content: `## Conversation Summary (auto-compacted)\n${summary}` },
    ];
  }
}
```

### 4.4 훅 레지스트리 (`src/infra/hooks.ts`)

```typescript
export type HookType = 'PreToolUse' | 'PostToolUse' | 'PreModelCall' | 'PostModelCall';

export interface Hook {
  id: string;
  type: HookType;
  priority: number;        // 낮을수록 먼저 실행
  condition?: (ctx: HookContext) => boolean;
  execute: (ctx: HookContext) => Promise<HookResult>;
}

export interface HookResult {
  allow: boolean;          // false면 파이프라인 중단
  modifiedArgs?: unknown;  // 인자 수정
  modifiedResult?: unknown; // 결과 수정
  metadata?: Record<string, unknown>;
}

export class HookRegistry {
  private hooks: Hook[] = [];

  register(hook: Hook) {
    this.hooks.push(hook);
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  async run(type: HookType, ctx: HookContext): Promise<HookResult> {
    const relevant = this.hooks.filter(h => h.type === type && (!h.condition || h.condition(ctx)));
    
    let result: HookResult = { allow: true };
    for (const hook of relevant) {
      const ctxCopy = { ...ctx, metadata: { ...ctx.metadata } };
      const r = await hook.execute(ctxCopy);
      if (!r.allow) return r; // 중단
      if (r.modifiedArgs) ctx.args = r.modifiedArgs;
      if (r.modifiedResult) ctx.result = r.modifiedResult;
      result = r;
    }
    return result;
  }
}

// 내장 훅 예시: 시크릿 스캔
export const secretScanHook: Hook = {
  id: 'secret-scan',
  type: 'PreToolUse',
  priority: 10,
  condition: ctx => ctx.tool.name === 'edit_file' || ctx.tool.name === 'write_file',
  async execute(ctx) {
    const content = ctx.args.content || ctx.args.search || '';
    if (SECRET_PATTERNS.some(p => p.test(content))) {
      return { allow: false, reason: 'Potential secret detected in content' };
    }
    return { allow: true };
  },
};
```

---

## 5. UI/UX Specification

### 5.1 승인 모달 (통합)
```
┌─ Allow tool execution? ──────────────────────────────────────────────┐
│  Tool: edit_file  │  File: src/auth.ts                               │
│  ──────────────────────────────────────────────────────────────────  │
│  ➖  const token = getToken();                                        │
│  ➕  const token = getToken() ?? '';                                 │
│  ──────────────────────────────────────────────────────────────────  │
│  Level: Ask (default)  │  [Allow Once]  [Allow Session]  [Deny]     │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 체크포인트 타임라인
```
┌─ Chat Timeline ──────────────────────────────────────────────────────┤
│  👤 User: "Refactor auth"                                            │
│  🤖 Agent: exploring...                                              │
│  📍 Checkpoint: "Before refactor"  [Restore]  2 min ago             │
│  🤖 Agent: editing 3 files...                                        │
│  📍 Checkpoint: "After edits"  [Restore]  30 sec ago                │
│  👤 User: "Undo"  →  Restored "Before refactor"                     │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.3 컴팩션 알림
```
🔔 Context compacted (95% → 65%)
   - Truncated 12 tool results
   - Dropped 8 duplicate reads
   - Summarized 15 older turns into 1 block
   [View Details]  [Disable Auto-compact]
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Infrastructure (Permissions, Checkpoints, Doom Loop, Compaction)

  Scenario: Permission gate blocks dangerous command
    Given user in Agent mode with level=ask
    When model calls run_terminal_cmd("rm -rf /")
    Then permission gate shows modal with full command preview
    And user must click "Allow Once" to proceed

  Scenario: Checkpoint auto-creates before first write
    Given agent starts editing files
    When first edit_file called
    Then checkpoint "Before edits" created silently
    And appears in timeline with [Restore] button

  Scenario: Restore checkpoint reverts all changes
    Given checkpoint exists with 5 file snapshots
    When user clicks [Restore]
    Then all 5 files revert to snapshot content
    And untracked files handled per policy

  Scenario: Doom loop detected at 3rd repeat
    Given model calls read_file("config.json") 3 times same args
    Then loop pauses with "Doom loop detected" modal
    And user can click "Guide model" to provide hint

  Scenario: Auto-compaction at 90% budget
    Given session at 90% token budget
    When compaction triggers
    Then token count drops to < 70%
    And recent 6 turns preserved
    And summary block inserted

  Scenario: Hook blocks secret in edit
    Given model tries to write API key in code
    When PreToolUse hook runs
    Then secret scanner detects pattern
    And tool execution blocked with "Potential secret detected"
```

---

## 6. Implementation Checklist

| 단계 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | `PermissionGate` + 레벨별 정책 + UI 모달 | 모든 레벨 동작, denyGlobs 작동 |
| 2 | `CheckpointManager` + 자동 생성(첫 쓰기/N파일) + 타임라인 UI | 복원 검증, 50개 LRU |
| 3 | Doom Loop UI + ask_question 연동 | 3회 반복 → 모달 → 가이드 가능 |
| 4 | Compaction Engine (4단계) + 트리거(90%) | 토큰 90%→65%, 보호구간 보존 |
| 4 | Hook Registry + 내장 훅 4종 | 우선순위 순서, 중단/수정 동작 |
| 5 | 내장 훅: 시크릿 스캔, 스테일니스, 린트 검증 | 훅 체인 통과 < 10ms |
| 6 | 통합 E2E: 50턴 세션에서 모든 인프라 동작 | 메모리/토큰 안정, 복원/롤백 검증 |

---


## Out of Scope

- 해당 Phase 밖 기능을 완료로 간주하지 말 것 (특히 Browser=C7)
- 상세: `00_Master_Context.md` Non-Goals

## 7. References

- `PRD-Infra-05_Permission_Autorun.md` ~ `PRD-Infra-13_Error_Recovery.md` — 각 인프라 상세
- `PRD-Harness-06_A_Tier_Whitelist.md` — 중급 모델용 승인/제한 정책
- `PRD-Harness-10_Verification_MicroLoop.md` — 자동 검증 루프와 훅 연동