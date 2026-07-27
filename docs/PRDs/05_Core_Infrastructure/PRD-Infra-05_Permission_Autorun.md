# PRD-Infra-05: Permission / Auto-run (권한 게이트 & 자동 실행)

> **Category**: Core Infrastructure  
> **Phase**: C2 (첫 쓰기 도구부터) ~ C4 (완성)  
> **관련 PRD**: `PRD-C2_Agent_SingleTurn.md`, `PRD-Infra-04_Tool_Registry.md`, `PRD-C4_Infrastructure.md`

---

## 1. Overview

### 목적
모델이 **쓰기/터미널/네트워크 도구**를 호출할 때, **사용자 승인 없이 실행되지 않게** 하는 게이트를 구현한다. Cursor와 동일한 4단계 레벨(`ask`, `accept_edits`, `auto`, `bypass`)로 점진적 자동화 지원.

### 비즈니스 가치
- **안전성**: 로컬 모델(Flash)의 오작동으로 파일 삭제/시스템 명령 방지
- **생산성**: 신뢰도 높은 작업은 자동 승인으로 흐름 유지
- **감사**: 모든 승인/거부 이력 로깅으로 사후 분석 가능

---

## 2. Functional Requirements

### 2.1 권한 레벨 (Cursor 4단계)
| 레벨 | 쓰기 도구 | 터미널 | 네트워크 | 설명 |
|------|-----------|--------|----------|------|
| `ask` | 매번 Diff 승인 | 매번 승인 | 매번 승인 | 최대 안전 (보수) |
| `accept_edits` | 자동 (단, delete는 ask) | Allowlist만 자동 | Ask | **제품 기본값** (원본 Settings Hub) |
| `auto` | 자동 | Allowlist + 정책 자동 | 허용 도메인 자동 | 숙련 사용자 |
| `bypass` | 전부 자동 | 전부 자동 (위험) | 전부 자동 | 테스트/자동화만 |

### 2.2 도구 분류별 기본 정책
| 분류 | 도구 예시 | `ask` | `accept_edits` | `auto` | `bypass` |
|------|-----------|-------|----------------|--------|----------|
| **readonly** | grep, read_file, lsp_* | ✅ 허용 | ✅ 허용 | ✅ 허용 | ✅ 허용 |
| **write** | edit_file, write_file | ❌ 승인 | ✅ 자동 (delete 제외) | ✅ 자동 | ✅ 자동 |
| **destructive** | delete_file, chmod | ❌ 승인 | ❌ 승인 | ❌ 승인 | ✅ 자동 |
| **exec** | run_terminal_cmd | ❌ 승인 | Allowlist만 ✅ | Allowlist+정책 ✅ | ✅ 자동 |
| **network** | web_search, web_fetch, browser_* | ❌ 승인 | ❌ 승인 | 허용 도메인 ✅ | ✅ 자동 |
| **orchestrate** | task, subagent, ask_user | ❌ 승인 | 정책별 | 정책별 | ✅ 자동 |

### 2.3 승인 게이트 의사코드
```typescript
function checkPermission(tool: ToolCall, context: PermissionContext): PermissionDecision {
  // 1. 읽기 전용 → 즉시 허용
  if (toolRegistry.isReadOnly(tool.name)) return { allow: true };

  // 2. Ask 모드에서 쓰기 → 무조건 거부
  if (context.mode === 'ask' && toolRegistry.isWriteTool(tool.name)) {
    return { allow: false, reason: 'Write not allowed in Ask mode' };
  }

  // 3. 경로별 deny globs
  if (tool.args.path && matchesDenyGlobs(tool.args.path, config.denyGlobs)) {
    return { allow: false, reason: 'Path matches deny glob' };
  }

  // 4. 파괴적 도구
  if (toolRegistry.isDestructive(tool.name)) {
    if (context.level === 'bypass') return { allow: true };
    return { allow: false, reason: 'Destructive operation requires explicit approval', prompt: true };
  }

  // 5. 터미널 명령어 allowlist
  if (tool.name === 'run_terminal_cmd') {
    if (!config.allowlist.test(tool.args.cmd)) {
      if (context.level === 'ask' || context.level === 'accept_edits') {
        return { allow: false, reason: 'Command not in allowlist', prompt: true };
      }
      // auto: 정책별 판단, bypass: 허용
    }
  }

  // 6. 레벨별 허용
  switch (context.level) {
    case 'ask':
      return { allow: false, reason: 'Ask mode requires approval', prompt: true };
    case 'accept_edits':
      return toolRegistry.isWriteTool(tool.name) && !toolRegistry.isDestructive(tool.name) 
        ? { allow: true } : { allow: false, prompt: true };
    case 'auto':
      return { allow: true };  // 정책(allowlist 등) 통과 시
    case 'bypass':
      return { allow: true };
  }
}
```

