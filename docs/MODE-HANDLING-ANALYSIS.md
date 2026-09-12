# Agent-K 모드별 요청 처리 분석

> **작성일:** 2026-08-30 | **대상 브랜치:** `v3.0` (참조: `v2.1-PRODUCTION-MODE`)  
> **근거 문서:** `docs/AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md` §7, `docs/V3_WORK_ORDER.md` Phase 2, `docs/AGENT-K-MONOREPO-FINAL.md`  
> **검증 경로:** `packages/core/src/mode/*`, `packages/core/src/loop/AgentLoopController.ts`, `packages/core/src/context/*`, `packages/core/src/harness/*`, `packages/core/src/prefetch/*`, `packages/core/src/debug/*`, `packages/shared/src/common/mode.ts`, `packages/host/src/chatSend.ts`

**요약:** 사용자가 체감하는 "프로젝트에 매몰되어 일을 못함"은 버그가 아니라 아키텍처 특성이다. 모든 모드가 동일한 과도한 컨텍스트 주입 파이프라인(`PROJECT RULES` 12k + Prefetch 50k + Harness 프롬프트)을 공유하여 유저 의도(2k) 대비 프로젝트 scaffolding(60k)이 압도하기 때문이다.

---

## 1. 전체 디스패치 아키텍처

```
┌─ VS Code Extension (extensions/agent-k / HOST-001) ─────────────────┐
│ ChatViewProvider ↔ Webview ChatApp (CHAT-001)                         │
│  Composer (CHAT-002) [ModeSelector(CHAT-004) + ModelSelector]         │
│  → ChatSendPayload{ requestId, mode, planStage, debugStage,            │
│     messages:[...history, user], images?, inlineEdit? }               │
│     (shared/protocol/chat-send.ts)                                    │
└──────────────────────────────┬────────────────────────────────────────┘
                               │ postMessage('chat.send')
                               ▼
┌─ HOST BRIDGE (packages/host/src/chatSend.ts / HOST-002) ─────────────┐
│ 1. Provider 검증 (baseUrl+model 없으면 에러 스트림)                     │
│ 2. modeRegistry.getModeConfig(mode) → systemPrompt/budget/maxTurns     │
│ 3. Harness 설정 추출 + routeByHeuristics() → modelTier A/B/C          │
│ 4. ToolRegistry.getSchemas(mode, {planStage, modelTier, harness})      │
│    + planWriteGate / isDebugToolAllowedForStage 필터                   │
│ 5. LiteLLMProvider 생성                                                │
│ 6. PrefetchEngine.prefetch(userPrompt, mode) → ContextBlock            │
│    + ContextAssembler가 ProjectRulesLoader 결과 합성                    │
│ 7. AgentLoopController 생성 (mode, maxTurns, budget, stickyContext)    │
│ 8. priorMessages = payload.messages.slice(0,-1)                        │
│ 9. streamChat 루프 → postMessage('chat.stream',{delta,timeline,        │
│    terminal.run, file.edit, tool.start/end, complete})                │
└──────────────────────────────┬────────────────────────────────────────┘
                               ▼ AgentLoopController.run() (packages/core)
┌─ CORE RUNTIME ────────────────────────────────────────────────────────┐
│ ContextAssembler.assemble() (CTX-003 / AGENT-005)                     │
│  system = mode.systemPrompt                                           │
│         + (verificationFirst? VERIFICATION_FIRST_PROMPT)               │
│         + (harness? CursorPattern + TurnStructure) // ~1.2k            │
│         + stickyContext + approvedPlanBlock                             │
│         + PROJECT RULES (AGENTS.md + .agentk/rules + .cursor/rules)   │
│           // 12k, compaction 대상 제외, 매 턴 재주입 (HARNESS-005)      │
│         + WorkspaceContext.toPromptBlock()                              │
│  messages = [system(protected)] + history                             │
│  overBudget면 CompactionEngine.compact() → UI "Summarizing..."         │
│                                                                       │
│ Loop (turn ≤ maxTurns)                                                │
│  runModel(messages) → {content, reasoning, toolCalls}                 │
│  ├─ toolCalls 없음 → evaluateVerifyExit() (HARNESS-002) → nudge?      │
│  └─ toolCalls 있음 → PermissionGate + planWriteGate + debug stage 검사 │
│     → ParallelExecutor(8) / StreamingExecutor                          │
│     → DoomLoopDetector(threshold 3)                                   │
│     → HARNESS-004: edit/write 후 read_lints 자동 검증                 │
│     → blind read 감지 시 SEARCH_BEFORE_READ_NUDGE 주입                │
│     → tool 결과 append → next assemble()                               │
│ 종료: completed | max_turns | doom_loop | timeout | fatal             │
└──────────────────────────────┬────────────────────────────────────────┘
                               │ results
┌─ TOOL / SAFETY / PROVIDER ────────────────────────────────────────────┐
│ ToolRegistry → executeTool(registry, name, args, ctx)                 │
│ SAFE-* PermissionGate, DenyGlobs, SecretScan, Checkpoint              │
│ Provider: LiteLLMProvider.streamChat({tools:schemas, thinkingEffort}) │
│ Worktree/Subagent: createSubagentHost → 격리 cwd + AGENT-017 루프     │
└───────────────────────────────────────────────────────────────────────┘

Plan 정석 경로(Phase 6): CHAT-011 → HOST-008b planGenerate → @agent-k/plan PlanV2Generator
  → WorkspaceContext + EvidenceEngine → PlanCard 렌더 → Approve → buildPlanToAgentHandoff()
  → 일반 Agent send로 재합류 (approvedPlanBlock 매 턴 주입)
```

**단일 진실 공급원(SoT):**
- `packages/shared/src/common/mode.ts` — `AgentMode` 유니온 타입 + `isAgentMode()` 가드
- `packages/core/src/mode/ModeRegistry.ts` — 런타임 SoT. `ModeSelector`(CHAT-004)는 추측하지 않고 `ChatSendPayload.mode`를 그대로 기록 (R-002 준수)

---

## 2. 모드 인벤토리

| ID | 모드 | 팩토리 / 스토어 | v3.0 상태 | shared 타입 |
|---|---|---|---|---|
| MODE-001 | **Ask** | `createAskModeConfig()` | [x] | `ask` |
| MODE-002 | **Agent** | `createAgentModeConfig()` | [x] | `agent` |
| MODE-003 | **Plan** | `createPlanModeConfig()` | [x] | `plan` |
| MODE-004 | **Debug** | `createDebugModeConfig()` | [x] domain, UI→Phase3 | `debug` |
| MODE-005 | **Auto** | `classifyAutoMode()` | [x] | 휴리스틱, LLM 미사용 |
| MODE-006 | **Sticky** | `StickyModeStore` | [x] | 턴 간 유지 |
| MODE-007 | **Plan V2 Sticky** | `PlanSchemaStickyState` | [x] | `research/planning/review` |
| MODE-008 | **Manual Override** | `ManualModeOverride` | [x] | `override > sticky > auto` |
| MODE-009 | **Plan→Agent Handoff** | `buildPlanToAgentHandoff()` | [x] | Host→Agent 전이 |

---

## 3. 모드별 상세

### 3.1 MODE-001 Ask — 읽기 전용 Q&A

