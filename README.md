# Agent-K v3.0

VS Code / Cursor 확장형 코딩 에이전트. v2.1 트리를 통째로 옮긴 것이 아니라 **Feature ID 단위로 이식**한 모노레포다.

| 항목 | 값 |
|------|-----|
| 쓰기 브랜치 | `v3.0` |
| 참조(읽기 전용) | `v2.1-PRODUCTION-MODE` |
| Feature 권위 | [`docs/AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md`](docs/AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md) |
| 상세 체크리스트 | [`docs/V3_WORK_ORDER.md`](docs/V3_WORK_ORDER.md) ← **상태 SoT** |
| 작업 방식 | [`docs/V3_WORK_PLAN.md`](docs/V3_WORK_PLAN.md) |
| 패키지 경계 | [`docs/AGENT-K-MONOREPO-FINAL.md`](docs/AGENT-K-MONOREPO-FINAL.md) |
| 에이전트 규칙 | [`AGENTS.md`](AGENTS.md), [`.cursor/rules/`](.cursor/rules/) |

상태 기호: `[x]` 완료 · `[~]` 부분/진행 · `[ ]` 미착수  
**이 README는 Work Order 요약이다.** Feature별 한 줄 상태는 항상 `docs/V3_WORK_ORDER.md`를 본다.

---

## 한눈에 보는 Phase 현황

| Phase | 범위 | 대략 | 요약 |
|-------|------|------|------|
| 0 | 뼈대 / EXT / HOST / SHARED / CFG | `[x]` 거의 전부 | 확장 로드, host↔webview, config |
| 1 | Providers / Models (R-001) | `[x]` | LiteLLM 연결, 모델 라우팅 UI 분리 |
| 2 | Agent Core + Modes + Safety | `[x]` 대부분 | AgentLoop, modes, tools, safety |
| 3 | Chat / Streaming / Conversation | `[x]` 대부분 | Timeline, Composer, stream — **안정 표면** |
| 4 | Worktree / Patch (R-003) | `[x]` | worktree isolation / apply / rollback |
| 5 | Subagent | `[x]` | Task tool + SubagentHost + child session |
| 6 | Plan Card + Execution (R-004) | `[x]` | PlanCard, execute DAG, INT-002 |
| 7 | Coding UX (Inline / Review) | `[~]` | Inline 001–004 `[x]` · Review·005–007 미완 |
| 8 | Intelligence / integrations | `[~]` | CTX·HARNESS·MCP `[x]` · TEL/BROWSER/… `[ ]` |
| 9 | Settings / UI polish | `[x]` 대부분 | Settings 탭 UI shell |
| 10 | 통합 검증 INT-* | `[ ]` 거의 | INT-002만 `[x]` |

숫자 상세는 Work Order Phase 표를 따른다 (세션마다 갱신).

---

## 지금 쓸 수 있는 것 (제품 관점)

### 채팅 / 타임라인 (Phase 3 — 안정 표면)

- Activity Bar 채팅, Composer, 모드(Ask/Agent/Plan/Debug), 모델 선택
- Streaming + Stop, Thought / tool / Ran / Edited 카드 (MessageSteps)
- AskQuestion 카드, 이미지 paste/DnD (CHAT-012)
- **주의:** follow-up prior 직렬화 이슈(STREAM-004) — UI에는 대화가 보이는데 모델이 prior를 못 볼 수 있음

### Agent 런타임 (Phase 2)

- `AgentLoopController`: model → tools → model, doom-loop, compaction
- Tool registry + builtins (read/edit/search/terminal/ask/task/mcp/…)
- Modes + plan write gate (`planStage !== build`이면 write 숨김/deny)
- Safety: PermissionGate, deny globs, checkpoint 인터페이스 (host persist는 REVIEW와 연계 미완)

### Harness (Phase 8 일부)

| ID | 동작 |
|----|------|
| HARNESS-001 | `agent-k.harness.enabled` — tier 도구 필터·prompt·verify 일괄 |
| HARNESS-002 | Verification-first system prompt + `/goal`식 exit gate |
| HARNESS-003 | PrefetchEngine → chatSend inject |
| HARNESS-004 | edit/write 후 `read_lints` micro-loop (실패→루프 계속) |
| HARNESS-005 | AGENTS.md / `.agentk/rules` / `.cursor/rules` → sticky (compact 밖) |
| HARNESS-006 | `routeByHeuristics` → model tier |
| HARNESS-007 | `[~]` CursorPattern + TurnStructure + search-before-read |

답변 길이: mode system prompt에 **concise reply** 규칙 포함.

### Plan (Phase 6)

