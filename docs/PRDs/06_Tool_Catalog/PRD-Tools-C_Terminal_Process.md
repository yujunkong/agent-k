# PRD-Tools-C: Terminal · Process (터미널 · 프로세스)

> **Category**: Tool Catalog — C. Terminal · Process  
> **Phase**: C2~C3 (MVP allowlist shell) → C4+ (bg/monitor/kill · permission 강화)  
> **Related PRDs**:  
> - `../04_Implementation_Phases/PRD-C2_Agent_SingleTurn.md`  
> - `../04_Implementation_Phases/PRD-C3_Agent_MultiTurn.md`  
> - `../05_Core_Infrastructure/PRD-Infra-05_Permission_Autorun.md`  
> - `../07_Medium_Model_Harness/PRD-Harness-06_A_Tier_Whitelist.md`  
> - `../07_Medium_Model_Harness/PRD-Harness-10_Verification_MicroLoop.md`  
> - `../08_Advanced_Specs/PRD-Spec-04_Terminal_Execution.md`  
> **Out of Scope**: 파일 CRUD를 셸로 대체(A/B 전용 도구 사용), Browser(D), 도메인 시리얼 모니터(`PRD-27`)

---

## 1. Overview

`Extension_high_impact.md` **C. 터미널 · 프로세스**와 동일.

| 도구 | 역할 |
|------|------|
| `run_terminal_cmd` | 셸 실행 (**primary 이름**) |
| `run_background` | 백그라운드 잡 |
| `await_terminal` / `Monitor` | 출력·이벤트 대기 |
| `kill_process` | 잡 중단 |

**CRITICAL FIX**: Tier A(Flash)는 **allowlist에 한해** `run_terminal_cmd`를 사용할 수 있다. “Tier A = 터미널 전면 금지”는 **틀린 정책**이다.

---

## 2. Tool Definitions

### 2.1 `run_terminal_cmd` (primary)

```typescript
// 의도: git/npm test/pytest 등. 파일 CRUD·임의 파괴 명령은 deny. 출력 truncate.
{
  name: "run_terminal_cmd",
  description: "Run a shell command in the workspace. Prefer dedicated file tools for CRUD.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string" },
      cwd: { type: "string", description: "Working directory (default: workspace root)" },
      timeout_ms: { type: "integer", default: 120000, maximum: 600000 },
      env: { type: "object", additionalProperties: { type: "string" } },
      required_permissions: {
        type: "array",
        items: { type: "string", enum: ["network", "git_write", "all"] },
        description: "Escalation hints for permission UI"
      }
    },
    required: ["command"],
    additionalProperties: false
  }
}
```

**응답**: `{ exit_code, stdout, stderr, duration_ms, truncated }` — stdout 기본 캡(예: 1MB / 마지막 N줄).

**Tier A allowlist 예** (설정으로 확장 가능):

```json
{
  "allowPatterns": [
    "^git (status|diff|log|show|branch)\\b",
    "^npm (test|run (test|lint|typecheck))",
    "^pnpm (test|lint|typecheck)",
    "^pytest\\b",
    "^cargo (test|check)\\b",
    "^go (test|vet)\\b",
    "^tsc --noEmit",
    "^eslint\\b"
  ],
  "denyPatterns": [
    "rm -rf", "sudo", "npm publish", "docker push",
    "git push.*--force", "mkfs", ":(){:|:&};:"
  ]
}
```

Allowlist 밖 → Tier A **거절**. Tier B는 Permission UI / autorun 정책.

---

### 2.2 `run_background`

```typescript
{
  name: "run_background",
  description: "Start a long-running command in background; returns process/session id.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string" },
      cwd: { type: "string" },
      label: { type: "string", description: "Human-readable job name" }
    },
    required: ["command"],
    additionalProperties: false
  }
}
```

---

### 2.3 `await_terminal` / `Monitor`

```typescript
// 의도: 서버 기동·테스트 완료 대기. Claude Code Monitor에 대응
{
  name: "await_terminal", // alias: Monitor
  description: "Wait for background job output matching a pattern or for exit.",
  parameters: {
    type: "object",
    properties: {
      session_id: { type: "string" },
      pattern: { type: "string", description: "Regex on stdout/stderr" },
      timeout_ms: { type: "integer", default: 30000 },
      debounce_ms: { type: "integer", default: 5000 }
    },
    required: ["session_id"],
    additionalProperties: false
  }
}
```

---

### 2.4 `kill_process`

```typescript
{
  name: "kill_process",
  description: "Stop a background job / shell session started by the agent.",
  parameters: {
    type: "object",
    properties: {
      session_id: { type: "string" },
      signal: { type: "string", enum: ["SIGTERM", "SIGKILL"], default: "SIGTERM" }
    },
    required: ["session_id"],
    additionalProperties: false
  }
}
```

Stop 버튼(UI)과 동일 파이프라인 공유.

---

## 3. Tier Availability Matrix

| 도구 | Tier A (Flash) | Tier B (Pro) |
|------|----------------|--------------|
| `run_terminal_cmd` | ✅ **allowlist ONLY** | ✅ (permission policy) |
| `run_background` | 🔒 | ✅ |
| `await_terminal` / `Monitor` | 🔒 | ✅ |
| `kill_process` | 🔒 (UI Stop은 사용자) | ✅ |

**Tier A LOCKED**: arbitrary shell, Browser, image gen, bulk MCP, `delete_file`, multi-subagent.

---

## 4. Mode Whitelist Notes

| Mode | Terminal |
|------|----------|
| **Ask** | ❌ (읽기만 — 셸로도 쓰기/부작용 가능하므로 기본 차단) |
| **Agent** | ✅ 정책대로 |
| **Plan** | ❌ (또는 읽기 전용 명령만 — 기본 차단 권장) |
| **Debug** | ✅ 재현 스크립트용 allowlist/승인 |

---

## 5. MVP vs Full Set Mapping

| 단계 | 포함 |
|------|------|
| **C1** | 없음 |
| **C2~C3 MVP** | `run_terminal_cmd` (allowlist) |
| **C4+** | permission·timeout·truncate 강화 |
| **C5~C7** | + `run_background`, `await_terminal`/`Monitor`, `kill_process` |

---

## 6. Acceptance Criteria

- [ ] Given Tier A + `npm test` on allowlist, When called, Then executes and returns truncated stdout
- [ ] Given Tier A + `rm -rf /`, When called, Then denied without execution
- [ ] Given Tier A schema, When inspected, Then `run_terminal_cmd` **is present** (not banned wholesale)
- [ ] Given Ask mode, When agent requests shell, Then tool absent or hard-denied
- [ ] Registry primary name is `run_terminal_cmd` (not only legacy `terminal`)

---

## 7. Dependencies

| 관심사 | Owner |
|--------|--------|
| Execution / PTY | `PRD-Spec-04_Terminal_Execution.md` |
| Permission | `PRD-Infra-05_Permission_Autorun.md` |
| Verify after edit | `PRD-Harness-10_Verification_MicroLoop.md` |
| Tier whitelist | `PRD-Harness-06_A_Tier_Whitelist.md` |

---

## 8. Out of Scope

- `git_*` / `gh_*` 전용 래퍼 → F (optional)  
- Playwright / browser shell → D  
- Serial monitor 하드웨어 → `PRD-27_Serial_Monitor.md`