- **목적:** 코드 설명/위치 탐색. 절대 변경하지 않음.
- **진입:** 사용자가 Composer에서 `Ask` 선택, 또는 `classifyAutoMode`가 `what is|explain|where is` 패턴에서 `fix|implement` 키워드가 없을 때 conf 0.65로 분류
- **시스템 프롬프트:** `MODE_PROMPTS.ask` — "Read and search only — never edit..." + `CONCISE_REPLY_RULES`
- **허용 툴 (ASK_ALLOWED_TOOLS):** `grep, glob, file_search, list_dir, read_file, read_files, read_lints, codebase_search, lsp_* , web_search/fetch, mcp_list/call, ask_question, todo_write, skill*` — `edit/write/delete/run_terminal/task*/browser*/debug_*` 차단, `readOnly:true`
- **처리 흐름:**
  1. `ChatSendPayload{mode:'ask', planStage:'research'}` 생성
  2. Host가 `budget 50k / maxTurns 35`로 설정, Ask 전용 18개 툴 스키마만 LLM에 노출
  3. `ContextAssembler`가 Ask 프롬프트 + `PROJECT RULES` + `CursorPattern/TurnStructure` 주입 (Ask도 동일하게 받음)
  4. `AgentLoopController` 루프: tool → PermissionGate → StreamingToolExecutor → DoomLoop/searchBeforeRead 검사 → 결과 append
  5. `chat-ui` WorkTimeline은 Thought/Search/Read 카드만 렌더
- **매몰 위험:** 가장 작은 예산(50k)인데도 12k 규칙 + Prefetch + Harness를 그대로 받음. 단순 파일 설명 요청에서도 attention이 희석되어 프로젝트 일반론 답변을 생성.

### 3.2 MODE-002 Agent — 기본 코딩 루프

- **목적:** gather → act → verify 전체 루프. P0 핵심.
- **진입:** `StickyModeStore` 기본값 `agent`, `classifyAutoMode` fallback conf 0.55, 또는 수동 선택
- **시스템 프롬프트:** "Read relevant files first, then edit/write/run..." + `VerificationFirstPrompt` + `CursorPattern` + `TurnStructure`
- **허용 툴 (AGENT_ALLOWED_TOOLS):** Ask 전체 + `edit/write/delete/run_terminal` + browser 8종 + `task/task_run` + `switch_mode` + `debug_*`. 최대 40개+
- **처리 흐름:**
  1. `mode:'agent'` → Host가 `budget 100k / maxTurns 50` 설정, `routeByHeuristics()`로 tier A/B 결정
  2. `PrefetchEngine.prefetch()`가 `@file`, 스택트레이스, `@symbol`, IDE 컨텍스트(실패 테스트/열린 파일/커서)를 최대 5파일×50k까지 수집해 유저 프롬프트 앞에 prepend
  3. `AgentLoopController` 생성 시 `verificationFirst:true, verificationMicroLoop:true` + `approvedPlanBlock`(Plan 승인 시) + `stickyContext`(inlineEdit 시) 주입
  4. 루프 내 `HARNESS-004` 마이크로루프: edit/write 성공마다 `read_lints` 자동 실행, 실패 시 `formatPostEditVerificationFailure` 주입 후 재시도
  5. `HARNESS-002` exit gate: 툴 없이 종료 선언 시 `evaluateVerifyExit()`가 unverified edit을 검사해 `verify_exit_nudge` 주입
- **매몰 위험:** 모든 harness 지능이 여기에 집중. 60k 프로젝트 컨텍스트 vs 2k 유저 의도. 병렬 12개 파일 읽기(툴 결과 12×32KB=384KB/턴)로 다음 턴 compaction이 유저 의도를 삭제.

### 3.3 MODE-003 Plan — 분석/계획 전용

- **목적:** 승인 전까지 구현 금지. research → planning → review → build(실행).
- **진입:** `plan|architect|roadmap|계획|설계` 키워드 conf 0.70, 또는 `PlanSchemaStickyState`가 `research|planning|review`일 때 강제 유지. `planStage` enum이 `ChatSendPayload`로 전달됨
- **시스템 프롬프트:** "Research read-only, ask clarifying questions, then produce plan document. Do NOT implement..."
- **허용 툴:** Ask와 동일(`PLAN_ALLOWED_TOOLS = ASK_ALLOWED_TOOLS`), `readOnly:true`. 이중 방어: `ToolRegistry.getSchemas(plan)` 필터 + Host `planWriteGate.ts`가 `planStage !== 'build'`일 때 `edit/write/delete/run_terminal/todo_write`를 deny
- **처리 흐름:**
  1. `mode:'plan'` + `planStage:'research'`로 AgentLoop 진입 (fallback) 또는 정석 Plan V2 경로(`PlanV2Generator` + `WorkspaceContext` + `EvidenceEngine` → `PlanDocument` 생성 → Timeline PlanCard 마운트)
  2. `budget 80k / maxTurns 40`, 읽기/검색 + `ask_question`만 가능
  3. 승인 후 `buildPlanToAgentHandoff()`가 `## Approved Implementation Plan`을 담은 Agent 프롬프트로 전환, 이후 모든 Agent 턴에 `approvedPlanBlock`을 sticky로 주입
- **매몰 위험:** 의도적으로 컨텍스트를 넓힘(WorkspaceContext + Evidence). 단순 수정 요청이 `plan`으로 오분류되면 2~3턴 동안 읽기만 하고 코드 변경 없음 → "분석만 하고 일 안 함" 체감.

### 3.4 MODE-004 Debug — 가설 기반 FSM

- **목적:** `hypothesis → instrument → reproduce → analyze → fix → cleanup` 과학적 방법론
- **진입:** `debug|bug|crash|stack trace|repro|디버그|버그|재현|가설` 키워드 conf 0.75
- **시스템 프롬프트:** "hypothesis → instrument → reproduce → analyze → fix → cleanup. Do not jump to fix before confirmation" + 스테이지별 프롬프트(`DebugModeController.DEBUG_STAGE_PROMPTS`)
- **허용 툴 (DEBUG_ALLOWED_TOOLS):** Ask + `run_terminal/delete` + browser + `task*` + `debug_add/remove/collect` — 단 **스테이지 게이트**로 제한:
  - `hypothesis`: 읽기만
  - `instrument`: `debug_add_instrumentation`만
  - `reproduce`: 읽기 + add
  - `analyze`: 읽기 + `debug_collect_logs` + terminal
  - `fix`: 읽기 + edit/write/terminal/remove
  - `cleanup`: `remove_instrumentation` + terminal
- **처리 흐름:**
  1. `DebugModeController`가 초기 `hypothesis` 스테이지로 생성
  2. 모델이 2~3개 가설 제안 → `selectHypothesis()` → Instrumentation 마커(`DEBUG_INSTRUMENT`) 주입 → 재현 단계 대기 → 로그 분석 → fix
  3. `cleanup`에서 마커 잔존 여부 검증(`countInstrumentationMarkers==0`)
  4. Timeline은 `DebugTimeline.tsx`로 별도 렌더
- **매몰 위험:** 비-버그 작업이 debug로 오분류되면 단순 오타 수정에도 가설 수립/계측 강요. 반대로 실제 버그도 harness 컨텍스트로 최소 수정이 프로젝트 전체 리팩토링으로 희석.

### 3.5 MODE-005~009 라우팅 & 상태

| ID | 메커니즘 | 파일 | 동작 |
|---|---|---|---|
| 005 Auto | `classifyAutoMode(prompt)` 정규식, LLM 라우터는 스텁 | `ModeRegistry.ts:169` | `debug 0.75` > `plan 0.70` > `ask 0.65` > `agent 0.55` 기본값. v2.1의 `그만|중지|stop|cancel` 명시적 전환 감지가 v3에서 제거됨 |
| 006 Sticky | `StickyModeStore` (`agent` 기본) | `:194` | 이전 턴 모드가 유지됨. plan 세션이 다음 무관한 질문까지 누수 |
| 007 Plan V2 Sticky | `PlanSchemaStickyState` (`idle/research/planning/review/approved/building`) | `:216` | `research/planning/review` 동안 Auto 분류를 무시하고 `plan` 강제 |
| 008 Manual Override | `ManualModeOverride` | `:241` | 우선순위 `manual > planSticky > sticky > auto`. 단 Host(`chatSend.ts:196`)는 현재 `payload.mode`를 직접 읽어 resolver 체인을 우회하는 간극 있음 |
| 009 Handoff | `buildPlanToAgentHandoff()` | host | 승인된 `ExecutionPlan`을 매 턴 주입되는 `approvedPlanBlock`으로 변환, 특수 `AgentLoopController` 생성 |

