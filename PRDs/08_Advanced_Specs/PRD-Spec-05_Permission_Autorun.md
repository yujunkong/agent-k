# PRD-Spec-05: Permission / Auto-run (권한/자동실행)

> **Category**: Advanced Specs  
> **Priority**: ⑤ (Provider/JSON → Patch → Context → Terminal → Permission)  
> **Phase**: C4 (C2에 최소 Diff 승인부터, C4에서 완성)  
> **관련 PRD**: `PRD-C2_Agent_SingleTurn.md`, `PRD-C4_Infrastructure.md`, `PRD-Infra-05_Permission_Autorun.md`

---

## 1. Overview

### 목적
모델이 **쓰기/터미널/네트워크 도구**를 호출할 때 **사용자 승인 없이 실행되지 않게** 하는 **게이트**를 구현한다. Cursor와 동일한 4단계 레벨(`ask`, `accept_edits`, `auto`, `bypass`)로 점진적 자동화 지원.

### 비즈니스 가치
- **안전성**: 로컬 모델(Flash)의 오작동으로 파일 삭제/시스템 명령 방지
- **생산성**: 신뢰도 높은 작업은 자동 승인(`accept_edits`/`auto`)으로 흐름 유지
- **감사**: 모든 승인/거부 이력 로깅, 사후 분석 가능

---

## 2. Permission Levels (Cursor 4단계)

| 레벨 | 쓰기 (`edit`/`write`/`delete`) | 터미널 (`run_terminal_cmd`) | 네트워크 (`web_*`/`browser_*`) | 용도 |
|------|-------------------------------|-----------------------------|-------------------------------|------|
| **`ask`** | 매번 Diff 승인 | 매번 승인 | 매번 승인 | 최대 안전 (보수) |
| **`accept_edits`** | 자동 (단, `delete`는 `ask`) | Allowlist만 자동 | `ask` | **제품 기본값** (원본 Settings Hub) |
| **`auto`** | 자동 | Allowlist + 정책 자동 | 허용 도메인 자동 | 숙련 사용자 |
| **`bypass`** | 전부 자동 | 전부 자동 (위험) | 전부 자동 | 테스트/자동화만 |

---

## 2. Gate Logic (게이트 의사코드)

```typescript
function checkPermission(tool: ToolCall, context: PermissionContext): PermissionDecision {
  // 1. 읽기 전용 → 즉시 허용
  if (toolRegistry.isReadOnly(tool.name)) return { allow: true };

  // 2. Ask 모드에서 쓰기 차단
  if (context.mode === 'ask' && toolRegistry.isWriteTool(tool.name)) {
    return { allow: false, reason: 'Write not allowed in Ask mode' };
  }

  // 3. 경로별 deny globs
  if (tool.args.path && matchesDenyGlobs(tool.args.path, config.denyGlobs)) {
    return { allow: false, reason: 'Path matches deny glob' };
  }

  // 3. 파괴적 작업
  if (toolRegistry.isDestructive(tool.name)) {
    if (context.level === 'bypass') return { allow: true };
    return { allow: false, reason: 'Destructive operation', prompt: true };
  }

  // 4. 터미널 명령어 allowlist
  if (tool.name === 'run_terminal_cmd') {
    const allowed = config.terminal.allowlist.some(r => r.test(tool.args.cmd));
    if (!allowed) {
      if (context.level === 'ask' || context.level === 'accept_edits') {
        return { allow: false, reason: 'Command not in allowlist', prompt: true };
      }
      // auto: 정책별 판단, bypass: 허용
    }
    // auto/bypass에서 추가 정책 체크
    if (context.level === 'auto' && !config.autoApproveTerminal) {
      return { allow: false, reason: 'Terminal not auto-approved in auto mode', prompt: true };
    }
  }

  // 6. 레벨별 허용
  return decideByLevel(tool, context.level);
}

function decideByLevel(tool: ToolCall, level: PermissionLevel): PermissionDecision {
  const isWrite = toolRegistry.isWriteTool(tool.name);
  const isDestructive = toolRegistry.isDestructive(tool.name);
  const isTerminal = tool.name === 'run_terminal_cmd';
  const isNetwork = tool.name.startsWith('web_') || tool.name.startsWith('browser_');

  switch (level) {
    case 'ask':
      return { allow: false, reason: 'Ask mode requires approval', prompt: true };
    case 'accept_edits':
      if (isWrite && !isDestructive) return { allow: true }; // edit/write 자동
      if (isDestructive) return { allow: false, prompt: true }; // delete는 ask
      if (isTerminal) return config.terminal.allowlistAuto ? { allow: true } : { prompt: true };
      return { allow: false, prompt: true };
    case 'auto':
      if (isWrite || isTerminal) return { allow: true }; // 정책 통과 시
      if (isNetwork) return config.network.allowedDomains ? { allow: true } : { prompt: true };
      return { allow: true };
    case 'bypass':
      return { allow: true };
  }
}
```

---

## 3. UX: 승인 모달 (Diff Preview 포함)