### 2.4 승인 UX
| 액션 | UI | 저장 범위 |
|------|-----|-----------|
| `Allow Once` | 모달 버튼 | 세션 메모리만 |
| `Allow Session` | 모달 버튼 | 세션 메모리 (같은 도구+동일 인자 패턴) |
| `Always Allow` | 모달 체크박스 + 버튼 | 영구 설정 (`workspaceState`) |
| `Deny` | 모달 버튼 | `tool_result: { error: "permission denied" }`로 모델 반환 |

---

## 3. Technical Spec

### 3.1 Permission Gate (`src/infra/permissionGate.ts`)

```typescript
export type PermissionLevel = 'ask' | 'accept_edits' | 'auto' | 'bypass';

export interface PermissionConfig {
  level: PermissionLevel;
  allowlist: RegExp[];           // 터미널 허용 명령어
  denyGlobs: string[];           // 금지 경로
  autoApproveEdits: boolean;     // accept_edits에서 edit_file 자동 승인
  autoApproveTerminal: boolean;  // auto에서 터미널 자동 승인
  sessionApprovals: Map<string, ApprovalScope>;  // 키: "toolName:argsHash"
}

export interface PermissionDecision {
  allow: boolean;
  reason?: string;
  prompt?: boolean;              // true면 모달 띄움
  scope?: 'once' | 'session' | 'always';
}

export class PermissionGate {
  constructor(
    private config: PermissionConfig,
    private toolRegistry: ToolRegistry,
    private workspaceState: vscode.Memento
  ) {}

  async check(tool: ToolCall, context: ToolContext): Promise<PermissionDecision> {
    // 1. 읽기 전용 즉시 허용
    if (this.toolRegistry.isReadOnly(tool.name)) {
      return { allow: true };
    }

    // 2. Ask 모드 쓰기 차단
    if (context.mode === 'ask' && this.toolRegistry.isWriteTool(tool.name)) {
      return { allow: false, reason: 'Write not allowed in Ask mode' };
    }

    // 3. Deny globs
    if (tool.args.path && this.matchesDenyGlobs(tool.args.path)) {
      return { allow: false, reason: 'Path matches deny glob' };
    }

    // 4. 파괴적 도구
    if (this.toolRegistry.isDestructive(tool.name)) {
      if (this.config.level === 'bypass') return { allow: true };
      return { allow: false, reason: 'Destructive operation', prompt: true };
    }

    // 5. 터미널 명령어 allowlist
    if (tool.name === 'run_terminal_cmd') {
      const allowed = this.config.allowlist.some(r => r.test(tool.args.cmd));
      if (!allowed) {
        if (this.config.level === 'ask' || this.config.level === 'accept_edits') {
          return { allow: false, reason: 'Command not in allowlist', prompt: true };
        }
        // auto: 추가 정책 확인
        if (this.config.level === 'auto' && !this.config.autoApproveTerminal) {
          return { allow: false, reason: 'Terminal not auto-approved in auto mode', prompt: true };
        }
      }
    }

    // 6. 세션/영구 승인 확인
    const cacheKey = this.getCacheKey(tool);
    const cached = this.config.sessionApprovals.get(cacheKey);
    if (cached === 'always') return { allow: true };
    if (cached === 'session') return { allow: true };

    // 7. 레벨별 기본 정책
    return this.decideByLevel(tool);
  }

  private decideByLevel(tool: ToolCall): PermissionDecision {
    const level = this.config.level;
    const isWrite = this.toolRegistry.isWriteTool(tool.name);

    switch (level) {
      case 'ask':
        return { allow: false, reason: 'Ask mode requires approval', prompt: true };
      case 'accept_edits':
        return isWrite && !this.toolRegistry.isDestructive(tool.name) && this.config.autoApproveEdits
          ? { allow: true }
          : { allow: false, prompt: true };
      case 'auto':
        return { allow: true };  // 위 게이트에서 이미 필터링됨
      case 'bypass':
        return { allow: true };
    }
  }

  async promptUser(tool: ToolCall, reason: string): Promise<PermissionDecision> {
    const diff = tool.name === 'edit_file' ? await this.generateDiffPreview(tool) : null;
    
    return new Promise(resolve => {
      vscode.window.showInformationMessage(
        `Allow ${tool.name}? ${reason}`,
        { modal: true, detail: diff },
        'Allow Once', 'Allow Session', 'Always Allow', 'Deny'
      ).then(choice => {
        switch (choice) {
          case 'Allow Once': resolve({ allow: true, scope: 'once' }); break;
          case 'Allow Session': 
            this.config.sessionApprovals.set(this.getCacheKey(tool), 'session');
            resolve({ allow: true, scope: 'session' }); break;
          case 'Always Allow':
            this.config.sessionApprovals.set(this.getCacheKey(tool), 'always');
            this.persistApproval(tool);  // workspaceState에 저장
            resolve({ allow: true, scope: 'always' }); break;
          default:
            resolve({ allow: false, reason: 'User denied' });
        }
      });
    });
  }
}
```