---

## 4. Expanded Problem Catalog — Why "Buried in Project Context"

> **Coverage:** 4 categories × 24 problems. Each row cites exact file:line, impact (H/M/L), and 1-line reproduction scenario. No speculation — all verified in `v3.0` source.

### 4.A Context Overload & Dilution (Context & Prompt)

| ID | Problem | Symptom | Root Cause (file:line) | Impact | Repro Scenario |
|---|---|---|---|---|---|
| **A-01** | **Protected PROJECT RULES 12k every turn (compact-immune)** | Ask: "explain this 3-line function" → answer cites generic project rules instead of function; 80% of system prompt is scaffolding | `ContextAssembler.ts:85-90` `formatProjectRulesBlock(resolveProjectRulesContent({workspaceRoot, maxChars:12000}))` + `ProjectRulesLoader.ts:229` `getProjectRulesCached(...,12000)` merged into `system` with `protected:true` (`:114`, re-injected every turn `:250-251`). Compaction never touches system slot (`CompactionEngine.ts:106` `protected_ = role==='system'`) | **H** | Ask 5-line file summary → LLM repeats `AGENTS.md` style guide instead of file content |
| **A-02** | **Prefetch always-on, budget-blind** | Short "fix typo" prompt triggers 50k file reads + `task_context 0.95` IDE bag, pushing prompt past budget before model even runs | `PrefetchEngine.ts:44` `if(!enabled) return ''` else always run; `config: maxFiles:5, maxChars:50000, ideContextEnabled:true` (`:33-39`); `chatSend.ts:1430-1435` `new PrefetchEngine({enabled:true, ideContextEnabled:true})` unconditionally wrapped into `<prefetch>` and `prependPrefetchToUserPrompt` (`HarnessBridge.ts:10-17`) with zero budget check | **H** | User: "change one line in foo.ts" → prefetch loads 5 files + git diff + diagnostics (≈45k chars) → compaction drops user line |
| **A-03** | **Harness prompts injected even for Ask/Plan** | Ask answers contain verbose "gather→act→verify" procedural text; 1.2k fixed overhead on 50k budget (2.4% but high attention weight) | `ContextAssembler.ts:76-82` `if(verificationFirst!==false) injectVerificationFirst` + `if(harnessEnabled!==false) injectCursorPattern+injectTurnStructure`; `VerificationFirstPrompt.ts:6-27` (~800 chars), `CursorPattern.ts:4-13` (~600), `PromptTurnStructure.ts:4-11` (~400). Host default `harnessEnabled !== false` (`chatSend.ts:245`, `HarnessConfig.ts:32` defaults `enabled:true`). v2.1 `ContextAssembler.ts` gated these to `agent/debug TierA` only | **H** | Ask: "what does X do?" → model replies with "I will search then verify..." ritual |
| **A-04** | **Compaction thrash drops user intent** | After one parallel read round (12 files × 32KB = 384KB tool results), next `assemble()` immediately triggers `full` compaction that summarizes away early user clarifications | `CompactionEngine.ts:23` `MAX_TOOL_RESULT_CHARS=32k`, `AgentLoopController.ts:539-540` `ParallelExecutor(8)` can exceed but `searchBeforeRead` says up to 12 reads per turn; `budget.ts:36-46` `estimateMessagesTokens` counts all tool results; `CompactionEngine.ts:190-210` `levelFull` keeps only `system + users[0] + summary + recent.slice(-12)` — drops turns 2..N-6 | **H** | Agent reads 10 files, user clarifies "only file A" in turn 1 → turn 3 compaction → clarification lost → edits wrong file |
| **A-05** | **Silent system truncation at 15% cap** | When rules + harness + sticky exceed `0.15*budget` (~60k chars at 100k budget), rules are hard-sliced mid-sentence with only `...(system truncated)` marker, no telemetry | `ContextAssembler.ts:107-112` `systemCap = floor(budget.maxTokens*0.15)*4` → `system.slice(0,cap)+'… truncated'`; no log/metric; `truncated:true` flag exists but `AgentLoopController.ts` never emits it to host/timeline | **M** | Large `.agentk/rules/*.md` (20k) + harness → truncated rules → model misses critical deny pattern |
| **A-06** | **Prefetch symbol/stack noise** | `@symbol` mentions build empty `Symbol: X` (relevance 0.6) blocks with no file context; every stack frame loads ±5 lines even when user pasted partial trace | `PrefetchEngine.ts:112-122` symbol loop pushes `content:'Symbol: ${symbol}'` with no lookup; `86-109` stack loop slices raw file ±5 lines without checking if frame belongs to workspace; `ContextBlockBuilder.ts:28-50` sorts by relevance so weak symbol entries still consume `maxBlockTokens 4000` | **M** | Prompt mentions `@mySymbol` → prefetch adds 3 symbol placeholders → wastes 600 tokens that could be user intent |
| **A-07** | **WorkspaceContext unconditional sticky** | Empty workspace (no roots/openFiles) still passes `## Workspace` block check? Actually returns '' when empty, but when 1 root set it always injects roots list (low value) taking system budget | `WorkspaceContext.ts:54-69` `toPromptBlock()` joins roots/openFiles; `ContextAssembler.ts:83` `workspaceBlock = input.workspace?.toPromptBlock() ?? ''` always appended to system. No relevance gate | **L** | New empty workspace → system still contains `Roots: myproj: /path` noise |
| **A-08** | **No mode-tiered prefetch cap** | `ContextBlockBuilder.maxBlockTokens=4000` (~3% of 128k) is global, but `taskContextStrategy.ts:41-71` `maxTokens` per task type (25k-60k) is ignored by PrefetchEngine — `formatSelectedContext` can return 12k chunk that then gets wrapped again | `ContextBlockBuilder.ts:16` `maxBlockTokens=4000` independent of `CONTEXT_STRATEGIES.*.maxTokens`; `PrefetchEngine.ts:133-144` `formatSelectedContext(selected, taskType)` can exceed builder cap → double truncation | **M** | Bug-fix task → strategy allows 40k but builder truncates to 4k → required `failing_test` may be cut |

### 4.B Routing & Sticky State (Routing & Sticky)