```html
<!-- 승인 모달 -->
<div class="permission-modal">
  <header>
    <span class="tool-icon">🔧</span>
    <strong>Allow tool execution?</strong>
    <span class="level-badge">Level: Ask</span>
  </header>
  
  <div class="tool-detail">
    <code>edit_file</code> → <code>src/auth/login.ts</code>
  </div>
  
  <div class="diff-preview side-by-side">
    <div class="pane original">
      <span class="line removed">-  const user = await getUser(id);</span>
      <span class="line context">  if (!user) throw new Error('Not found');</span>
    </div>
    <div class="pane modified">
      <span class="line added">+  const user = await getUser(id);</span>
      <span class="line added">+  if (!user) throw new AuthError('User not found');</span>
      <span class="line context">  if (!user) throw new Error('Not found');</span>
    </div>
  </div>
  
  <div class="reason">Reason: Write not allowed in Ask mode</div>
  
  <div class="actions">
    <button class="danger" data-action="deny">Deny</button>
    <button class="secondary" data-action="allow-once">Allow Once</button>
    <button class="secondary" data-action="allow-session">Allow Session</button>
    <button class="primary" data-action="allow-always" title="Persist to settings">
      <input type="checkbox" id="always-allow"> Always Allow
    </button>
  </div>
</div>
```

### 액션별 동작
| 액션 | 동작 | 저장 범위 |
|------|------|-----------|
| **Deny** | `tool_result: {error: "permission denied"}` → 모델 재시도 | 메모리만 |
| **Allow Once** | 이번 호출만 허용 | 메모리만 |
| **Allow Session** | 동일 도구+동일 인자 패턴 세션 동안 허용 | 메모리 (`sessionApprovals` Map) |
| **Always Allow** | 영구 허용 | `workspaceState['agentK.approvals.always']` 영구 저장 |

---

## 3. 세션/영구 승인 저장

```typescript
interface ApprovalCache {
  session: Map<string, 'once' | 'session'>;  // key: "toolName:argsHash"
  always: Set<string>;                        // "toolName:argsHash" 영구
}

// 승인 체크
function checkCachedApproval(tool: ToolCall): 'allow' | 'deny' | 'prompt' {
  const key = `${tool.name}:${hashArgs(tool.args)}`;
  if (this.always.has(key)) return 'allow';
  if (this.session.get(key) === 'session') return 'allow';
  return 'prompt';
}
```

---

## 4. Allowlist / Deny Globs 설정

```json
{
  "agentK.permissions": {
    "level": "accept_edits",
    "denyGlobs": ["**/.env*", "**/secrets/**", "**/id_rsa*", "**/*.pem"],
    "terminal": {
      "allowlist": [
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
        "^kubectl (get|logs|describe|apply)"
      ],
      "blocked": ["rm -rf /", "curl.*\\|.*sh", "chmod 777", "dd if=", "mkfs", "fdisk"]
    },
    "network": {
      "allowedDomains": ["api.github.com", "registry.npmjs.org", "raw.githubusercontent.com"]
    },
    "autoApproveEdits": true,
    "autoApproveTerminal": false
  }
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Permission / Auto-run

  Scenario: Ask mode blocks write tools
    Given permission level = "ask"
    When model calls edit_file
    Then gate returns { allow: false, reason: "Write not allowed in Ask mode" }
    And model receives tool_result with error

  Scenario: accept_edits auto-approves edit_file
    Given level = "accept_edits"
    And autoApproveEdits = true
    When model calls edit_file (non-destructive)
    Then gate returns { allow: true } immediately
    And no modal shown

  Scenario: delete_file always prompts in accept_edits
    Given level = "accept_edits"
    When model calls delete_file
    Then gate returns { allow: false, prompt: true }
    And user must click "Allow Once"

  Scenario: Terminal allowlist enforcement
    Given level = "accept_edits"
    When model runs "npm test"
    Then auto-approved (in allowlist)
    When model runs "custom-script.sh"
    Then prompts for approval

  Scenario: Session approval persists
    Given user clicks "Allow Session" for edit_file on src/auth.ts
    When same edit_file called again with same file
    Then auto-approved without modal
    And after VS Code restart, prompt reappears

  Scenario: Always Allow persists across restarts
    Given user checks "Always Allow" for "npm test"
    And restarts VS Code
    When model runs "npm test"
    Then auto-approved (workspaceState에서 로드)

  Scenario: Deny globs block sensitive paths
    Given denyGlobs = ["**/.env*", "**/secrets/**"]
    When model tries edit_file on ".env.production"
    Then gate rejects with "Path matches deny glob"
    And no modal (hard block)
```

---


## Out of Scope

- Spec 범위를 넘는 제품 기능 (Feature PRD로 위임)
- 상세: Canonical Owner Matrix

## 5. References

- `PRD-C2_Agent_SingleTurn.md` — 첫 쓰기 도구 승인 플로우
- `PRD-C4_Infrastructure.md` — 인프라 통합 (체크포인트, 훅, 컴팩션과 연계)
- `PRD-Infra-04_Tool_Registry.md` — 도구 분류(읽기/쓰기/파괴적/실행)
- `PRD-Infra-06_Hooks.md` — PreToolUse 훅에서 시크릿 스캔 등 추가 검증
- `PRD-Harness-06_A_Tier_Whitelist.md` — A티어 도구 제한과 연계