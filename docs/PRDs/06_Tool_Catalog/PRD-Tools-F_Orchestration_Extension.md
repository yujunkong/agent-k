# PRD-Tools-F: Orchestration · Extension (오케스트레이션 · 확장)

> **Category**: Tool Catalog — F. Orchestration · Extension  
> **Phase**: **C7** (서브에이전트, MCP, Skills, worktree/best-of-n) · 일부 인프라 훅은 C4  
> **Related PRDs**:  
> - `../02_A_Tier_Production_Grade/PRD-10_MCP_Client.md`  
> - `../02_A_Tier_Production_Grade/PRD-12_Side_Chat.md`  
> - `../02_A_Tier_Production_Grade/PRD-13_Worktree_BestOfN.md`  
> - `../02_A_Tier_Production_Grade/PRD-18_PR_Issue_Agent.md`  
> - `../04_Implementation_Phases/PRD-C7_Production_Grade.md`  
> - `../05_Core_Infrastructure/PRD-Infra-04_Tool_Registry.md`  
> - `../05_Core_Infrastructure/PRD-Infra-14_Tool_Call_Orchestration.md`  
> - `../07_Medium_Model_Harness/PRD-Harness-06_A_Tier_Whitelist.md`  
> **Out of Scope**: 도메인 B-tier 도구(펌웨어 SVD·레거시 스캔·MISRA·시리얼) — **`PRD-24`~`PRD-27`에 남김**. 구(舊) Specialized Utility 카탈로그 G로 흡수하지 않음.

---

## 1. Overview

`Extension_high_impact.md` **F. 오케스트레이션 · 확장**과 동일.

| 도구 | 역할 |
|------|------|
| `task` / `Agent` | 서브에이전트 위임 |
| `send_message` | 에이전트 간 메시지 |
| `mcp_*` | MCP 도구·리소스 |
| `tool_search` | 지연 로드 도구 검색 |
| `skill` | Skills / pinned 워크플로 (**C7**) |
| `git_*` (optional) | status/diff/commit 전용 |
| `gh_*` (optional) | 이슈·PR |
| `worktree` (optional) | 격리 작업 트리 |

스키마 폭증 시: MCP는 stub + `tool_search`로 deferred.

---

## 2. Tool Definitions

### 2.1 `task` / `Agent`

```typescript
// 의도: 별도 컨텍스트 서브에이전트. Tier A는 multi-subagent LOCKED
{
  name: "task", // alias: Agent
  description: "Spawn a subagent with isolated context for explore/implement.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      subagent_type: { type: "string", description: "explore | generalPurpose | …" },
      model: { type: "string" },
      run_in_background: { type: "boolean", default: false }
    },
    required: ["prompt"],
    additionalProperties: false
  }
}
```

---

### 2.2 `send_message`

```typescript
{
  name: "send_message",
  description: "Send a follow-up message to a running/finished agent session.",
  parameters: {
    type: "object",
    properties: {
      agent_id: { type: "string" },
      message: { type: "string" },
      interrupt: { type: "boolean", default: false }
    },
    required: ["agent_id", "message"],
    additionalProperties: false
  }
}
```

---

### 2.3 `mcp_*`

레지스트리에 MCP 서버 도구가 `mcp_<server>_<tool>` 또는 동적 네임스페이스로 합류.

```typescript
// 의도: bulk MCP 스키마를 Tier A에 넣지 않음 — tool_search / deferred
{
  name: "mcp_auth", // example control-plane tool
  description: "Authenticate an MCP namespace when status is needsAuth.",
  parameters: {
    type: "object",
    properties: {
      namespace: { type: "string" }
    },
    required: ["namespace"],
    additionalProperties: false
  }
}
```

상세: `PRD-10_MCP_Client.md`.

---

### 2.4 `tool_search`

```typescript
{
  name: "tool_search",
  description: "Search deferred tools (MCP etc.) and load schemas on demand.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "integer", default: 10, maximum: 25 }
    },
    required: ["query"],
    additionalProperties: false
  }
}
```

---

### 2.5 `skill` (C7)

```typescript
{
  name: "skill",
  description: "Load a Skill / pinned workflow package into context.",
  parameters: {
    type: "object",
    properties: {
      skill_id: { type: "string" },
      args: { type: "object", additionalProperties: true }
    },
    required: ["skill_id"],
    additionalProperties: false
  }
}
```

`fetch_rules`(E)와 구분: Rules = 상시/경로 규칙, Skill = 재사용 워크플로 패키지.

---

### 2.6 Optional: `git_*`, `gh_*`, `worktree`

| 도구 | 비고 |
|------|------|
| `git_status` / `git_diff` / … | 없어도 `run_terminal_cmd`로 가능 — 전용 도구는 권한·UI 이점 |
| `gh_pr_create` 등 | `PRD-18_PR_Issue_Agent.md` |
| `worktree` | `/worktree`, `/best-of-n` — `PRD-13_Worktree_BestOfN.md` · **C7** |

```typescript
{
  name: "worktree",
  description: "Create or manage an isolated git worktree for parallel attempts.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["enter", "exit", "list"] },
      path: { type: "string" },
      branch: { type: "string" }
    },
    required: ["action"],
    additionalProperties: false
  }
}
```

---

## 3. Tier Availability Matrix

| 도구 | Tier A (Flash) | Tier B (Pro) |
|------|----------------|--------------|
| `task` / multi-subagent | 🔒 LOCKED | ✅ (C7) |
| `send_message` | 🔒 | ✅ |
| `mcp_*` bulk | 🔒 | ✅ (+ deferred) |
| `tool_search` | 🔒 | ✅ |
| `skill` | 🔒 | ✅ (**C7**) |
| `git_*` / `gh_*` / `worktree` | 🔒 | ⚪ optional C7 |

**CRITICAL**: Tier A still gets allowlisted `run_terminal_cmd` — do not ban terminal when locking orchestration.

---

## 4. Mode Whitelist Notes

| Mode | Orchestration |
|------|---------------|
| **Ask** | Side-chat식 읽기 서브에이전트만 허용 가능; 쓰기 task ❌ |
| **Agent** | C7 정책 전체 |
| **Plan** | todo→task 분기는 승인 후 |
| **Debug** | 기본 단일 에이전트; 서브에이전트 최소화 |

---

## 5. MVP vs Full Set Mapping

| 단계 | 포함 |
|------|------|
| **C1~C3 MVP** | 없음 (오케스트레이션 제외) |
| **C4+** | Registry deferred 준비, side chat 기초 |
| **C5~C7** | `task`, MCP, `skill`, `tool_search`, `worktree`, (opt) `git_*`/`gh_*` |

---

## 6. Acceptance Criteria

- [ ] Given Tier A, When schemas built, Then no `task` / bulk `mcp_*` / `skill`
- [ ] Given many MCP tools, When Agent starts, Then only stubs + `tool_search` until needed
- [ ] Given C7, When `/best-of-n`, Then `worktree` isolation used
- [ ] Domain utilities not listed here — pointer only to `PRD-24`~`PRD-27`

---

## 7. Dependencies

| 관심사 | Owner |
|--------|--------|
| MCP | `PRD-10_MCP_Client.md` |
| Worktree | `PRD-13_Worktree_BestOfN.md` |
| Orchestration | `PRD-Infra-14_Tool_Call_Orchestration.md` |
| C7 | `PRD-C7_Production_Grade.md` |

---

## 8. Out of Scope

- Debug 계측 도구 → G  
- 도메인 Specialized (SVD, legacy scan, MISRA, serial) → **`../03_B_Tier_Domain_Specific/PRD-24_*.md` ~ `PRD-27_*.md`**