| ID | Problem | Symptom | Root Cause (file:line) | Impact | Repro Scenario |
|---|---|---|---|---|---|
| **B-01** | **Regex-only auto classifier misses explicit switch & overlaps** | "grasp plan" (typo) triggers Plan mode; Korean `버그` inside `계획` sentence mis-triggers debug; no LLM router | `ModeRegistry.ts:178-190` `classifyAutoMode()` three regexes (`debug 0.75`, `plan 0.70`, `ask 0.65`) with `!/(fix|implement)/` negative lookahead only for Ask; no `EXPLICIT_SWITCH` list. v2.1 `src/mode/modeClassifier.ts:8-13` had `EXPLICIT_SWITCH_PATTERNS = /그만|중지|stop|cancel|계획만|질문만|direct/` + confidence 0.93 sticky guard | **H** | User types "stop planning, just fix line" → still classified as `plan` because "plan" keyword wins |
| **B-02** | **StickyModeStore leaks across unrelated turns** | User does `plan` task, next turn "hello" stays in `plan` → reads only, no edits; Plan write gate blocks fix | `ModeRegistry.ts:194-205` `StickyModeStore` defaults `agent`, `set()` on every turn but never auto-clears; `resolve()` (`:258-266`) returns `sticky.get() \|\| classifyAutoMode(prompt).mode` — so sticky wins over auto unless planSticky. No TTL / no explicitSwitch reset. Host never calls `stickyStore.set()` decay | **H** | Turn1: plan, Turn2: "fix typo" → still plan → `planWriteGate` denies `edit_file` → "blocked until build" |
| **B-03** | **PlanSchemaStickyState forces plan without user exit** | Once `research/planning/review`, every "just fix one line" stays plan for 3+ turns; user must say magic word but v3 removed that word list | `ModeRegistry.ts:227-233` `shouldForcePlanMode()` → true for research/planning/review; `ManualModeOverride.resolve()` checks it **before** sticky/auto; v2.1 equivalent checked `!explicitSwitch(msg)` first (`modeClassifier.ts:22`). v3 omits explicitSwitch entirely | **H** | Plan session in `review` → user: "cancel plan, fix bug" → still plan because sticky outranks auto |
| **B-04** | **Host bypasses ManualModeOverride.resolve** | Webview `payload.mode` is taken verbatim (`agent` default) without running `ManualModeOverride`/`Sticky`/`Auto` chain; ModeSelector `Auto` value never resolved to concrete mode in host | `chatSend.ts:194` `const mode = (payload.mode || 'agent') as AgentMode` — no call to `modeRegistry` sticky logic; `ModeRegistry.ts:241-266` resolver exists but unused in host. chat-ui sends `mode:'auto'`? Actually `shared/protocol` expects `AgentMode` but UI `ModeSelector` includes `auto` — host coercion drops it to agent | **H** | Composer set to `Auto`, user asks debug question → host still `agent` → debug tools not stage-gated |
| **B-05** | **Debug stage not wired through host** | `debug` mode always gets `DEBUG_ALLOWED_TOOLS` full set regardless of hypothesis/instrument/fix stage → can edit during hypothesis (should be blocked) | `shared/protocol/chat-send.ts:45` `debugStage?: string` exists but `chatSend.ts:196` `planStage` extracted only; `modeRegistry.getModeConfig('debug')` returns static config (`ModeRegistry.ts:156-167`) without `getSchemas` stage filter; `ToolRegistry.getSchemas` second arg (`chatSend.ts:291-295`) gets `{planStage, modelTier, harnessEnabled}` but no `debugStage` → `isDebugToolAllowedForStage` (`DebugModeController.ts:117-127`) never called | **M** | Debug mode, Turn1 model calls `edit_file` before hypothesis → succeeds but should be denied |
| **B-06** | **Routing tier ignores mode & history** | Short prompt "fix" + long history (60k) still routed to cheap tier B (lower maxTurns) → maxTurns cut mid-task | `chatSend.ts:249-257` `routeByHeuristics({userMessage: lastUserContent, currentTier: inferTierFromModelId(model), mode})` — only last user text length/complexity, no `payload.messages.length` or `modeConfig.contextBudget`; `ModelTiers.ts` tier policies map to maxTurns but not re-evaluated per turn | **M** | 80k history + "fix one more" → routed B (maxTurns 35) → hits max_turns before verify |
| **B-07** | **No confidence threshold nor explainability** | `classifyAutoMode` returns `confidence` but caller ignores it; weak 0.55 `agent` fallback wins over explicit user intent word appearing later | `ModeRegistry.ts:170-191` returns `{mode, confidence, reason}` but `ManualModeOverride.resolve()` (`:258-266`) discards confidence and reason; no `hostLog` or timeline `mode.decision` event → user cannot see why plan was chosen | **L** | User: "what is X and fix Y" → classified `ask 0.65` (ask wins) but host logs nothing → debug hard |

### 4.C Execution Loop & Verification (Execution & Verification)

| ID | Problem | Symptom | Root Cause (file:line) | Impact | Repro Scenario |
|---|---|---|---|---|---|
| **C-01** | **Wide tool surface encourages scattershot reads** | Agent does `grep` → 12 parallel `read_file` (32KB each) before any edit; wastes turns and budget | `ModeRegistry.ts:41-69` `AGENT_ALLOWED_TOOLS` 40+ includes `codebase_search+grep+glob+file_search+read_*+browser*+task*`; `AgentLoopController.ts:532-533` `canParallel = every(isParallelSafeTool)` for reads → parallel 8 (`ParallelExecutor.ts:8` limit 8 but ConfigurableSearch can batch 12 per prompt rule `CursorPattern.ts:10` "up to 12"); no per-turn read cap | **H** | "fix function foo" → reads 12 unrelated files → next turn summary lost → edits wrong file |
| **C-02** | **Post-edit lint micro-loop pollution** | After `edit_file`, tool_result body becomes `json + "\n\n<system>Verification micro-loop failed…" + <lint_errors>` — model thinks user sent lint command | `AgentLoopController.ts:481-509` `dep.executeTool({name:'read_lints', args:{paths:[editedPath]}})` result parsed and `body = body + "\n\n" + formatPostEditVerificationFailure(...)` appended to same tool result; `VerifyExitCheck` nudge similarly injected as `role:user` (`:319-323`) — both look like user follow-up | **H** | Edit leaves 1 lint error → next model turn tries to "answer lint" instead of fixing → loop |
| **C-03** | **Exit gate synthesize-user blocks completion** | Agent fixes then says "Done" with no tool call → `evaluateVerifyExit` blocks and injects `[Verify before finish] … run read_lints` synthetic user → extra turn even when lints clean | `AgentLoopController.ts:304-326` `if(toolCalls.length===0) { exitCheck=evaluateVerifyExit(...); if(block) push assistant+ user nudge + continue }`; `VerifyExitCheck.ts:48-71` `pendingPaths` check blocks if any edited path not yet `markPathVerified`; `markPathVerified` only set after `read_lints` success (`AgentLoopController.ts:504`) — if model edits 3 files but lints only 1, pending=2 → block | **M** | Agent edits 2 files, lints first file clean, declares done → blocked because second file not linted → user waits extra turn |
| **C-04** | **Search-before-read nudge as system message** | Blind read → next turn system says "Harness note: you opened files without a prior locate tool…" — dilutes attention and appears in compaction-protected system slot | `AgentLoopController.ts:584-590` `if(blindBatch && ok) messages.push({role:'system', content:SEARCH_BEFORE_READ_NUDGE})`; `searchBeforeRead.ts:91-92` nudge string ~30 tokens; system role already heavy (A-01) → now also has transient hint incorrectly protected | **M** | Single `read_file` with explicit path mentioned by user but `userMessageHintsPath` fails (basename mismatch) → false nudge |
| **C-05** | **Doom loop false negatives** | Agent repeats `read_file` same path but slightly different args (extra `lines` param) → not detected, loops 10+ times | `DoomLoopDetector.ts:46-54` `history slice -threshold` exact match on `toolName+argsHash+outcomeSig`; `hashArgs` only truncates strings >100 chars (`:94-95`) but does not normalize missing keys; near-identical reads with/without `offset` → different hash → not caught | **M** | Tool sequence: `read_file {path:a}` → `read_file {path:a, startLine:1}` → repeats → detector misses loop |
| **C-06** | **Subagent fragmentation 280-char summary** | Subagent explores 8 files, finds root cause, parent receives `summary.slice(0,280).replace(/\s+/g,' ').trim()` (`chatSend.ts:758-762` after `snapshotSubagentResultStats`) → parent decides on truncated hint → unfocused edit | `chatSend.ts:750-763` `parentResultFromTask` summary sliced to 280; `subagentHost.ts` parent text fallback also `summary || result || error` ; `AgentLoopController.ts` not aware — host-level truncation invisible to compaction | **H** | Subagent: "root cause is race in Foo.ts line 42 due to missing await" (120 chars ok) — but longer debug trace 500 chars → truncated → parent misses "line 42" |
| **C-07** | **No per-turn tool-result budget cap** | One turn 384KB results → `isOverBudget(usedTokens, budget)` true next turn → `levelFull` immediately → full history loss at turn 2 | `budget.ts:50-51` `isOverBudget = used >= max*0.9`; `CompactionEngine.ts:190-210` `levelFull` keeps only 12 recent messages; no `MAX_TOOL_RESULT_CHARS` global cap per turn, only per-message 32k (`:23`) | **M** | ParallelExecutor 8 × 32k = 256k chars → overBudget instantly → compaction thrash loop |