- Timeline PlanCard (생성/승인/부분 Build/실행 상태)
- `@agent-k/plan` PlanSession / ExecutionPlan / scheduler
- INT-002: `plan.execute` → wired SubagentHost + main-task AgentLoop
- PLAN-009: 승인 plan sticky inject + plan mode write enforcement

### Worktree / Subagent (Phase 4–5)

- Subagent worktree, review/apply/reject 브리지
- `task` / `task_run` → child ChatSession 스트림 (SUB-010)

### MCP (Phase 8)

| ID | 상태 |
|----|------|
| MCP-001~006 | `[x]` stdio MCPClient, reload/connect/disconnect, permission, parse, defer by schema budget |
| HTTP transport | 미구현 (stdio만) |

설정: `agent-k.mcp.servers`, `agent-k.features.mcp`, Settings → MCP 탭 → Reload.

### Inline Edit (Phase 7 일부)

| ID | 상태 |
|----|------|
| INLINE-001~004 | `[x]` Cmd 등록, selection → chat, `inlineEdit` payload, `file.edit` source 태그 |
| INLINE-005~007 | `[~]`/`[ ]` review/apply/completion — checkpoint·host apply 선행 필요 |

### Context / Index (Phase 8 CTX)

CTX-006~012 `[x]`: Workspace/Codebase index, semantic search, mentions, prefetch, chat search index (core).

### Settings UI (Phase 9)

SET-001~013 `[x]` 탭 셸 (Models/Context/Features/Harness/MCP/…); 일부는 host IO 후속.

---

## 아직 안 된 것 / 부분만

### Phase 7 잔여

- **REVIEW-001~006** — openReview stub, AgentReviewLoop host 미연결, checkpoint host stub
- **INLINE-005~007** — accept/reject·SelectionDiffApply·InlineCompletion

### Phase 8 잔여

- **TEL-001~003** Cost / status bar telemetry
- **SKILL-001~003** (tools `SkillTool`은 있으나 feature/registry 미완)
- **MEM-001~004**, **GH-001~003**, **ART-001~003**
- **BON-001~005**, **SCM-001**
- **BROWSER-001~004**, **DESIGN-001~002**

### Phase 10 / 테스트

- INT-001, 003~009 `[ ]` (INT-002만 완료)
- TEST-001~005, 007~008 `[ ]` (패키지 단위 vitest는 있으나 Master TEST 인벤토리 미체크)

### 알려진 갭 (안정 표면 근처)

| ID | 이슈 |
|----|------|
| STREAM-004 | follow-up prior: `content \|\| turnProse` 직렬화 필요 |
| HOST-002 | final-answer 중도 끊김 RCA (확정 전 휴리스틱 패치 금지) |
| CONV-014 / 016 | Thought soft-pause 잔여 · ChangedFiles 바 내부 — 의도적 미룸 |

---

## 레이아웃

```text
extensions/agent-k/          # VSIX 조립만 (activate → @agent-k/host)
packages/
  shared/                    # protocol / types only
  host/                      # vscode Extension Host bridge
  chat-ui/                   # webview React (vscode import 금지)
  core/                      # AgentLoop, modes, context, harness, mcp, prefetch
  tools/                     # tool executors + registry
  providers/                 # LiteLLM / routing
  plan/                      # PlanSession + execution DAG
  worktree/                  # isolation, BoN stubs, adopt
  safety/                    # gate, deny, checkpoint, verify helpers
docs/                        # Master, Work Order, Monorepo, Plan
```

경계 요약: UI는 `chat-ui`, 루프 본문은 `core`, `vscode`는 `host`만. 상세는 `AGENTS.md`.

---

## 다음 작업 큐 (Work Order 「다음으로 할 일」)

1. Phase 8 잔여 — **TEL** → SKILL/MEM → BON/SCM → BROWSER/DESIGN/GH/ART  
2. Phase 7 — **REVIEW-004** checkpoint → openReview loop → apply  
3. INLINE-005~007  
4. STREAM-004 prior 직렬화 (최소 침습)  
5. HOST-002 final-cut RCA  

---

## Commands

```bash
npm install
npm run build:webview    # chat-ui → extensions/agent-k/media
npm run check            # 주요 패키지 테스트
npm run typecheck
```

F5: `extensions/agent-k` 확장 개발 호스트로 로드.

`v2.1` `src/` 통째 복붙 금지 — Feature ID 단위 이식만.

---

## 문서만으로 상태 확인하는 법

1. **이 README** — 제품/Phase 요약  
2. **`docs/V3_WORK_ORDER.md`** — Feature ID별 `[x]/`/`[~]`/`[ ]` SoT + 안정 표면 + 다음 할 일  
3. **Feature Master** — 원래 범위 정의 (구현 여부 아님)  
4. 패키지 README — 도메인 역할만 (상태 표는 Work Order)
