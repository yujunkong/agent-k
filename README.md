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

상태 기호: `[x]` 완료 · `[~]` 부분/진행 · `[ ]` 미착수 · `[-]` 의도적 스킵  
**이 README는 Work Order 요약이다.** Feature별 한 줄 상태는 항상 `docs/V3_WORK_ORDER.md`를 본다.

---

## 한눈에 보는 Phase 현황

| Phase | 범위 | 대략 | 요약 |
|-------|------|------|------|
| 0 | 뼈대 / EXT / HOST / SHARED / CFG | `[x]` | 확장 로드, host↔webview, config — HOST-002 RCA 확정 (2026-09-19) |
| 1 | Providers / Models (R-001) | `[x]` | LiteLLM 연결, 모델 라우팅 UI 분리 |
| 2 | Agent Core + Modes + Safety | `[x]` 대부분 | AgentLoop, modes, tools, safety |
| 3 | Chat / Streaming / Conversation | `[x]` | Timeline, Composer, stream — **안정 표면**; CONV-014/016 완료 (2026-09-19) |
| 4 | Worktree / Patch (R-003) | `[x]` | worktree isolation / apply / rollback |
| 5 | Subagent | `[x]` | Task tool + SubagentHost + child session |
| 6 | Plan Card + Execution (R-004) | `[x]` | PlanCard, execute DAG, INT-002 |
| 7 | Coding UX (Inline / Review) | `[x]` | INLINE-001~007 + REVIEW-001~006 + UI 배선 (2026-09-19) |
| 8 | Intelligence / integrations | `[x]` 대부분 | CTX·HARNESS·MCP·TEL·SKILL·MEM·BON·SCM·BROWSER·DESIGN·GH·ART 도메인 `[x]` |
| 9 | Settings / UI polish | `[x]` 대부분 | Settings 탭 UI shell |
| 10 | 통합 검증 INT-* | `[x]` | INT-001/003~009 domain 통합 테스트 PASS (2026-09-19) |

숫자 상세는 Work Order Phase 표를 따른다 (세션마다 갱신).

---

## 지금 쓸 수 있는 것 (제품 관점)

### 채팅 / 타임라인 (Phase 3 — 안정 표면)

- Activity Bar 채팅, Composer, 모드(Ask/Agent/Plan/Debug), 모델 선택
- Streaming + Stop, Thought / tool / Ran / Edited 카드 (MessageSteps)
- AskQuestion 카드, 이미지 paste/DnD (CHAT-012)
- ChangedFilesBar: 열기/Review/Checkpoints dropdown/restore (CONV-016, 2026-09-19)
- **참고:** STREAM-004 follow-up prior 직렬화는 완료(`a8f890c`) — 이슈 해소됨

### Agent 런타임 (Phase 2)

- `AgentLoopController`: model → tools → model, doom-loop, compaction
- Tool registry + builtins (read/edit/search/terminal/ask/task/mcp/…)
- Modes + plan write gate (`planStage !== build`이면 write 숨김/deny)
- Safety: PermissionGate, deny globs, checkpoint spine (host fs apply — REVIEW/INLINE 연동 완료)

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
| INLINE-005~007 | `[x]` review/apply/completion — checkpoint spine + `SelectionDiffApply` + InlineCompletion (2026-09-12) |

### Context / Index (Phase 8 CTX)

CTX-006~012 `[x]`: Workspace/Codebase index, semantic search, mentions, prefetch, chat search index (core).

### Settings UI (Phase 9)

SET-001~013 `[x]` 탭 셸 (Models/Context/Features/Harness/MCP/…); 일부는 host IO 후속.

---

## 아직 안 된 것 / 부분만

### Phase 7 잔여

- 없음 — REVIEW-001~006 + INLINE-005~007 + Review/Finding UI 배선 완료 (2026-09-19)

### Phase 8 잔여

- **BROWSER-004** preview UI 배선 완료 — live session source(Playwright) 후속
- **GH-002** GitHub token — gh CLI 위임 (별도 token 관리 미구현)
- **BON** AgentLoop trial runner — 현재 placeholder runner (task staging만)
- **HARNESS-007** `[~]` — core/chat-ui 프롬프트 헬퍼 분열 정리 후속

### Phase 10 / 테스트

- INT-001, 003~009 domain 통합 테스트 PASS (2026-09-19) — host+UI full E2E는 별도 검증 여지
- TEST-001~005, 007~008 `[ ]` (패키지 단위 vitest는 있으나 Master TEST 인벤토리 미체크)

### 알려진 갭 (안정 표면 근처)

| ID | 이슈 |
|----|------|
| STREAM-004 | ~~follow-up prior 직렬화~~ — 완료 (`a8f890c`) |
| HOST-002 | ~~final-answer 중도 끊김 RCA~~ — RCA 확정 + `incomplete` 계약 + 회귀 테스트 (2026-09-19) |
| CONV-014 / 016 | ~~Thought soft-pause 잔여 · ChangedFiles 바 내부~~ — 완료 (2026-09-19) |
| 횡단 | ~~chat-ui 경계 침식~~ — 정리 완료 (2026-09-19: vscode/fs/child_process/network 0건 + `boundary.test.ts` 가드) · 프로토콜 드리프트(`rules.*` 해소, `plan.save/load`·`host.bestOfN` 잔여) · harness D1 config 버그 |

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
  worktree/                  # isolation, BoN fan-out, adopt
  safety/                    # gate, deny, checkpoint, verify helpers
docs/                        # Master, Work Order, Monorepo, Plan
```

경계 요약: UI는 `chat-ui`, 루프 본문은 `core`, `vscode`는 `host`만. 상세는 `AGENTS.md`.

---

## 다음 작업 큐 (Work Order 「다음으로 할 일」)

1. **BROWSER-004** live session source (Playwright) · **GH-002** token · **BON** AgentLoop runner  
2. **HARNESS-007** core/chat-ui 프롬프트 헬퍼 단일화 (harness D7/D16)  
3. **harness D1** config read 버그 수정 — 마스터 스위치 복구  
4. **프로토콜 드리프트** — ~~`rules.*`~~ `[x]` (2026-09-19) · `plan.save/load`, `host.bestOfN` 등 유실 메시지 배선  
5. ~~**chat-ui 경계 침식** 정리~~ `[x]` (2026-09-19)  

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