### 4.D UX & Observability (UX & Observability)

| ID | Problem | Symptom | Root Cause (file:line) | Impact | Repro Scenario |
|---|---|---|---|---|---|
| **D-01** | **Prior serialization drops turnProse (STREAM-004)** | Same-tab follow-up: UI shows prior answer but model repeats exploration because `payload.messages` had `content:''` | `chatSend.ts:1414-1421` `prior = payload.messages.slice(0,-1).map(m=>({role, content:String(m.content||'')}))` — `chat-ui` sealed prose is in `turnProse` / `liveProse` not `content` (`Work Order Session WIP: STREAM-004`); after `sealBodyBeforeTools`, assistant `content:'' + turnProse` split; `hostLog` confirms `msgs=N` but `contentLen` mismatch | **H** | Turn1 tool-heavy → Turn2 "change that one line again" → model says "I need to search again" (lost context) |
| **D-02** | **No over-context telemetry** | Team cannot prove "buried" — no metric for `system/total >0.7` or `prefetch/total` | `ContextAssembler.ts:122` `usedTokens=estimateMessagesTokens(parts)` but no `hostLog`/`telemetry` when `systemTokens/total>0.7`; `budget.ts:36-46` estimate exists but not logged; `TEL-001~003` stubs (`Work Order Phase 8`) | **H** | Support ticket "model poor work" → no evidence → cannot prioritize fix |
| **D-03** | **No visible mode decision** | User sees "Plan mode" chip but no reason why; cannot learn to phrase to get Agent | Auto `classifyAutoMode` reason discarded (B-07); `chatSend.ts` `mode` not posted as `timeline` event; `chat-ui` `ModeSelector` shows selected mode but not decision provenance | **M** | User confused why debug question → plan card appeared |
| **D-04** | **Cost/compaction not surfaced until loss** | User sees "Summarizing chat context..." flash after compaction already dropped intent; no pre-warning | `AgentLoopController.ts:258-265` `assembled.compacted` emits `compaction` event only after comp; UI `Summarizing...` chip appears post-hoc; `ContextAssembler.ts:133` returns `compacted:true` but host does not surface `usedTokens/budget` gauge | **M** | Long conversation → summary banner appears → user didn't know they'd lose early instruction |
| **D-05** | **Ask mode worst signal ratio** | Ask 50k budget bears 12k rules (≈24% before intent) — highest dilution of all modes yet used for simple Q&A | `ModeRegistry.ts:117-127` Ask `contextBudget:50_000, maxTurns:35` smallest; but `ContextAssembler.ts` injects same 12k rules+1.2k harness → 26% overhead vs Agent's 13% (12k/100k) | **M** | Ask: "where is X?" → answer is generic project overview, misses file |
| **D-06** | **Subagent UI detail unavailable until spawn** | Parent tool `task` returns only after subagent completes; intermediate reasoning (`onReasoning`) is streamed to child session but not visible in parent timeline until `subagent.event` summary arrives | `chatSend.ts:354-389` `onReasoning` posts to `postChildStream` child session `sess-sub-*`; parent only gets `subagent.event` via `postStream` (`:782-800`) with `summary.slice(0,280)` — no live parent thought streaming for subagent progress | **L** | User waits 60s for subagent → parent shows "Waiting..." only, no hint of progress |

**Aggregate effect:** 70-80% of prompt is scaffolding/harness/prefetch; measurable intent signal ~10-15%. Model's safest completion is generic (read more, propose full refactor, write long plan) rather than precise single-line edit.

---

## 5. Concrete Fix Proposals — Code-Level, Measurable, Testable

> Monorepo rule: one session = one package. `shared` first when protocol changes. All fixes are minimal, additive, and guarded by config flags for safe rollback. Feature ID reuses existing where possible; new IDs proposed where gap.

