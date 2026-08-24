# v3.0 작업 순서 (Work Order) — Feature ID 세분화

**참조 브랜치:** `v2.1-PRODUCTION-MODE` (읽기 전용)  
**쓰기 브랜치:** `v3.0`  
**패키지 정의:** `docs/AGENT-K-MONOREPO-FINAL.md`  
**작업 방식:** `docs/V3_WORK_PLAN.md` (**§3 / §3.1: v2.1에서 최대한 이식 · 스텁 완료 금지**)  
**Feature 권위:** `docs/AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md`

체크: `[ ]` 미착수 · `[~]` 진행 중 · `[x]` 8항목 통과 완료  
이식: Feature ID 단위로 v2.1 검증 로직을 **최대한 가져오되**, 패키지 경계에 맞게 재배치. `src/` 통째 복붙 금지.

이식 순서 = Feature Master **§38**. 패키지 열 = Monorepo Final 매핑.
**한 세션 = Feature ID 하나.**

---

## D — 문서 / 리셋

| ID | 작업 | 상태 |
|----|------|------|
| D-001 | v3.0 리셋 (docs-only) | [x] |
| D-002 | `docs/AGENT-K-MONOREPO-FINAL.md` | [x] |
| D-003 | `docs/V3_WORK_PLAN.md` | [x] |
| D-004 | `docs/V3_WORK_ORDER.md` | [x] |
| D-005 | Feature Master 원본 배치 | [x] |
| D-006 | Master ↔ Work Order Feature ID 세분화 | [x] |

---

## S — 스켈레톤 (다음 실제 작업)

