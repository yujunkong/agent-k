# PRD-Subagents: Subagent System

> **Category**: Orchestration / Context Isolation  
> **Phase**: SUBAG (next after ADDON)  
> **Status**: Draft → Ready for implementation  
> **Related**: ADDON-T09 (`TaskTool` / `SubAgentResult`), C7-T21/T22, BestOfN (filesystem isolation)  
> **External refs**: [Cursor Subagents](https://cursor.com/docs/subagents.md), [Claude Code Sub-agents](https://code.claude.com/docs/en/sub-agents), [agentpatterns /multitask](https://agentpatterns.ai/tools/cursor/multitask-subagents/)

---

## 1. Overview

### 목적
부모 Agent의 컨텍스트를 오염시키지 않고, **별도 context window**에서 탐색·셸·브라우저·전문 작업을 수행한 뒤 **요약만** 부모에 반환하는 서브에이전트 시스템을 제품한다.

### 비즈니스 가치
- 긴 탐색/로그/DOM이 메인 대화를 잠식하지 않음 → 소형·중형 모델 안정성↑
- Explore는 fast 모델로 병렬 검색 → 체감 지연·비용↓
- `.agentk/agents/*.md` (Cursor `.cursor/agents/` 호환)로 팀 전용 워커 재사용

### Non-goals (이번 페이즈)
- Cloud / VM 서브에이전트
- Agents Window급 멀티 탭 IDE 셸 (최소 SubAgentCard면 충분)
- Best-of-N과 API 통합은 W5에서 **옵션 조합**만 (BoN 재작성 금지)

---

## 2. Layer model (필수 구분)

| Layer | Isolation | When | Agent K module |
|-------|-----------|------|----------------|
| **A. Context Subagent** | Context only | 읽기 위주 / 같은 checkout | `TaskTool` + `src/subagents/*` |
| **B. Filesystem Subagent** | Git worktree | 겹치는 파일 병렬 편집 | `BestOfN` / WorktreeManager |
| **C. Session Tab** | Chat session | 사용자가 직접 병렬 대화 | ChatSessionStore |

`/multitask` ≈ A, `/worktree`·BoN ≈ B. **A와 B를 섞어 한 도구로 만들지 않는다.**

---

## 3. Functional requirements

### 3.1 Agent definition (Cursor-compatible frontmatter)

```markdown
---
name: explore
description: Codebase search specialist. Use proactively for multi-file research.
model: fast          # inherit | fast | <modelId>
readonly: true
is_background: false
maxTurns: 12
---
You search the repo and return paths, symbols, and short excerpts only...
```

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `name` | no | filename | lowercase-hyphen |
| `description` | yes (for auto-delegate) | — | Parent reads this to decide |
| `model` | no | `inherit` | `fast` = cheaper/faster tier |
| `readonly` | no | false | No edits / state-changing shell |
| `is_background` | no | false | Non-blocking dispatch |
| `maxTurns` | no | type default | Cap child loop |

**Load order**: `.agentk/agents/` → `.cursor/agents/` → `~/.agentk/agents/` (optional `.claude/agents/`).

### 3.2 Built-in agents

| ID | Tools | Model default | Why subagent |
|----|-------|---------------|--------------|
| `explore` | Grep/Read/Semantic/LSP (ask) | fast | Intermediate search bloat |
| `shell` | Shell whitelist only | fast | Verbose logs |
| `browser` | BrowserToolGroup | inherit | DOM/screenshot noise |
| `general` | Mode agent tools | inherit | Existing TaskTool default |

### 3.3 Tool surface (`task_run`)

```ts
{
  subagent_type: string; // explore | shell | browser | general | registry name
  description: string;   // 3–5 words UI
  prompt: string;        // full handoff (child has no parent history)
  model?: 'inherit' | 'fast' | string;
  readonly?: boolean;
  background?: boolean;
  resume?: string;       // agentId
  maxTurns?: number;
}
```

### 3.4 Runtime contracts

| Rule | Spec |
|------|------|
| Depth | Parent → child only. Grandchild: strip `task_run` from tools |
| Fan-out | `agent-k.subagents.maxConcurrent` default **4** |
| Summary | Parent gets `SubAgentResult` only (≤ ~2k chars) |
| Project rules | Inject **truncated** PROJECT RULES into child system prompt (not full parent transcript) |
| Cancel | AbortController + UI Stop |
| Resume | Persist child transcript under `.agentk/subagents/<id>/` |

### 3.5 Parent prompt policy (system)

1. Long multi-file search → `explore`
2. Noisy shell series → `shell`
3. Browser/DOM → `browser`
4. One-shot procedural → Skill, not subagent
5. Handoff `prompt` must include paths, constraints, success criteria

### 3.6 UI

- `MessageSteps` / `SubAgentCard`: status, type, model, Expand log, Cancel, Resume
- Optional `BackgroundRail` for async jobs (W3+)

---

## 4. Architecture sketch

```
Parent AgentLoop
  └─ task_run
       ├─ AgentRegistry.resolve(subagent_type)
       ├─ SubAgentRuntime.spawn({ depth, model, readonly, background })
       │    └─ AgentLoopController (fresh messages)
       ├─ SubAgentResult.summarize → tool_result
       └─ onProgress → webview SubAgentCard
```

**New package layout**

```
src/subagents/
  AgentDefinition.ts
  AgentRegistry.ts
  BuiltinAgents.ts
  SubAgentRuntime.ts
  BackgroundQueue.ts
  transcriptStore.ts   # W4
```

Reuse: `TaskTool.ts`, `SubAgentResult.ts`, `MessageSteps.tsx`.

---

## 5. Implementation waves → task map

| Wave | Focus | Task IDs |
|------|-------|----------|
| **W1** | Registry + explore + depth guard | SUBAG-T01, T02, T03, T04 |
| **W2** | model/readonly + SubAgentCard | SUBAG-T05, T06 |
| **W3** | background + fan-out cap | SUBAG-T07, T08 |
| **W4** | resume + transcript | SUBAG-T09 |
| **W5** | worktree compose (optional flag) | SUBAG-T10 |
| **QA** | smoke + docs | SUBAG-T11 |

상세 AC·파일: [`docs/TODO_TASKS/tasks/SUBAG/README.md`](../../TODO_TASKS/tasks/SUBAG/README.md)

---

## 6. Acceptance (phase-level)

- [ ] Parent transcript never contains child tool intermediate dumps (summary only)
- [ ] `explore` usable via `task_run` with readonly + fast default
- [ ] Custom agent loadable from `.agentk/agents/*.md`
- [ ] Depth>1 cannot spawn further subagents
- [ ] Concurrent subagents capped; excess queue or reject with clear error
- [ ] Unit tests for registry parse + depth + summarize path
- [ ] `npm run test:addon` 확장 또는 `npm run test:subag` 스모크

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Fan-out cost explosion | maxConcurrent + settings + parent prompt |
| Weak handoff → mock solutions | Prompt policy + require success criteria in schema description |
| Overlapping writes without worktree | Document Layer A vs B; W5 optional `worktree: true` |
| Webview pulls Node via imports | Keep subagent host-only; UI via protocol messages |

---

## 8. Decisions (locked for v1)

| Topic | Decision |
|-------|----------|
| Definition dirs | `.agentk/agents/` primary + `.cursor/agents/` compat |
| Nesting | Depth 1 only (no grandchild spawn) |
| Background default | `false` (explore may set true in definition later) |
| Cloud | Out of scope |