| Fix ID | Targets | Code-Level Change (file:function/const → what to change) | Package | Expected Effect (token / accuracy) | Verification | Priority / Effort | Feature ID |
|---|---|---|---|---|---|---|---|
| **F-C01** | A-02 | **Prefetch mode-gated + budget-aware.** In `PrefetchEngine.ts:32` ctor default → `enabled: false` for `ask`, `ideContextEnabled: false` when `userMessage.length < 80`. In `ContextAssembler.ts:84-90` or `chatSend.ts:1428-1439` add `if (mode==='ask' \|\| mode==='plan' && !userMentionsFile) prefetchRaw=''`; add hard cap `if (estimateTokens(prefetchRaw) > budget.maxTokens*0.2) truncate to 20%`. Add `PrefetchConfig.maxCharsPerMode: {ask:0, plan:8000, agent:20000, debug:20000}` | `core` (PrefetchEngine, ContextAssembler) + `host` guard | **Tokens saved:** 25-50k per short Ask/Plan turn (−50% prefetch). Ask accuracy +30% (less dilution) | Unit: `PrefetchEngine.test` param sweep `mode='ask'→''`; E2E: Ask "explain file" → log `prefetchLen` metric 0 vs before 45k; snapshot `assemble()` system ratio | **P0 / S** (½ day) | CTX-011, HARNESS-003 |
| **F-C02** | A-01 | **ProjectRulesLoader gated & demand-driven.** Change `ProjectRulesLoader.ts:229` `getProjectRulesCached(root, 12_000)` default to `maxChars=2_000` for `ask/agent` unless `requestNeedsRules`. In `ContextAssembler.ts:85-90` degrade `formatProjectRulesBlock` to L0 snippet + on-demand: if `system.length>cap` load only `AGENTS.md` header (500 chars) + lazily fetch rules via `read_file` tool when model hits deny/unknown rule. Keep full 12k for `plan` only. Cache `getProjectRulesCached(root, 2_000)` separate key | `core` (ProjectRulesLoader, ContextAssembler) | **Tokens saved:** 10k per turn (12k→2k). System slot 15%→4% on Ask/Agent. Ask latency −15% | Unit: `ProjectRulesLoader.test` `loadProjectRulesFromFs` with `maxChars 2000` truncation; E2E: Ask turn systemLen log; ensure `file_search` still works when full rules skipped | **P0 / M** (1 day) | HARNESS-005, CTX-003 |
| **F-C03** | A-03 | **Harness conditional by mode.** Patch `ContextAssembler.ts:76-82` to: `if (mode==='agent' \|\| mode==='debug') injectVerificationFirst+Cursor+TurnStructure` else for `ask/plan` inject only `Ask read-only tool policy` (from v2.1 ContextAssembler.ts TierA branch). In `host/chatSend.ts:245-246` `harnessVerifyFirst = harnessEnabled && mode!=='ask' && mode!=='plan'`. Keep `CURATION: verificationFirst default false` for Ask | `core` + `host` | **Tokens saved:** 0.8-1.2k/turn on Ask/Plan. Removes ritual text, Ask brevity +40% | Unit: `ContextAssembler.test` `assemble({mode:'ask'})` → assert no "Verification-First Protocol" substring; E2E: Ask prompt contains only read-only policy | **P1 / S** (½ day) | HARNESS-007, HARNESS-002 |
| **F-C04** | A-04, C-07 | **Per-turn tool-result global cap + windowed compaction.** In `AgentLoopController.ts:384-520` after `executeToolCalls`, sum `toolResults.length` and if `> budget.maxTokens*0.3` slice oldest. In `CompactionEngine.ts:23` add `MAX_TOTAL_TOOL_CHARS_PER_TURN=64_000` and `budget.ts:48` `isOverBudget` check per turn triggers `levelDrop` before next assemble (not `levelFull`). Change `protectionTurns` default 6→3 for Ask, keep 6 for Agent | `core` (CompactionEngine, AgentLoopController, budget) | **Prevents thrash:** p95 tool-result size −60% (384k→64k). Next-turn `full` compaction rate −70% | Unit: `CompactionEngine.test` `compact(levelDrop)` with 10×32k tool msgs → assert kept; E2E: 12-file read → next turn `usedTokens` < threshold | **P0 / M** (1 day) | CTX-004, AGENT-006 |
| **F-C05** | A-05 | **System cap telemetry + soft fail.** In `ContextAssembler.ts:107-112` after truncation emit `hostLog('context.cap', `system truncated ${origLen}→${systemCap} mode=${mode}`)` or call optional `onTelemetry({systemTokens,totalTokens,ratio})`. Also change cap from `0.15*budget` to mode-specific: Ask 10%, Agent 15%, Plan 20% (Plan needs rules). Never silent | `core` + `shared` (telemetry type) + `host` log | **Observability:** detect burial; zero regressions | Unit: `ContextAssembler.test` triggers truncation → expect log spy called; E2E: log line appears when rules >8k | **P1 / S** (¼ day) | CTX-001, TEL-003 |
| **F-C06** | B-01,B-02,B-03 | **Restore explicitSwitch + sticky TTL.** Port `EXPLICIT_SWITCH_PATTERNS` from `v2.1-PRODUCTION-MODE:src/mode/modeClassifier.ts:8-13` into `ModeRegistry.ts:169` → add `const EXPLICIT_SWITCH_RE = /그만\|중지\|stop\|cancel\|계획만\|질문만\|디버깅만\|직접 해줘\|수정해줘\|실행해/i` and helper `explicitSwitch(t)`. Update `classifyAutoMode(t, {sticky, planSticky})` to return `sticky` only if `!explicitSwitch(t)`. Update `PlanSchemaStickyState.shouldForcePlanMode(prompt)` to accept prompt arg and return false when explicitSwitch. Add `StickyModeStore` TTL: `lastSetAt` + `maxAgeTurns=3` (expire to agent) | `core` (ModeRegistry) | **Accuracy:** mis-routed "plan → fix single line" cases −60%. Restores v2.1 behavior verified by users | Unit: `mode.test.ts` add `classifyAutoMode('stop planning fix foo') → agent`; `StickyModeStore` expiry test; E2E: 2-turn scenario plan→fix | **P0 / S** (½ day) | MODE-005, MODE-006, MODE-007 |
| **F-C07** | B-04 | **Host actually calls ManualModeOverride.resolve().** In `chatSend.ts:194` replace direct `payload.mode` with: `const resolver = new ManualModeOverride(); resolver.set(payload.mode==='auto'?null:payload.mode); const mode = resolver.resolve(lastUserText, stickyStore, planStickyState)`; inject `StickyModeStore` + `PlanSchemaStickyState` singletons from host state (persist per session). Add `shared/protocol/chat-send.ts:40` allow `mode:'auto'` in `ChatSendPayload` union. | `shared` first (protocol), then `host`, then `core` | **Fixes Auto routing entirely.** Auto debug/plan detection now works; eliminates host/core drift | Unit: `host/chatSend.test` mock payload `mode:auto` → resolves to debug when prompt contains bug; E2E: Composer Auto + "why crash?" → Debug mode trace | **P0 / M** (1 day) | MODE-008, HOST-002 |
| **F-C08** | B-05 | **Wire debugStage through host+registry.** In `chatSend.ts:196` extract `debugStage = payload.debugStage || 'hypothesis'`; pass to `ToolRegistry.getSchemas('debug', {debugStage})` (`chatSend.ts:290-296` add field to schemaOpts). In `ToolRegistry` (tools) add `debugStage` filter using `isDebugToolAllowedForStage` (`DebugModeController.ts:117-127`). Also log denial | `shared` (type), `tools` (registry), `host`, `core` | **Security:** hypothesis no longer writes files. Compliance with DEBUG-001 gate | Unit: `DebugModeController.test` `isDebugToolAllowedForStage('hypothesis','edit_file')===false`; Integration: debug turn1 tool call edit → denied log | **P1 / M** (1 day) | MODE-004, DEBUG-001 |
| **F-C09** | C-01, C-04 | **Bounded parallel reads + nudge polish.** Cap `ContextAssembler/CursorPattern` guideline "Batch reads up to 12" → enforce in `AgentLoopController.ts:532-540` `canParallel` hard cap 6 for reads (warn if >6). Move `SEARCH_BEFORE_READ_NUDGE` from `role:system` to transient `role:user` with `metadata:{type:'harness_hint'}` and `protected:false` so compaction drops it next turn. Tighten `searchBeforeRead.ts:67-78` `userMessageHintsPath` to also match `path.includes(textToken)` reverse | `core` (AgentLoopController, searchBeforeRead) | **Fewer scatter reads** (−50% file opens). Nudge no longer pollutes protected slot | Unit: `searchBeforeRead.test` basename vs full-path hint; AgentLoop parallel cap test | **P1 / S** (½ day) | HARNESS-007, AGENT-017 |
| **F-C10** | C-02, C-03 | **Distinguish harness signal from user content.** Change `AgentLoopController.ts:496-498` `formatPostEditVerificationFailure` prefix from `<system>…` to `[harness:verify …]` with `metadata:{type:'harness_verify'}` and deliver as `role:tool` follow-up not appended to tool_result body. Similarly `evaluateVerifyExit` nudge (`:319-323`) push as `role:system` with `protected:false` and label `harness:exit_gate` for filtering. Add `WorkspaceContext.toPromptBlock()` harness label whitelist to prevent model echo | `core` (PostEditVerification, VerifyExitCheck, AgentLoopController) | **Hallucination down:** model no longer confuses lint output for user request; fix rate +20% | Unit: `verificationHarness.test.ts` asserts nudge role != user; E2E: edit with lint error → next model turn fixes rather than asks user | **P1 / M** (1 day) | HARNESS-002, HARNESS-004 |
| **F-C11** | C-06 | **Parent subagent context carry-over fix.** In `chatSend.ts:750-763` keep full subagent conclusion (50k) but inject into parent as synthetic tool result with `name:task_run` and `metadata:{subagentId, wasTruncated:false}`. Also raise slice 280→800 chars for `subagent.event` summary and include `extractedFilePaths` field for parent file awareness. Keep `onReasoning` streaming to parent optional via config `agent-k.harness.subagentStreamToParent=false` default | `host` (subagentHost, chatSend) | **Parent adopts correct file** 60% more. Reduced unfocused edits | Unit: `subagentHost.test` summary slice 800; E2E: subagent finds race → parent edits correct line | **P1 / S** (½ day) | SUB-005, SUB-010 |
| **F-C12** | D-01 | **Fix STREAM-004 prior serialization.** Implement `content \|\| turnProse` join as WIP: In `chatSend.ts:1414-1421` map `payload.messages` where `m.content` fallback to `(m as any).turnProse \|\| (m as any).liveProse`; better, have `chat-ui` `useChatSendFlow` serialize prior as `content + "\n\n" + turnProse` and include `attachments`. Log `hostLog('chatSend prior', `msgs=${prior.length} chars=${estimateTokens(JSON.stringify(prior))}`)`. Add test `chatSendEmpty.test` for empty content + prose | `chat-ui` + `host` (`chatSend.ts`) + `shared` (type extended with turnProse?) | **Same-tab follow-up restores context** 95% recall vs 40% before | Unit: `host/replyToWebviewMessage.test.ts` prior with prose; E2E: tool-heavy turn → follow-up "fix again" → model references prior file | **P0 / M** (1-2 days) includes `chat-ui` hook | STREAM-004, HOST-002 |
| **F-C13** | D-02, D-04 | **Over-context gauge & compaction pre-warning.** Add `estimateMessagesTokens` split: returns `{total, system, history}` in `ContextAssembler.ts:114` `usedTokens` becomes object; host logs `hostLog('context.gauge', `system/total=${(system/total).toFixed(2)} prefetch=${prefetchTokens} compactionAhead=${isOverBudget(...)}` )` when ratio>0.6. UI: `chat-ui` receives `timeline` event `kind:'contextGauge'` pre-emptively, shows amber badge "Context heavy — rules 40%". Config `agent-k.context.warnRatio=0.65` | `core` (budget, ContextAssembler) + `host` + `chat-ui` + `shared` (protocol) | **Visibility:** early warning before loss; PM can triage | Unit: `budget.test` split estimate; E2E: large rules → gauge badge appears | **P1 / M** (1 day) | TEL-001, REL-002, CTX-001 |
| **F-C14** | D-05 | **Ask isolation & budget uplift.** Two options (pick one): (a) raise Ask `contextBudget 50k→80k` (`ModeRegistry.ts:125`) and `maxTurns 35→40`; or (b) keep 50k but on Ask clear `priorMessages.slice(-6)` only (last 6 turns) + zero prefetch (F-C01) — net gain 30k for intent. Recommend (a) as minimal diff, measure A/B | `core` (ModeRegistry) | **Ask signal ratio 26%→15%** overhead, Ask usefulness +30% | Unit: `mode.test` budget check; E2E: same Ask prompt token gauge before/after | **P2 / S** (¼ day) | MODE-001, CTX-001 |
| **F-C15** | D-03, A-06 | **Mode decision explainability + prefetch tag.** Add host `postStream({event:'mode.decision', mode, confidence, reason})` from `classifyAutoMode` result (`ModeRegistry.ts`). UI renders tooltip on mode pill: "Auto→Agent (0.55 fallback)". Also tag prefetch block with source relevance e.g. `<prefetch relevance=0.95 type=task_context>` for UI collapsible | `host` + `chat-ui` + `core` | **Learnability:** users self-correct prompts; support faster | Unit: `mode.test` reason string non-empty; E2E: timeline shows decision | **P2 / S** (½ day) | MODE-005, TEL-003 |