| ID | 작업 | 패키지 | 상태 |
|----|------|--------|------|
| S-001 | 루트 workspace package.json + workspaces | root | [x] |
| S-002 | extensions/agent-k 빈 조립 패키지 | extensions/agent-k | [x] |
| S-003 | packages/shared 빈 패키지 | shared | [x] |
| S-004 | packages/host 빈 패키지 | host | [x] |
| S-005 | packages/chat-ui 빈 패키지 | chat-ui | [x] |
| S-006 | packages/core 빈 패키지 | core | [x] |
| S-007 | packages/tools 빈 패키지 | tools | [x] |
| S-008 | packages/providers 빈 패키지 | providers | [x] |
| S-009 | packages/plan · worktree · safety stub | plan/worktree/safety | [x] |
| S-010 | 루트 AGENTS.md (Monorepo Part B) | root | [x] |
| S-011 | .cursor/rules/*.mdc (Monorepo Part C) | .cursor/rules | [x] |
| S-012 | README 빌드/실행 최소 안내 | root | [x] |

**바로 다음:** **Phase 6** — PLAN-* (Plan V1/V2).  
Phase 5 SUB-001…014 `[x]` (core runner + host createSubagentHost + chat-ui RunRow).  
**주의:** 「안정 표면 (2026-08-23)」 절 — Phase 0–3 UI/스트림은 최소 침습만.

---

## Session WIP — 2026-08-23 (진행 중)

| Feature ID | 오늘 한 일 | 상태 | 내일 |
|------------|------------|------|------|
| CONV-019 | FileEdit: 전체 lines + 접힘~4줄 스크롤 + Shiki extract 수정 | [x] | **화면 확인 완료** |
| CONV-014 | Thought: **전 tool soft-pause** (edit/terminal 포함, 한 id/send) | [~] | **미룸** — SUB-* 이후 |
| CONV-018 | Terminal/Ran: host emit + dig prose phase 유지 | [x] | **화면 확인 완료** |
| CHAT-012 | Composer 캡처 paste/DnD → temp 저장 + vision images | [x] | **완료** |
| CONV-013 | Work timeline (= MessageSteps 본체) | [x] | **완료** |
| CONV-016 | ChangedFiles 바 | [~] | **미룸** — 바 OK / 내부 동작은 checkpoint 이후 |
| HOST-002 | incomplete stream 로그 | [~] | RCA |
| STREAM-004 / CHAT send | **TODO:** 같은 탭 follow-up에서 UI엔 대화가 보이는데 모델이 prior를 모름 — `chat.send`가 `content`만 직렬화하고, `sealBodyBeforeTools` 후 assistant `content:''` + `turnProse`만 남는 경우 prior가 빈 문자열로 감 | [ ] | prior 직렬화: `content \|\| turnProse join` (+ 필요 시 prior attachment); `useChatStream` / `useChatSendFlow`; 재현 로그 `msgs=N` + contentLen |

**메모:** explore Thought pause는 기적용.  
**TODO (나중):** 같은 탭 history lossy — UI=`content`+`turnProse`, API=`content`만 → tool-heavy 턴 follow-up 시 모델이 위 대화를 모름. New Chat 격리는 정상(CHAT-009).

---

## 안정 표면 (2026-08-23) — 수정 시 신중

**현재까지 Phase 0–3에서 `[x]` 된 동작은 사용자 확인 기준으로 잘 돌아가고 있다.**  
새 Feature / RCA / 미룸 항목을 건드릴 때 **이 표면을 깨지 말 것.** 추측 패치·광범위 리팩터·“정리용” 동시 변경 금지.

### 건드리면 안 되는 것 (회귀 고위험)

| 영역 | Feature / 경로 힌트 | 이유 |
|------|---------------------|------|
| Timeline 본체 | CONV-013 = `MessageSteps` | Exploring/Explored·Thought·tool 순서·접힘 |
| Thought soft-pause / mid Thought | CONV-014 일부 기적용 (`assistantStreamSession`) | tool 전후 Thinking 회전 — 서브에이전트 전 추가 손대지 말 것 |
| Terminal / FileEdit 카드 | CONV-018 / 019 | Ran·Edited 화면 확인 완료 (Shiki extract, 접힘 스크롤 포함) |
| Composer / paste·DnD·vision | CHAT-012 + host clipboard | OS clipboard 경로·focus claim — Electron 가정 금지 |
| Stream seal / buffer | STREAM-004·005 (완료분) | sealBodyBeforeTools 계약; prior TODO는 **직렬화만** 최소 변경 |
| Explore chrome nesting | CONV-015 | MessageSteps와 이중 구조 — 합치기 리팩터 금지 |

### 의도적 미룸 (지금 손대지 말 것)

- **CONV-014** 잔여(메인=서브 detail 동일) → **SUB-\*** 이후
- **CONV-016** 바 내부 동작(열기/체크포인트 연동) → **checkpoint 이후** (바 노출만 OK)
- **STREAM-002** phase rail → 스킵 유지
- **CONV-017** / **CHAT-010** → 스킵 유지

### 수정 규칙 (이 표면 관련)

1. **로그 → 원인 확정 → 최소 패치.** 증상만으로 MessageSteps / FileEdit / Ran / Composer attach를 다시 쓰지 말 것.
2. 한 세션 = 한 Feature. 안정 표면과 무관한 Phase 4+(WT) 작업이어도, 공유 스트림/브리지 건드릴 때는 위 표 회귀를 먼저 의식.
3. HOST-002 final-cut·STREAM-004 prior는 **해당 파일만** 좁게; “답 이어쓰기” 휴리스틱·timeline 레이아웃 동시 변경 금지.
4. CSS/chrome “정리”로 `.ak-turn-rail` 배선·Explored liveProse 위치·chip/attach 프로토콜을 바꾸지 말 것.

---

## Phase 0 — 뼈대 (Master §38)

Phase 0 시작 전/병행: shared 계약.

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| SHARED-001 | Extension↔Webview protocol types | shared | [x] |
| SHARED-002 | Typed Work Event contracts (R-002) | shared | [x] |
**완료/원칙:** 확장 로드 + host↔webview shared protocol 통신 (UI Hello OK).

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| EXT-001 | Extension activation | extensions/agent-k + host | [x] |
| EXT-002 | Chat View | extensions/agent-k + host | [x] |
| EXT-003 | Command registration | extensions/agent-k + host | [x] |
| EXT-004 | CSP / nonce / Webview security | extensions/agent-k + host | [x] |
| EXT-005 | Workspace path abstraction | extensions/agent-k + host | [x] |
| HOST-001 | ChatViewProvider | host | [x] |
| HOST-002 | Chat send bridge | host | [~] AgentLoop wired; **2026-08-22** empty-reply/tool diag; final-cut **RCA → 08-23** (이어쓰기 추측 패치 철회) |
| HOST-003 | Composer host | host | [x] |
| HOST-004 | Config bridge | host | [x] |
| HOST-005 | Project config bridge | host | [x] |
| HOST-006 | Runtime singletons | host | [x] |
| HOST-007 | Session host | host | [x] |
| HOST-008 | Plan host | host | [x] |
| HOST-009 | Workspace index host | host | [x] |
| HOST-010 | Provider probe host | host | [x] |
| HOST-011 | Subagent host | host | [x] |
| HOST-012 | Subagent worktree bridge | host | [x] |
| HOST-013 | Subagent worktree registry | host | [x] |
| HOST-014 | Timeline labels | host | [x] + Read `dir/file` short path (2026-08-22) |
| HOST-015 | Worktree manager (host) | host | [x] |
| CFG-001 | ConfigManager | core | [x] |
| CFG-002 | ProjectConfig | core | [x] |
| CFG-003 | Permission configuration | core | [x] |

---

## Phase 1 — Providers / Models (R-001)

**완료/원칙:** Composer dropdown ≠ runtime ModelRouter.

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| PROVIDER-001 | Provider type detection | providers | [x] |
| PROVIDER-002 | Provider registry | providers | [x] |
| PROVIDER-003 | Provider connections | providers | [x] |
| PROVIDER-004 | Provider profiles | providers | [x] |
| PROVIDER-005 | Provider presets | providers | [x] |
| PROVIDER-006 | Provider fields | providers | [x] |
| PROVIDER-007 | Provider status | providers | [x] |
| PROVIDER-008 | Provider health check | providers | [x] |
| PROVIDER-009 | Provider probe | providers | [x] |
| PROVIDER-010 | LiteLLM provider | providers | [x] |
| PROVIDER-011 | OpenAI provider | providers | [x] |
| PROVIDER-012 | Anthropic provider | providers | [x] |
| PROVIDER-013 | Ollama provider | providers | [x] |
| PROVIDER-014 | LM Studio provider | providers | [x] |
| PROVIDER-015 | OpenCode Zen / Go | providers | [-] 스킵 (이번 세션 범위 외) |
| PROVIDER-016 | DGX provider | providers | [-] 스킵 (이번 세션 범위 외) |
| PROVIDER-017 | Secret manager (provider keys) | providers | [-] 스킵 (이번 세션 범위 외) |
| PROVIDER-018 | Tool result formatter | providers | [-] 스킵 (이번 세션 범위 외) |
| MODEL-001 | Model Registry | providers | [x] |
| MODEL-002 | Model Resolver | providers | [x] |
| MODEL-003 | Model Routing | providers | [x] |
| MODEL-004 | Model normalization | providers | [x] |
| MODEL-005 | Model tags | providers | [x] |
| MODEL-006 | Available models | providers | [x] |
| MODEL-007 | Composer model persistence | providers | [x] |
| MODEL-008 | Thinking capability | providers | [x] |
| MODEL-009 | Tier-based turns | providers | [x] |
| MODEL-010 | Provider order | providers | [x] |
| MODEL-011 | Model context info | providers | [x] |
| CFG-008 | Provider configuration | providers | [x] |
| UXPROV-001 | Connection test | providers (+ chat-ui picker) | [x] |
| UXPROV-002 | Auto-refresh models | providers (+ chat-ui picker) | [x] |
| UXPROV-003 | Searchable model picker | providers (+ chat-ui picker) | [x] |
| UXPROV-004 | Saved connections | providers (+ chat-ui picker) | [x] |
| UXPROV-005 | Provider order | providers (+ chat-ui picker) | [x] domain (MODEL-010); picker UI → CHAT-003 |
| UXPROV-006 | Local-first auto resolve | providers (+ chat-ui picker) | [x] domain (MODEL-002); picker UI → CHAT-003 |

---

## Phase 2 — Agent Core + Modes + Safety

**완료/원칙:** TOOL은 R-005 contract 필수. MODE/DEBUG/REL·잔여 CFG는 Master §38에 명시되지 않아 Phase 2에 배치.
**상태:** Phase 2 도메인 API + unit tests 완료 (DEBUG UI·host 배선은 Phase 3+).

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| AGENT-001 | AgentLoopController | core | [~] SOLID core loop; doom handler added; host-wired |
| AGENT-002 | Multi-turn execution | core | [x] |
| AGENT-003 | Tool loop | core | [x] |
| AGENT-004 | Tool execution | core | [x] |
| AGENT-005 | Context assembly | core | [x] |
| AGENT-006 | Context compaction | core | [x] |
| AGENT-007 | Tool-call preservation during compaction | core | [x] |
| AGENT-008 | Max turns | core | [x] |
| AGENT-009 | Turn timeout | core | [x] |
| AGENT-010 | Doom loop detection | core | [x] |
| AGENT-011 | Error recovery | core | [x] |
| AGENT-012 | Weak final answer detection | core | [x] |
| AGENT-013 | Closing summary detection | core | [x] |
| AGENT-014 | Continue-work detection | core | [x] |
| AGENT-015 | Broken tool payload detection | core | [x] |
| AGENT-016 | Classifier diagnostics | core | [x] |
| AGENT-017 | Parallel executor | core | [x] |
| AGENT-018 | Streaming tool executor | core | [x] |
| AGENT-019 | Synthesize instructions | core | [x] |
| TOOL-001 | Read tools | tools | [x] read_file + **read_files** / list_dir / file_search wired |
| TOOL-002 | Edit tools | tools | [x] |
| TOOL-003 | Write tools | tools | [x] + delete_file |
| TOOL-004 | Search / grep | tools | [x] + codebase_search (grep snippets) |
| TOOL-005 | Glob/path search | tools | [x] |
| TOOL-006 | Terminal executor | tools | [x] |
| TOOL-007 | AskQuestionTool | tools | [x] |
| TOOL-008 | Tool call parser | providers (parser) / tools | [x] |
| TOOL-009 | Executor abstraction | tools | [x] |
| TOOL-010 | Write executor | tools | [x] |
| TOOL-011 | TodoWriteTool | tools | [x] |
| TOOL-012 | TaskTool / SubAgent orchestration | tools | [x] task + task_run alias; host spawn |
| TOOL-013 | SkillTool | tools | [x] skill + skill_run alias |
| TOOL-014 | Browser tool group | tools | [~] navigate/snapshot + click/… stubs (no Playwright) |
| TOOL-015 | Debug tools | tools | [x] debug_* + add_instrumentation aliases + request_reproduce |
| TOOL-016 | Tool registry | tools | [x] |
| TOOL-017 | Parallel search | tools | [x] |
| CTX-001 | Context budget | core | [x] |
| CTX-002 | Read max lines | core | [x] |
| CTX-003 | Context assembler | core | [x] |
| CTX-004 | Compaction engine | core | [x] emit compaction → host → UI "Summarizing chat context..." |
| CTX-005 | Workspace context | core | [x] |
| SAFE-001 | Permission gate | safety | [x] |
| SAFE-002 | Deny globs | safety | [x] |
| SAFE-003 | Terminal deny patterns | safety | [x] |
| SAFE-004 | Write gate | safety | [x] |
| SAFE-005 | Secret scan / Secrets Vault | safety | [x] |
| SAFE-006 | Checkpoint | safety | [x] |
| SAFE-007 | Verification-first | safety | [x] |
| SAFE-008 | Verification micro-loop | safety | [x] |
| SAFE-009 | Related test execution | safety | [~] NodeRelatedTestRunner (vitest) + stub |
| SAFE-010 | Hooks system | safety | [x] |
| MODE-001 | Ask Mode | core | [x] |
| MODE-002 | Agent Mode | core | [x] |
| MODE-003 | Plan Mode | core | [x] |
| MODE-004 | Debug Mode | core | [x] |
| MODE-005 | Auto Mode | core | [x] |
| MODE-006 | Sticky mode | core | [x] |
| MODE-007 | Plan V2 sticky state | core | [x] |
| MODE-008 | Manual mode override | core | [x] |
| MODE-009 | Plan → Agent handoff | core | [x] |
| DEBUG-001 | Debug controller | core (+ chat-ui UI) | [x] domain; UI → Phase 3/9 |
| DEBUG-002 | Hypothesis | core (+ chat-ui UI) | [x] domain; UI → Phase 3/9 |
| DEBUG-003 | Reproduce | core (+ chat-ui UI) | [x] domain; UI → Phase 3/9 |
| DEBUG-004 | Analyze | core (+ chat-ui UI) | [x] domain; UI → Phase 3/9 |
| DEBUG-005 | Fix | core (+ chat-ui UI) | [x] domain; UI → Phase 3/9 |
| DEBUG-006 | Cleanup | core (+ chat-ui UI) | [x] domain; UI → Phase 3/9 |
| DEBUG-007 | Debug timeline | core (+ chat-ui UI) | [x] domain; UI → Phase 3/9 |
| DEBUG-008 | Debug evidence | core (+ chat-ui UI) | [x] domain; UI → Phase 3/9 |
| DEBUG-009 | Instrumentation | core (+ chat-ui UI) | [x] domain; UI → Phase 3/9 |
| DEBUG-010 | Multi-file debug / templates / log server | core (+ chat-ui UI) | [x] domain; UI → Phase 3/9 |
| REL-001 | Classifier diagnostics | core | [x] |
| REL-002 | Plan watchdog | core | [x] |
| REL-003 | Streaming stabilization | core | [x] |
| REL-004 | Turn state machine | core | [x] |
| REL-005 | Send epoch protection | core | [x] |
| REL-006 | Regeneration safety | core | [x] |
| REL-007 | Tool payload validation | core | [x] |
| REL-008 | Compaction integrity | core | [x] |
| CFG-004 | Harness configuration | core | [x] |
| CFG-005 | Queue configuration | core | [x] |
| CFG-006 | Terminal configuration | core | [x] |
| CFG-007 | Review configuration | core | [x] |
| CFG-009 | Thinking effort | core | [x] |
| CFG-010 | Debug classifier diagnostics | core | [x] |

---

## Phase 3 — Chat / Streaming / Conversation

**완료/원칙:** CONV-002 types는 shared; UI는 Typed Work Event만 소비 (R-002).

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| CHAT-001 | Chat application shell | chat-ui | [x] v2.1 ChatApp + full chat.css / ui/*.css; split → `chat/app/*` hooks |
| CHAT-002 | Composer | chat-ui | [x] cursor box + mode pill + model input |
| CHAT-003 | Searchable Model Picker | chat-ui | [x] v2.1 ModelSelector + UXPROV-003 filter/catalog wiring |
| CHAT-004 | Mode selector | chat-ui | [x] v2.1 ModeSelector (Auto/Agent/Plan/Debug/Ask) + Composer wiring |
| CHAT-005 | File/selection attachment | chat-ui (+ host bridge) | [x] Composer chips + attachmentFormat; host `attachments.add` selection |
| CHAT-006 | Message queue | chat-ui | [x] MessageQueue + QueueUI + send-flow (Enter queue / Ctrl+Enter resynth / Alt+Enter); Stop onStop keep|discard; unit tests |
| CHAT-007 | Chat sessions | chat-ui | [x] ChatSessionStore + useChatSessions + ChatSessionTabs; tab isolation / modeAuto / queue park; provider+subagent unit tests |
| CHAT-008 | Chat history | chat-ui | [x] HistoryPanel + rail toggle; open/delete/new from history; UI unit tests |
| CHAT-009 | New Chat | chat-ui | [x] handleNewChat always forks tab (empty OK); tabs/history/host `session.new`/slash `/new`; unit tests |
| CHAT-010 | Side Chat | chat-ui | [ ] skipped — v2.1도 unsupported stub(ADDON-T16); 코드 미이식 |
| CHAT-011 | Composer palette | chat-ui | [x] composerPalette + ComposerPalette + Composer/@·slash wiring; unit tests |
| CHAT-012 | Composer image paste/DnD | chat-ui (+ host) | [x] paste/DnD → temp PNG + chip; `chat.send.images` → multimodal; host OS clipboard (no Electron); focus claim — **완료** |
| STREAM-001 | Assistant stream session | chat-ui (표시) | [x] createAssistantStreamSession + ownerSessionId routing; tab settle/error; unit tests. core runtime → REL/useChatStream 별도 |
| STREAM-002 | Turn state | chat-ui (표시) | [-] **스킵** — phase rail/label 미배선; Thought/Exploring/Ran 등 MessageSteps가 바로 표시. `deriveTurnStatus` unused 유지. REL-004 core [x] |
| STREAM-003 | Send epoch | chat-ui (표시) | [x] SendEpochMap per-tab; wired in send/stop/resynth. Runtime = REL-005 [x] |
| STREAM-004 | Streaming buffer stabilization | chat-ui (표시) | [x] single-buffer contract (dedupe + sealBodyBeforeTools); REL-003 debounce core [x]. **TODO:** seal 후 `content:''`/`turnProse`만 있을 때 follow-up `chat.send` prior 빈약 — Session WIP 2026-08-23 |
| STREAM-005 | Prose sealing | chat-ui | [x] sealTurnProse.ts (=v2.1) + STREAM-004 seal contract tests |
| STREAM-006 | Regenerate turn | chat-ui | [x] regenerateTurn moveUserTurnToEnd (edit=regen); unit tests; REL-006 core [x] |
| STREAM-007 | Stop / cancellation | chat-ui | [x] StopHandler keep\|discard + send-flow; unit tests. cancelInFlight → loop/core later |
| STREAM-008 | Plan V2 generation watchdog | chat-ui | [x] planGenerateWatchdog (v3 rename); useChatPlanMode; unit tests |
| STREAM-009 | Understanding lead | chat-ui | [x] understandingLead + MessageBubble box; unit tests |
| STREAM-010 | Opening lead | chat-ui | [x] openingLead helpers (legacy field sanitize); unit tests |
| CONV-001 | ConversationTurn | chat-ui | [x] ConversationTurn.tsx wired |
| CONV-002 | Work Event model | shared (+ chat-ui) | [x] SHARED-002 + conversationWorkEvent (+ tests) |
| CONV-003 | Work event normalization | chat-ui | [x] normalizeWorkItems (+ tests) |
| CONV-004 | Work event details | chat-ui | [x] workEventDetails (+ tests) |
| CONV-005 | Work item grouping | chat-ui | [x] groupWorkTimelineItems (+ tests) |
| CONV-006 | Timeline presentation | chat-ui | [x] timelinePresentation (+ tests) |
| CONV-007 | Conversation variants | chat-ui | [x] conversationVariants (+ tests); regen no longer stacks variants |
| CONV-008 | Agent turn adapter | chat-ui | [x] agentTurnAdapter (+ tests) |
| CONV-009 | Subagent result presentation | chat-ui | [x] subagentResult (+ tests) |
| CONV-010 | Subagent group presentation | chat-ui | [x] subagentGroupPresentation (+ tests) |
| CONV-011 | Worktree diff presentation | chat-ui | [x] DiffReviewPanel (=v2.1) + ChangedFilesBar; smoke test. WT apply → Phase 4 |
| CONV-012 | Change summary normalization | chat-ui | [x] normalizeChangeSummary (+ unit tests) |
| CONV-013 | Work timeline | chat-ui | [x] = MessageSteps 본체 (Exploring/Explored·Thought·Ran·Edited·liveProse). 별도 컴포넌트 없음 |
| CONV-014 | Timeline step card | chat-ui | [~] **미룸** — 서브에이전트(Phase 5 SUB-*) 이후. 메인 chrome은 018/019로 확인됨; detail=메인 동일성은 SUB 이후 |
| CONV-015 | Explore Chrome | chat-ui | [x] ExploreChrome kept for nested group/thought rows; main+detail = MessageSteps |
| CONV-016 | Changed Files bar | chat-ui | [~] **미룸** — 바 노출 OK, 클릭/열기 등 동작 안 함 → **checkpoint 이후** (SAFE/WT 연동) |
| CONV-017 | Change Summary card | chat-ui | [-] **스킵** — 세션 변경 목록은 CONV-016 ChangedFilesBar만 사용 (턴 안 요약 카드 불필요) |
| CONV-018 | Terminal Run Card | chat-ui | [x] host `terminal.run` + Ran 카드 — **2026-08-23 화면 확인 완료** |
| CONV-019 | File Edit Card | chat-ui | [x] before→after + Shiki extract fix + 전체 lines/접힘~4줄 스크롤 — **2026-08-23 화면 확인 완료** |
| CONV-020 | Conversation tabs | chat-ui | [x] ChatSessionTabs (CHAT-007) |
---

## Phase 4 — Worktree / Patch (R-003)

**완료/원칙:** Prepare→Validate→Snapshot→Apply→Verify→Commit/Adopt / rollback.

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| WT-001 | Worktree manager | worktree | [x] v2.1 domain `WorktreeManager` + porcelain; **cross-platform** `execFile` argv + flat dirs `a/b`→`a__b` + path realpath/win case; unit+git smoke. HOST-015 host 사본은 별도 |
| WT-002 | Worktree creation | worktree | [x] `bindWorktreeManager` + SubagentWorktree create/capture (v2.1 agent/subagentWorktree). Runner wiring → SUB-* |
| WT-003 | Worktree registry | worktree | [x] session Map registry; host re-export |
| WT-004 | Worktree path validation | worktree | [x] `assertManagedWorktree` / `.agentk/worktrees` only |
| WT-005 | Worktree isolation | worktree | [x] `assertIsolatedWorktree` gate |
| WT-006 | Worktree snapshot | worktree | [x] `captureWorktreeSnapshot` |
| WT-007 | Worktree diff | worktree | [x] manager.diff + `parseWorktreeUnifiedDiff` |
| WT-008 | Git porcelain parsing | worktree | [x] worktree-list porcelain + `parseStatusPorcelain` |
| WT-009 | Patch validation | worktree | [x] `checkGitPatch` (`git apply --check`); StalenessChecker. search-replace PatchApplier→tools/SAFE 후속 |
| WT-010 | Patch apply | worktree | [x] `applySubagentWorktree` + reverse rollback (R-003) |
| WT-011 | Untracked file transfer | worktree | [x] preflight + copy + rollback |
| WT-012 | Worktree review | worktree | [x] `reviewSubagentWorktree` (non-mutating) |
| WT-013 | Diff review panel | worktree (+ chat-ui) | [x] domain `worktreeDiff.ts`; UI already chat-ui CONV-011 / SubagentChangesCard |
| WT-014 | Adopt / reject | worktree | [x] `rejectSubagentWorktree` + `AdoptWinner` (+ BestOfN fan-out, AgentLoop→BON-*) |
| WT-015 | Subagent worktree bridge | worktree + host | [x] domain `bridge.ts`; host vscode adapter → `@agent-k/worktree` |

---

## Phase 5 — Subagent

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| SUB-001 | Subagent task model | core | [x] `subagent/subagents.ts` |
| SUB-002 | Subagent creation | core + host | [x] Runner.create + host |
| SUB-003 | Subagent runner | core | [x] `SubagentRunner` |
| SUB-004 | Subagent Agent Loop executor | core | [x] `createSubagentAgentLoopExecutor` → `run()` |
| SUB-005 | Subagent result | core + tools | [x] task.result + `SubAgentResult` |
| SUB-006 | Subagent cancellation | core + host | [x] cancel / cancelAll on stop |
| SUB-007 | Subagent lifecycle guard | core | [x] `applySubagentPatch` |
| SUB-008 | Subagent roles | core + chat-ui | [x] role + Explorer badge |
| SUB-009 | Subagent description | core + host | [x] task.description → RunRow title |
| SUB-010 | Subagent detail view | chat-ui | [x] child `sess-sub-*` in **same** message-list (composer hidden + Back); tab only on RunRow open (no auto-tab on spawn) |
| SUB-011 | Subagent run row | chat-ui | [x] 6-dot · title · role · Waiting |
| SUB-012 | Subagent changes card | chat-ui | [x] `SubagentChangesCard` |
| SUB-013 | Subagent result presentation | chat-ui | [x] `subagentResult` / workEvent |
| SUB-014 | Subagent worktree | worktree + host | [x] bindWorktreeManager on Runner |

**검증:** `npm run test -w @agent-k/core` (subagent) · `npm run test -w @agent-k/worktree` · chat-ui conversation/subagent tests. 수동: `task` 병렬 → 메인 단건 RunRow + Waiting/rolling.

---

## Phase 6 — Plan V1/V2 + Execution (R-004)

**완료/원칙:** Plan state machine 준수. prompt 한 방 대체 금지.

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| PLAN-001 | Plan Mode controller | plan | [ ] |
| PLAN-002 | Research | plan | [ ] |
| PLAN-003 | Clarifying Questions | plan | [ ] |
| PLAN-004 | Plan generation | plan | [ ] |
| PLAN-005 | Plan review | plan | [ ] |
| PLAN-006 | Plan storage | plan | [ ] |
| PLAN-007 | Plan promotion | plan | [ ] |
| PLAN-008 | Plan editor / history | plan | [ ] |
| PLAN-009 | Plan enforcement / context injection | plan | [ ] |
| PLAN-010 | Failure recovery / complexity / todo branching | plan | [ ] |
| PLAN2-001 | PlanSession | plan | [ ] |
| PLAN2-002 | PlanEvent | plan | [ ] |
| PLAN2-003 | PlanPhaseTransitions | plan | [ ] |
| PLAN2-004 | PlanV2Generator | plan | [ ] |
| PLAN2-005 | LiteLLMPlanModel | plan | [ ] |
| PLAN2-006 | WorkspaceContext | plan | [ ] |
| PLAN2-007 | EvidenceEngine | plan | [ ] |
| PLAN2-008 | FailureContext | plan | [ ] |
| PLAN2-009 | SchemaValidator | plan | [ ] |
| PLAN2-010 | SemanticValidator | plan | [ ] |
| PLAN2-011 | File intent resolution | plan | [ ] |
| PLAN2-012 | Markdown rendering | plan | [ ] |
| PLAN2-013 | Observed tool call | plan | [ ] |
| PLAN2-014 | Plan watchdog | plan | [ ] |
| PLAN2-015 | PlanModeControllerAdapter | plan | [ ] |
| EXEC-001 | Execution Plan build | plan | [ ] |
| EXEC-002 | Execution Context validation | plan | [ ] |
| EXEC-003 | Execution Plan validation | plan | [ ] |
| EXEC-004 | Plan phase mapping | plan | [ ] |
| EXEC-005 | Task inference | plan | [ ] |
| EXEC-006 | Task prompt generation | plan | [ ] |
| EXEC-007 | Task scheduler | plan | [ ] |
| EXEC-008 | Plan execution engine | plan | [ ] |
| EXEC-009 | Execution persistence | plan | [ ] |
| EXEC-010 | Execution diagnostics | plan | [ ] |
| EXEC-011 | Execution presentation | plan | [ ] |
| EXEC-012 | Subagent task bridge | plan | [ ] |

---

## Phase 7 — Coding UX

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| INLINE-001 | Inline Edit command | host/core + chat-ui(UI) | [ ] |
| INLINE-002 | Selection context | host/core + chat-ui(UI) | [ ] |
| INLINE-003 | Inline edit generation | host/core + chat-ui(UI) | [ ] |
| INLINE-004 | Inline edit diff | host/core + chat-ui(UI) | [ ] |
| INLINE-005 | Inline edit review | host/core + chat-ui(UI) | [ ] |
| INLINE-006 | Selection diff apply | host/core + chat-ui(UI) | [ ] |
| INLINE-007 | Inline Completion | host/core + chat-ui(UI) | [ ] |
| REVIEW-001 | Code Review session | core/host (+ chat-ui) | [ ] |
| REVIEW-002 | Agent Review loop | core/host (+ chat-ui) | [ ] |
| REVIEW-003 | Review apply policy | core/host (+ chat-ui) | [ ] |
| REVIEW-004 | Review checkpoint | core/host (+ chat-ui) | [ ] |
| REVIEW-005 | Review diff | core/host (+ chat-ui) | [ ] |
| REVIEW-006 | Accept / Apply / Undo | core/host (+ chat-ui) | [ ] |

---

## Phase 8 — Intelligence / integrations

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| CTX-006 | Workspace index | core | [ ] |
| CTX-007 | Codebase index | core | [ ] |
| CTX-008 | Semantic search | core | [ ] |
| CTX-009 | Mention extraction | core | [ ] |
| CTX-010 | File intent | core | [ ] |
| CTX-011 | Prefetch engine | core | [ ] |
| CTX-012 | Chat search index | core | [ ] |
| HARNESS-001 | Harness enabled | core | [ ] |
| HARNESS-002 | Verification first | core | [ ] |
| HARNESS-003 | Prefetch | core | [ ] |
| HARNESS-004 | Verification micro-loop | core | [ ] |
| HARNESS-005 | Project rules loader | core | [ ] |
| HARNESS-006 | Routing heuristics | core | [ ] |
| HARNESS-007 | Context rules / Cursor pattern / UX helpers | core | [~] **2026-08-22** search-before-read nudge (no read fail); CursorPattern 강화는 chat-ui harness |
| BROWSER-001 | Browser session | core (+ chat-ui preview) | [ ] |
| BROWSER-002 | Browser automation | core (+ chat-ui preview) | [ ] |
| BROWSER-003 | Browser evidence | core (+ chat-ui preview) | [ ] |
| BROWSER-004 | Browser preview | core (+ chat-ui preview) | [ ] |
| DESIGN-001 | Design Mode | core (+ chat-ui) | [ ] |
| DESIGN-002 | Design inspection workflow | core (+ chat-ui) | [ ] |
| MCP-001 | MCP client | core | [ ] |
| MCP-002 | MCP reload | core | [ ] |
| MCP-003 | MCP connect | core | [ ] |
| MCP-004 | MCP disconnect | core | [ ] |
| MCP-005 | MCP permissions | core | [ ] |
| MCP-006 | Stdio MCP session / bootstrap / parse | core | [ ] |
| SKILL-001 | Skills system | core | [ ] |
| SKILL-002 | Skill discovery/loading | core | [ ] |
| SKILL-003 | Skill feature flag | core | [ ] |
| MEM-001 | Memories | core | [ ] |
| MEM-002 | SecretStorage integration | core | [ ] |
| MEM-003 | Memory feature flag | core | [ ] |
| MEM-004 | Auto memory detector | core | [ ] |
| GH-001 | GitHub agent workflow | core/host | [ ] |
| GH-002 | GitHub token | core/host | [ ] |
| GH-003 | PR/Issue workflow | core/host | [ ] |
| ART-001 | Artifact store | core (+ chat-ui gallery) | [ ] |
| ART-002 | Artifact gallery | core (+ chat-ui gallery) | [ ] |
| ART-003 | Artifact open command | core (+ chat-ui gallery) | [ ] |
| BON-001 | Best-of-N execution | worktree | [ ] |
| BON-002 | Candidate comparison | worktree | [ ] |
| BON-003 | Candidate diff | worktree | [ ] |
| BON-004 | Adopt winner | worktree | [ ] |
| BON-005 | Worktree isolation for candidates | worktree | [ ] |
| SCM-001 | Commit message generator | worktree/host | [ ] |
| TEL-001 | Cost tracker | core | [ ] |
| TEL-002 | Status bar cost | core | [ ] |
| TEL-003 | Telemetry collector | core | [ ] |

---

## Phase 9 — Settings / UI polish

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| SET-001 | Settings shell | chat-ui (UI) | [x] v2.1 SettingsPanel + tabs + CSS |
| SET-002 | Models tab | chat-ui (UI) | [x] providers form + presets + config.update |
| SET-003 | Context tab | chat-ui (UI) | [x] UI shell (local store + host persist) |
| SET-004 | Features tab | chat-ui (UI) | [x] UI shell (feature toggles) |
| SET-005 | Harness tab | chat-ui (UI) | [x] UI shell |
| SET-006 | MCP tab | chat-ui (UI) | [x] UI shell (server list form) |
| SET-007 | Permission tab | chat-ui (UI) | [x] UI shell |
| SET-008 | Privacy tab | chat-ui (UI) | [x] UI shell |
| SET-009 | Queue tab | chat-ui (UI) | [x] UI shell |
| SET-010 | Review tab | chat-ui (UI) | [x] UI shell |
| SET-011 | Rules tab | chat-ui (UI) | [x] UI shell (editor chrome; host IO later) |
| SET-012 | Terminal tab | chat-ui (UI) | [x] UI shell |
| SET-013 | JSON config tab | chat-ui (UI) | [x] UI shell (editor + project file msgs) |
| UI-001~023 | Presentation components (AgentTurn, Timeline, Cards, …) | chat-ui | [x] presentational shells under `src/components` |
| UI-024 | StreamingMarkdown / Mermaid / VirtualList / extras | chat-ui | [~] Mermaid/VirtualList/CodeBlock chrome; shiki/md later |
| CURSOR-001 | Cursor UI base | chat-ui | [x] tokens + composer box + chrome |
| CURSOR-002 | Conversation layout | chat-ui | [x] empty/active main + thread inset |
| CURSOR-003 | Conversation tabs | chat-ui | [x] ChatSessionTabs chrome |
| CURSOR-004 | Composer polish | chat-ui | [x] ModeSelector + ModelSelector + palette |
| CURSOR-005 | Workspace polish | chat-ui | [~] ChangedFilesBar / History chrome (host later) |
| CURSOR-006 | Conversation variants CSS | chat-ui | [x] `styles/conversation-variants.css` |

---

## Phase 10 — 통합 검증 (Master §38)

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| INT-001 | Provider → Agent → Tool → Context → Chat E2E | integration | [ ] |
| INT-002 | Plan → Task → Subagent → Worktree → Review → Adopt | integration | [ ] |
| INT-003 | Auto Mode → Agent/Plan/Debug/Ask 전환 | integration | [ ] |
| INT-004 | Streaming → Stop → Queue → Regenerate | integration | [ ] |
| INT-005 | Inline Edit → Diff → Apply | integration | [ ] |
| INT-006 | Provider failure → fallback/routing | integration | [ ] |
| INT-007 | Worktree partial failure → rollback/recovery | integration | [ ] |
| INT-008 | Cost/Telemetry 동작 | integration | [ ] |
| INT-009 | Hooks + Verification micro-loop | integration | [ ] |

---

## 테스트 인벤토리 (Feature와 병행)

| Feature ID | 제목 | 패키지 | 상태 |
|------------|------|--------|------|
| TEST-001 | Agent | tests | [ ] |
| TEST-002 | Chat / Streaming | tests | [ ] |
| TEST-003 | Core / Harness | tests | [ ] |
| TEST-004 | Host | tests | [ ] |
| TEST-005 | Mode | tests | [ ] |
| TEST-006 | Plan Execution / Plan V2 | tests | [ ] |
| TEST-007 | Provider | tests | [ ] |
| TEST-008 | Tools / Conversation | tests | [ ] |

---

## 커버리지 노트

- Master 개별 ID 헤더 수: **338** (UI 범위 헤더 제외 시 단일 ID)
- 이 Work Order에 펼친 Feature 행: Phase 표 + SHARED + INT + TEST
- Master 단일 ID → Phase 표 **전부 매핑됨**.
- `UI-001~023` / `UI-024`는 Master 요약 섹션이라 범위 티켓으로 유지.
- `MODE` / `DEBUG` / `REL` / 잔여 `CFG` / `UXPROV`는 §38 본문에 묶음이 없어 논리 Phase에 배치함.

## 다음으로 할 일

1. **2026-08-23** — HOST-002 final-answer 중도 끊김 **원인 분석** (`finishReason` / `complete diag` / `streamedChars` vs `finalBodyLen`). 확정 전 이어쓰기·휴리스틱 패치 금지.
2. Phase 3 UI 잔여 미룸: **CONV-014 → SUB 이후**, **CONV-016 → checkpoint 이후**. CONV-013 완료.
3. **코드 TODO:** STREAM-004 follow-up prior (`content || turnProse`) · HOST-002 final-cut RCA — **안정 표면 최소 침습**
4. HARNESS-007 nudge 효과 확인 (선택)
5. **Phase 5** — SUB-001…014 `[x]` → 다음 **Phase 6 PLAN-***
6. HOST-002/008 실루프는 AGENT-* / PLAN-* 이후 본문 교체

**에이전트:** 위 「안정 표면」을 읽고 수정할 것. 잘 되는 UI/스트림을 넓게 건드리지 말 것. Phase 4 worktree는 `packages/worktree` (+ host thin adapter).