### 3.2 Allowlist 설정 (`.agentk/allowlist.json`)

```json
{
  "terminal": {
    "patterns": [
      "^git ",
      "^npm (test|run|install|ci)",
      "^pnpm (test|run|install)",
      "^yarn (test|run|install)",
      "^pytest",
      "^jest",
      "^go test",
      "^cargo test",
      "^make",
      "^docker compose",
      "^kubectl (get|logs|describe|apply)",
      "^npm run lint",
      "^npm run typecheck"
    ],
    "blocked": [
      "rm -rf /",
      "curl.*\\|.*sh",
      "wget.*\\|.*sh",
      "chmod 777",
      "dd if=",
      "mkfs",
      "fdisk"
    ]
  },
  "network": {
    "allowedDomains": ["api.github.com", "registry.npmjs.org", "raw.githubusercontent.com"],
    "blockedDomains": ["*.onion", "localhost:22", "169.254.169.254"]
  }
}
```

---

## 4. UI/UX Specification

### 4.1 승인 모달
```
┌─ Allow tool execution? ────────────────────────────────────────────────┐
│  Tool: edit_file                                                        │
│  File: src/auth/login.ts                                                │
│  ─────────────────────────────────────────────────────────────────────  │
│  ➖  const user = await getUser();                                      │
│  ➕  const user = await getUser() ?? { role: 'guest' };                │
│  ─────────────────────────────────────────────────────────────────────  │
│  ⚠️ Reason: Write not allowed in Ask mode (or destructive operation)   │
│                                                                         │
│  [Deny]  [Allow Once]  [Allow Session]  [☑ Always Allow]  [Allow]     │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 상태바 표시
```
$(shield) Agent K  [Accept Edits]  Level: accept_edits  |  Session: 3 approvals  [⚙]
```

---

## 5. Acceptance Criteria

```gherkin
Feature: Permission Gate

  Scenario: Ask mode blocks write tool
    Given permission level = "ask"
    When model calls edit_file
    Then gate returns { allow: false, reason: "Write not allowed in Ask mode" }
    And model receives tool_result with error

  Scenario: accept_edits auto-approves edit_file
    Given permission level = "accept_edits"
    And autoApproveEdits = true
    When model calls edit_file (non-destructive)
    Then gate returns { allow: true } immediately
    And no modal shown

  Scenario: delete_file always prompts
    Given permission level = "auto"
    When model calls delete_file
    Then gate returns { allow: false, prompt: true }
    And user must click "Allow Once" or "Allow Session"

  Scenario: Terminal allowlist enforcement
    Given level = "accept_edits"
    And allowlist includes "^npm test$"
    When model calls run_terminal_cmd("npm test")
    Then auto-approved
    When model calls run_terminal_cmd("npm run build")
    Then prompts for approval

  Scenario: Session approval persistence
    Given user clicks "Allow Session" for edit_file on src/auth.ts
    When same tool+file called again in same session
    Then auto-approved without modal

  Scenario: Always Allow persists across sessions
    Given user clicks "Always Allow" for npm test
    And restarts VS Code
    When npm test called
    Then auto-approved (workspaceState에서 로드)

  Scenario: Deny glob blocks sensitive paths
    Given denyGlobs = ["**/.env*", "**/secrets/**"]
    When model calls edit_file on .env.production
    Then gate returns { allow: false, reason: "Path matches deny glob" }
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 6. References

- `PRD-C2_Agent_SingleTurn.md` — 첫 쓰기 도구 승인 플로우
- `PRD-Infra-04_Tool_Registry.md` — 도구 분류(읽기/쓰기/파괴적) 연동
- `PRD-Infra-06_Hooks.md` — PreToolUse 훅에서 시크릿 스캔 등 추가 검증
- Cursor Permission Levels: https://cursor.sh/docs/permissions