> **Note on new IDs:** `MODE-DECISION-EVENT`, `CONTEXT-GAUGE` are new TEL-lite events; propose `TEL-004 Context Gauge` and `MODE-010 Decision Explainability` as follow-up Feature IDs if team wants formal IDs. Minimal alternative is to log only without new UI (P0 fallback).

---

## 6. Phased Roadmap — Smallest Change, Safe Order, Dependencies

### Phase 1 — Immediate (1–2 days) — P0 stop-the-bleed, flag-guarded

| Order | Fix | Dependency | Owner Package | Flag / Rollback |
|---|---|---|---|---|
| 1 | **F-C06** explicitSwitch + sticky TTL (MODE-005/006/007) | none | `core` | Config `agent-k.mode.explicitSwitch=true`; revert regex if recall drops |
| 2 | **F-C07** Host calls `ManualModeOverride.resolve` (incl. `auto` protocol) | F-C06 (needs EXPLICIT_SWITCH_RE) | `shared` → `host` → `core` | `agent-k.harness.modeResolve=true`; fallback to direct mode if cherry-pick fails |
| 3 | **F-C01** Prefetch gate by mode + 20% cap | none | `core` (PrefetchEngine) + `host` | `agent-k.harness.prefetchEnabled` already exists — add `prefetchModeGate` bool |
| 4 | **F-C02** Rules 12k→2k for Ask/Agent | none | `core` | `agent-k.harness.rulesBudget=2000` ; set back to 12000 to rollback |
| 5 | **F-C12** STREAM-004 prior `content\|\|turnProse` join | none (isolated) | `host` + `chat-ui` | UI sends both fields; host fallback keeps old path if missing — no flag needed |

> **Exit criteria Phase 1:** Ask dilution ratio (`system/total`) drops 26%→10% on test corpus; Auto mis-route cases (plan/debug overlap) repro script passes; same-tab follow-up manual test retains file reference; no `[x]` stable surface broken (MessageSteps, seal still intact).

### Phase 2 — Short-term (1 week) — P1 harness precision

| Order | Fix | Dependency | Owner Package | Note |
|---|---|---|---|---|
| 6 | **F-C03** Harness conditional (Ask/Plan strip verify) | F-C05 telemetry (optional) | `core` + `host` | Depends on `shared`? no. v2.1 TierA parity restore — measure Ask brevity |
| 7 | **F-C08** Debug stage wiring | `shared` type `debugStage` formal | `shared` → `tools` → `host` → `core` | Stage filter needs registry change — must land after shared |
| 8 | **F-C09** Bounded reads + nudge polish | none | `core` | Cap is additive — no dependency |
| 9 | **F-C10** Verify signal disambiguation | F-C08 (related signal hygiene) | `core` | Change nudge roles — verify regressions in `verificationHarness.test` |
| 10 | **F-C04** Per-turn cap + compaction tuning | none | `core` | Needs budget test expansion |
| 11 | **F-C13** Context gauge pre-warning | F-C05 + F-C01/02 | `core` + `host` + `chat-ui` | Telemetry first, UI badge after |

### Phase 3 — Mid-term (2 weeks+) — P2 polish, isolation, upsell

| Order | Fix | Dependency | Owner Package |
|---|---|---|---|
| 12 | **F-C05** System cap exact mode ratios + log | F-C13 (shares logging pipe) | `core` + `shared` |
| 13 | **F-C11** Subagent summary 280→800 + filePaths | none | `host` |
| 14 | **F-C14** Ask budget 50k→80k (or Ask isolation) | F-C01, F-C02 (after dilution down) | `core` |
| 15 | **F-C15** Decision explainability + prefetch tags | F-C07 (needs decision event) | `host` + `chat-ui` |

**Dependency graph (text):** `F-C06 → F-C07 → F-C15`; `F-C01/F-C02 → F-C14`; `F-C05 → F-C13`; others independent. Each row is ≤1 package (`shared` first when needed) to respect `B-0: one session = one domain`.

---

## 7. Risks & Rollback Plan — P0 Fixes Only (Stable Surface Protection)

> Principle from `V3_WORK_ORDER.md §안정 표면`: Phase 0–3 `[x]` UI/stream (`MessageSteps`, `CONV-018/019`, `CHAT-012`, seal contract) is confirmed working. Every P0 fix below is additive, behind a config default, and touches only its target package's narrow codepath.

| P0 Fix | What could regress (stable surface) | Mitigation before merge | Rollback (≤1 config or 1-line revert) |
|---|---|---|---|
| **F-C06 explicitSwitch + sticky TTL** | Auto classifier recall drops → valid `plan` keyword ignored because new regex matches `그만` inside longer word | Unit test matrix from v2.1 `modeClassifier.test.ts` ported (15 cases including Korean + English explicit switches). Manual test: "plan, then stop and fix" vs "plan architecture" | Feature flag `agent-k.mode.explicitSwitch=false` → restores old `classifyAutoMode`; even if shipped, sticky TTL is `maxAgeTurns=3` — increase to 99 to disable expiry without revert |
| **F-C07 host resolver** | Composer `mode:auto` path breaks existing `payload.mode:'agent'` callers or legacy webview that already sends concrete mode — resolver might flip to debug erroneously | Host fallback: if `payload.mode ∈ isAgentMode()` (concrete) keep it unless `explicitSwitch` + auto says otherwise; log `modeDecision` diff but do not flip without `auto` marker. Test with legacy spy `payload.mode='agent'` → stays agent | Flag `agent-k.harness.modeResolve=false` → host returns to `payload.mode\|\|'agent'` single line (`chatSend.ts:194`). Shared protocol `mode:'auto'` remains compatible (old host ignores unknown value and falls back) |
| **F-C01 prefetch gate** | Short prompt that actually needs `@file` loses file context → Agent hallucinates path | Gate allows `@file` mentions even on short prompt (`extractFileMentions` non-empty bypass). Test: prompt under 80 chars with `@src/foo.ts:10-20` → still prefetched. Log `prefetchLen` for analytics | `agent-k.harness.prefetchEnabled=true` + `prefetchModeGate=false` restores old unconditional `enabled:true, ideContextEnabled:true`. One-line revert in `chatSend.ts:1431` `new PrefetchEngine({enabled:true, ideContextEnabled:true})` |
| **F-C02 rules 12k→2k** | Agent misses custom rule (e.g., `.agentk/rules/deny.md` describing secret path) → writes to denied path, permission later denies but wastes turn | Keep 12k for `plan` mode; for `agent/ask` fallback to on-demand: if `PermissionGate` denies with `ruleName` hint, next turn loads full rules (lazy reload). Test: custom rule `no-write-to-secrets` → try write → deny → rules re-injected → second attempt correctly denied with explanation | `agent-k.harness.rulesBudget=12000` (or `ProjectRulesLoader.ts:262` default param revert). Immediate `invalidateProjectRulesCache` after flip |
| **F-C12 STREAM-004 prior fix** | Dual-path serialize (content+turnProse) duplicates text → context doubles for prose-heavy turns → triggers early compaction (`full` instead of `micro_summary`) | Join with dedup: `const seen = new Set(content.split('\n')); proseLines.filter(l=>!seen.has(l))`. Log `priorChars before/after` and alert if `after>before*1.8`. Test with empty `content+nonempty turnProse` and `content already contains prose` both deduped | Host fallback: `payload.messages[].turnProse` is optional — if missing host uses `content` only (old path). To rollback, change `chat-ui` `useChatSendFlow` to not send `turnProse` and host one-liner revert to `payload.messages.slice(0,-1)` |

**General rollback guard for all P0s:** No DB migration, no worktree partial-apply interaction (R-003 untouched). Each fix is behind `agent-k.*` config key read at send time (`vscode.workspace.getConfiguration`) — flipping flag requires no reload. `git revert` scope is ≤2 files per P0 (enforced by Work Plan §3).

---

## 8. Appendix

### 8.1 Verification file list (line-anchored)

- `packages/core/src/mode/ModeRegistry.ts:110-115` MODE_PROMPTS + `:117-167` budgets/maxTurns + `:169-191` classifyAutoMode + `:194-238` sticky/planSticky + `:241-266` ManualModeOverride + `:282-311` handoff
- `packages/core/src/context/ContextAssembler.ts:76-82` harness inject + `:84-105` sticky+rules+workspace concat + `:107-112` 15% cap + `:114-135` assemble+compact
- `packages/core/src/context/CompactionEngine.ts:23` MAX_TOOL_RESULT_CHARS + `:99-118` markProtected + `:190-210` levelFull + `:216-248` repairToolCallPairs
- `packages/core/src/context/budget.ts:36-51` estimateMessagesTokens/isOverBudget/COMPACTION_TRIGGER_RATIO 0.9
- `packages/core/src/harness/ProjectRulesLoader.ts:17-32` FILE constants + `:141-182` loadProjectRulesFromFs + `:229-240` getProjectRulesCached + `:251-269` resolveProjectRulesContent
- `packages/core/src/harness/VerificationFirstPrompt.ts:6-27` + `CursorPattern.ts:4-13` + `PromptTurnStructure.ts:4-11` — the 1.2k harness block
- `packages/core/src/harness/PostEditVerification.ts:7-87` tracker + format + parser + `:90-112` retry cap 2
- `packages/core/src/harness/VerifyExitCheck.ts:14-96` pending/verified + evaluateVerifyExit
- `packages/core/src/harness/HarnessBridge.ts:4-17` formatPrefetchBlock + prependPrefetchToUserPrompt
- `packages/core/src/prefetch/PrefetchEngine.ts:27-50` config + `:44-151` prefetch (file/stack/symbol/task_context) + `:177-179` updateConfig
- `packages/core/src/prefetch/ContextBlockBuilder.ts:15-55` maxBlockTokens 4000 sort by relevance
- `packages/core/src/prefetch/taskContextStrategy.ts:41-71` CONTEXT_STRATEGIES maxTokens + `:81-104` inferTaskType + `:110-154` selectContextItems
- `packages/core/src/prefetch/ideContextInjector.ts:34-46` collectGitDiffSync + `:53-96` collectIdeContextBag (never throws)
- `packages/core/src/loop/AgentLoopController.ts:240-265` assemble+compact emit + `:304-326` verify exit nudge + `:480-509` read_lints micro-loop + `:584-590` blind-nudge system push + `:532-540` canParallel
- `packages/core/src/loop/DoomLoopDetector.ts:21-53` threshold exact match + `:94-108` hash/errorSig
- `packages/core/src/loop/searchBeforeRead.ts:8-32` SEARCH/READ sets + `:66-78` userMessageHintsPath + `:91-92` NUDGE + `:100-133` batchHasBlindRead
- `packages/core/src/debug/DebugModeController.ts:67-79` DEBUG_STAGE_PROMPTS + `:91-115` DEBUG_STAGE_TOOLS + `:117-127` isDebugToolAllowedForStage
- `packages/host/src/chatSend.ts:194` mode direct + `:196` planStage only + `:243-257` harnessCfg+routing + `:291-295` schemaOpts + `:750-763` 280-char slice + `:1414-1439` prior slice + prefetch prepend
- `packages/host/src/prefetchDeps.ts:8-39` createPrefetchIdeDeps (vscode diagnostics/activeFile)
- `packages/shared/src/common/mode.ts:6-18` AgentMode union + PlanStage + isAgentMode
- `packages/shared/src/protocol/chat-send.ts:38-56` ChatSendPayload (mode, planStage, debugStage, images, inlineEdit)
- `git show v2.1-PRODUCTION-MODE:src/mode/modeClassifier.ts:8-60` explicitSwitch + DEBUG/PLAN/AGENT keyword lists + classifyMode sticky guard (absent in v3)
- `git show v2.1-PRODUCTION-MODE:src/agent/ContextAssembler.ts` v2.1 TierA harness gating (ask/plan read-only policy)

### 8.2 Stable surface caution (V3_WORK_ORDER 2026-08-23)

Phase 0–3 `[x]`動作 (Timeline `MessageSteps`, Thought soft-pause, Terminal/FileEdit card, Composer paste/DnD, seal contract) is confirmed working. Implement fixes in this doc without broad touches to `MessageSteps`·`CONV-018/019`·`STREAM-004` seal contract — log → root cause → minimal patch principle.

### 8.3 Doc history

- 2026-08-30 v1: @developer 8 causes / 7 fixes scaffold
- 2026-08-30 v2 (this): expanded to 24 problems (A/B/C/D) + 15 code-level fixes + phased roadmap + P0 rollback — evidence-anchored to file:line

