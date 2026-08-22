# Agent-K Feature Master Inventory (Final)

## 기준

- **Canonical branch:** `yujunkong/agent-k:v2.1-PRODUCTION-MODE`
- **목적:** 기존 Agent-K의 최종 기능을 새 프로젝트로 하나씩 이식하기 위한 기능/모듈/의존성 마스터 목록.
- **중요:** 이 문서는 과거 C0~C7 개발 순서가 아니라 **최종 브랜치에 존재하는 기능을 기능 단위로 재분류**한다.
- `Implemented`는 해당 브랜치에 관련 구현이 존재한다는 뜻이며, `Verified`는 실제 동작 검증이 끝났다는 뜻이 아니다.
- 새 프로젝트 이식 시에는 아래 ID를 기준으로 체크한다.
- **본 문서는 원본 GPT 정리본을 실제 `src/` 트리와 대조·보완한 Final 버전이다.**

## 상태 표기

- `[ ]` 이식 전
- `[~]` 일부 이식/추가 검증 필요
- `[x]` 이식 완료 및 검증 완료
- `ARCH` 아키텍처 기반
- `UX` 사용자 기능
- `RUNTIME` 실행 계층
- `SAFE` 안전성
- `TEST` 테스트

---

# 0. 최종 아키텍처 지도

```text
VS Code Extension
├── Host / Runtime
│   ├── ChatViewProvider
│   ├── Host Bridge
│   ├── Runtime Services
│   ├── Config / Project Config
│   └── Workspace / Session Host
│
├── Chat / Conversation
│   ├── Composer
│   ├── Streaming
│   ├── Turn State
│   ├── Conversation Model
│   ├── Work Timeline
│   └── Side Chat
│
├── Agent Runtime
│   ├── Agent Loop
│   ├── Context Assembly
│   ├── Tool Execution
│   ├── Compaction
│   ├── Verification
│   ├── Hooks
│   └── Doom Loop / Recovery
│
├── Modes
│   ├── Ask
│   ├── Agent
│   ├── Plan
│   ├── Debug
│   └── Auto Mode Classifier
│
├── Plan
│   ├── Plan V1
│   ├── Plan V2
│   └── Plan Execution Engine
│
├── Parallel Agent
│   ├── Subagent
│   ├── Subagent Host
│   └── Subagent Worktree
│
├── Git / Worktree
│   ├── Worktree Manager
│   ├── Diff / Patch
│   ├── Review
│   ├── Adopt / Apply
│   └── Best-of-N
│
├── Providers
│   ├── Provider Registry
│   ├── Connections
│   ├── Profiles / Presets
│   ├── Model Registry
│   ├── Resolver
│   └── Routing
│
├── Coding UX
│   ├── Inline Edit
│   ├── Inline Completion
│   ├── Diff Review
│   └── Code Selection
│
├── Project Intelligence
│   ├── Rules
│   ├── Harness
│   ├── Workspace Context
│   ├── Codebase Index
│   ├── Semantic Search
│   └── Prefetch / Mentions
│
├── Settings / Integrations
│   ├── Settings Tabs
│   ├── MCP
│   ├── Browser / Design Mode
│   ├── GitHub
│   ├── Skills
│   ├── Memories
│   ├── Artifacts
│   ├── SCM (Commit Message)
│   └── Telemetry / Cost
│
└── Safety / Infrastructure
    ├── Permission Gate
    ├── Secrets Vault
    ├── Checkpoint
    ├── Patches
    └── Multi-Workspace
```

---

# 1. Extension / VS Code 기반

## EXT-001 Extension activation
- VS Code Extension Host에서 Agent-K를 구동한다.
- Activity Bar에 Agent-K 컨테이너를 제공한다.
- Chat Webview View를 제공한다.
- 관련 핵심: `src/extension.ts`, `src/host/ChatViewProvider.ts`
- 이식 우선순위: **P0**

## EXT-002 Chat View
- `agent-k.chat` Webview View.
- Chat UI의 진입점.
- 새 프로젝트의 최상위 UI shell에 해당.
- P0

## EXT-003 Command registration
다음 명령 계열을 제공한다.
- New Chat
- Open Settings
- Open Project Config
- Add Provider
- Switch Mode
- Focus Chat Input
- Attach Selection
- Inline Edit
- Plan Create / Plan Build / Plan Review
- Debug Start
- Code Review
- Browser Session
- Artifacts Gallery
- MCP Reload / Connect / Disconnect
- Best-of-N
- 관련: `package.json`, extension command wiring.
- P0

## EXT-004 CSP / nonce / Webview security
- Webview HTML 생성
- nonce 생성
- CSP 적용
- Host ↔ Webview 통신 보호
- 관련: `src/host/webviewHtml.ts`, `src/host/nonce.ts`, `src/chat/utils/getNonce.ts`
- P0 / SAFE

## EXT-005 Workspace path abstraction
- Workspace 경로 확인/정규화.
- Host에서 프로젝트 경로를 안전하게 다룬다.
- 관련: `src/host/workspacePaths.ts`
- P0 / SAFE

---

# 2. Host / Runtime Bridge

## HOST-001 ChatViewProvider
- Webview lifecycle 관리.
- Webview 메시지 수신/전송.
- Chat runtime 연결.
- 관련: `src/host/ChatViewProvider.ts` (canonical), `src/chat/ChatViewProvider.ts` 존재 여부 주의
- P0

## HOST-002 Chat send bridge
- Webview Composer 입력을 Agent runtime으로 전달.
- 관련: `src/host/chatSend.ts`
- P0

## HOST-003 Composer host
- Composer 관련 Host 기능.
- Provider/model 조회와 연결.
- 관련: `src/host/composerHost.ts`
- P0

## HOST-004 Config bridge
- VS Code 설정 ↔ Agent-K ConfigManager 연결.
- 관련: `src/host/configBridge.ts`
- P0

## HOST-005 Project config bridge
- `.agentk/settings.json` 등 프로젝트 설정 처리.
- 관련: `src/host/configProject.ts`, `src/core/ProjectConfig.ts`
- P0

## HOST-006 Runtime singletons
- Agent runtime에서 공유해야 하는 서비스의 lifecycle 관리.
- 관련: `src/host/runtimeSingletons.ts`, `src/core/RuntimeServices.ts`
- P0

## HOST-007 Session host
- Chat session lifecycle을 Extension Host에서 관리.
- 관련: `src/host/sessionHost.ts`, `src/session/*`
- P0

## HOST-008 Plan host
- Plan generate / execute 요청을 Host에서 처리.
- 관련: `src/host/planGenerate.ts`, `src/host/planExecute.ts`
- P1

## HOST-009 Workspace index host
- Workspace indexing/context 요청의 Host 처리.
- `src/host/planWorkspaceIndex.ts`
- P1

## HOST-010 Provider probe host
- Provider 연결/health/model discovery 계층.
- `src/host/providerProbe.ts`
- P0

## HOST-011 Subagent host
- Subagent 실행 요청을 Extension Host에서 처리.
- `src/host/subagentHost.ts`
- P1

## HOST-012 Subagent worktree bridge
- Subagent ↔ Worktree runtime 연결.
- `src/host/subagentWorktreeBridge.ts`
- P1

## HOST-013 Subagent worktree registry
- Host 차원의 Worktree registry.
- `src/host/subagentWorktreeRegistry.ts`
- P1

## HOST-014 Timeline labels
- Host 이벤트를 UI용 timeline label로 변환.
- `src/host/timelineLabels.ts`
- P1

## HOST-015 Worktree manager (host)
- Host 측 Worktree 관리.
- `src/host/worktreeManager.ts`
- P1

---

# 3. Configuration / Project Configuration

## CFG-001 ConfigManager
- 전역 설정 읽기/쓰기.
- VS Code configuration key 동기화.
- 기본값 관리.
- 관련: `src/core/ConfigManager.ts`
- P0

## CFG-002 ProjectConfig
- 프로젝트별 Agent-K 설정.
- `.agentk/settings.json` 연계.
- 관련: `src/core/ProjectConfig.ts`
- P0

## CFG-003 Permission configuration
- permission level
- deny globs
- write gate 관련 설정
- P0 / SAFE

## CFG-004 Harness configuration
- harness enabled
- verification-first
- prefetch
- verification micro-loop
- P1

## CFG-005 Queue configuration
- Enter while running 정책
- Stop 시 queue 보존/폐기
- resynthesize debounce
- P1

## CFG-006 Terminal configuration
- timeout
- deny patterns
- P0 / SAFE

## CFG-007 Review configuration
- apply policy
- auto checkpoint
- P1

## CFG-008 Provider configuration
- provider type
- base URL
- model
- API keys
- connections
- provider order
- P0

## CFG-009 Thinking effort
- off / low / medium / high / max.
- 모델 capability에 따라 UI 표시를 제어.
- 관련: `src/agent/thinkingEffort.ts`
- P1

## CFG-010 Debug classifier diagnostics
- `agent-k.debugClassifiers`
- 자연어 classifier 관찰 로그.
- 동작 자체를 변경하지 않는 diagnostic 기능.
- P2 / DEBUG

---

# 4. Chat / Composer

## CHAT-001 Chat application shell
- `ChatApp.tsx` 기반 전체 Chat UI.
- P0 / UX

## CHAT-002 Composer
- 사용자 prompt 입력.
- Mode 선택.
- Model 선택.
- Queue 입력.
- Attachment.
- Selection attachment.
- 관련: `src/chat/components/Composer.tsx`
- P0

## CHAT-003 Searchable Model Picker
- Model 목록 검색.
- Composer model catalog filtering.
- 관련: `src/chat/components/ModelSelector.tsx`
- P0

## CHAT-004 Mode selector
- Ask / Agent / Plan / Debug.
- Auto mode 지원.
- 관련: `src/chat/components/ModeSelector.tsx`
- P0

## CHAT-005 File/selection attachment
- VS Code selection을 Chat context에 첨부.
- P0

## CHAT-006 Message queue
- Agent 실행 중 새 입력 처리.
- resynthesize 또는 queue-only 정책.
- Stop 시 keep/discard 정책.
- 관련: `src/loop/MessageQueue.ts`, `src/chat/components/MessageQueueUI.tsx`
- P1

## CHAT-007 Chat sessions
- 여러 Chat session 관리.
- Session store / hooks / tabs.
- 관련: `ChatSessionStore.ts`, `useChatSessions.ts`, `ChatSessionTabs.tsx`
- P1

## CHAT-008 Chat history
- 이전 세션 탐색.
- 관련: `src/chat/components/HistoryPanel.tsx`
- P1

## CHAT-009 New Chat
- 현재 세션과 분리된 새 대화 생성.
- P0

## CHAT-010 Side Chat
- 메인 채팅과 분리된 사이드 세션.
- 관련: `src/sidechat/SideChatSession.ts`
- P2

## CHAT-011 Composer palette
- command/context palette.
- 관련: `src/chat/components/ComposerPalette.tsx`, `src/chat/composerPalette.ts`
- P1

---

# 5. Streaming / Turn State

## STREAM-001 Assistant stream session
- LLM streaming 응답을 session 단위로 관리.
- `assistantStreamSession.ts`
- P0

## STREAM-002 Turn state
- 하나의 assistant turn의 상태를 명시적으로 관리.
- `turnState.ts`
- P0

## STREAM-003 Send epoch
- 오래된 send/response가 현재 turn을 오염시키지 않도록 epoch 관리.
- `sendEpoch.ts`
- P0 / SAFE

## STREAM-004 Streaming buffer stabilization
- streaming 중 텍스트/이벤트 변동을 안정화.
- P1

## STREAM-005 Prose sealing
- 자연어 응답 종료/계속 판단 후 prose를 seal.
- `sealTurnProse.ts`
- P1

## STREAM-006 Regenerate turn
- 현재 turn 재생성.
- `regenerateTurn.ts`
- P1

## STREAM-007 Stop / cancellation
- 현재 Agent/stream 실행 중지.
- Queue 정책과 연계.
- 관련: `src/loop/StopHandler.ts`, `src/loop/cancelInFlight.ts`
- P0

## STREAM-008 Plan V2 generation watchdog
- Plan V2 generate가 멈추는 경우 감시.
- `planV2GenerateWatchdog.ts`
- P1

## STREAM-009 Understanding lead
- Agent turn 시작 시 understanding 단계의 표시/상태 처리.
- `understandingLead.ts`
- P1

## STREAM-010 Opening lead
- 오프닝/리드 문구 처리.
- `openingLead.ts`
- P1

---

# 6. Conversation Model / Timeline

## CONV-001 ConversationTurn
- 사용자/assistant turn을 구조화.
- `conversation/agentTurnAdapter.tsx`, `ConversationTurn.tsx`
- P0

## CONV-002 Work Event model
- Agent가 수행한 실제 작업을 구조화된 event로 표현.
- `conversationWorkEvent.ts`
- P0

## CONV-003 Work event normalization
- raw work event를 UI가 처리할 수 있는 형태로 정규화.
- P0

## CONV-004 Work event details
- 개별 event의 상세 데이터 표현.
- P1

## CONV-005 Work item grouping
- 연속 작업을 UI 표시 단위로 그룹화.
- `groupWorkTimelineItems.ts`
- P1

## CONV-006 Timeline presentation
- Work event → Timeline item 변환.
- `timelinePresentation.ts`
- P0

## CONV-007 Conversation variants
- Conversation 상태/종류별 presentation variant.
- `conversationVariants.ts`
- P1

## CONV-008 Agent turn adapter
- Agent runtime turn을 Conversation layer로 연결.
- P0

## CONV-009 Subagent result presentation
- Subagent 결과를 conversation/timeline에 표시.
- `subagentResult.ts`
- P1

## CONV-010 Subagent group presentation
- 여러 Subagent 결과를 묶어 표현.
- P1

## CONV-011 Worktree diff presentation
- Worktree 변경을 Conversation layer에서 표현.
- `worktreeDiff.ts`
- P1

## CONV-012 Change summary normalization
- 변경 요약을 정규화.
- `normalizeChangeSummary.ts`
- P1

## CONV-013 Work timeline
- Agent의 작업을 시간 순서로 표시.
- `WorkTimeline.tsx`
- P0 / UX

## CONV-014 Timeline step card
- Search/Read/Edit/Terminal/Subagent 등 작업 카드.
- `TimelineStepCard.tsx`
- P0

## CONV-015 Explore Chrome
- 탐색 작업의 Cursor 스타일 UI.
- `ExploreChrome.tsx`
- P1

## CONV-016 Changed Files bar
- 변경 파일 요약.
- `ChangedFilesBar.tsx`
- P1

## CONV-017 Change Summary card
- 작업 결과 요약.
- `ChangeSummary.tsx`
- P1

## CONV-018 Terminal Run Card
- terminal 실행을 timeline/card로 표시.
- `TerminalRunCard.tsx`
- P0

## CONV-019 File Edit Card
- file edit 작업을 timeline/card로 표시.
- `FileEditCard.tsx`
- P0

## CONV-020 Conversation tabs
- 여러 conversation session을 탭으로 표시.
- `ChatSessionTabs.tsx`
- P1

---

# 7. Mode System

## MODE-001 Ask Mode
- 읽기/질문 중심 mode.
- Write 작업 제한 구조와 연계.
- P0

## MODE-002 Agent Mode
- 실제 coding Agent loop.
- P0

## MODE-003 Plan Mode
- 분석/계획 후 실행하는 mode.
- P0

## MODE-004 Debug Mode
- 가설 → 재현 → 분석 → 수정 → 검증 흐름.
- P1

## MODE-005 Auto Mode
- 사용자가 mode를 직접 선택하지 않아도 요청을 분류.
- `src/mode/modeClassifier.ts`
- P1

## MODE-006 Sticky mode
- 이전 turn의 active mode를 다음 turn에서 유지.
- P1

## MODE-007 Plan V2 sticky state
- Plan V2 research/planning/review 중에는 Plan mode 유지.
- P1

## MODE-008 Manual mode override
- 사용자가 Ask/Plan/Debug/Agent를 명시하면 classifier를 건너뜀.
- P0

## MODE-009 Plan → Agent handoff
- 승인된 Plan을 Agent mode로 넘김.
- 관련: `src/plan/PlanToAgent.ts`
- P1

---

# 8. Agent Loop

## AGENT-001 AgentLoopController
- 핵심 Agent 실행 루프.
- 관련: `src/loop/AgentLoopController.ts` (대형)
- P0

## AGENT-002 Multi-turn execution
- 여러 turn에 걸쳐 작업 지속.
- P0

## AGENT-003 Tool loop
- LLM → tool → result → LLM 반복.
- P0

## AGENT-004 Tool execution
- read/edit/write/search/terminal 등 tool 실행.
- P0

## AGENT-005 Context assembly
- 현재 요청에 필요한 context를 구성.
- `ContextAssembler.ts`
- P0

## AGENT-006 Context compaction
- 긴 대화를 압축하여 context budget을 유지.
- `CompactionEngine.ts` (`src/compaction/`)
- P0

## AGENT-007 Tool-call preservation during compaction
- compaction 시 toolCalls/toolCallId 보존.
- tool call pair가 깨지지 않도록 하는 안정성 기능.
- P0 / SAFE

## AGENT-008 Max turns
- tier/model별 또는 global max turn 제한.
- P0

## AGENT-009 Turn timeout
- 일정 시간 동안 progress가 없을 때 Agent run 종료.
- `turnTimeout.ts`
- P1

## AGENT-010 Doom loop detection
- 동일 tool/error/행동 반복 감지.
- `DoomLoopDetector.ts`, `DoomLoopHandler.ts`
- P0 / SAFE

## AGENT-011 Error recovery
- tool/model/runtime 오류 이후 회복.
- P0

## AGENT-012 Weak final answer detection
- Agent가 너무 일찍 종료하는지 판단하는 classifier.
- P1

## AGENT-013 Closing summary detection
- 정상 종료인지 판단.
- P1

## AGENT-014 Continue-work detection
- 아직 작업이 남았는지 판단.
- P1

## AGENT-015 Broken tool payload detection
- 자연어로 잘못 출력된 tool payload 등을 감지.
- P1

## AGENT-016 Classifier diagnostics
- classifier 결과를 Extension Host console에 기록.
- P2 / DEBUG

## AGENT-017 Parallel executor
- 병렬 tool/작업 실행 지원.
- `ParallelExecutor.ts`, `parallelRead.ts`
- P1

## AGENT-018 Streaming tool executor
- streaming 중 tool 실행.
- `StreamingToolExecutor.ts`
- P1

## AGENT-019 Synthesize instructions
- 실행 중 지시 재합성.
- `synthesizeInstructions.ts`
- P1

---

# 9. Tool System

## TOOL-001 Read tools
- 파일 읽기.
- 최대 line 제한.
- `readTools.ts`
- P0

## TOOL-002 Edit tools
- 기존 파일 수정.
- `editTools.ts`
- P0

## TOOL-003 Write tools
- 새 파일 생성/쓰기.
- P0

## TOOL-004 Search / grep
- 프로젝트 검색.
- P0

## TOOL-005 Glob/path search
- 파일 탐색.
- P0

## TOOL-006 Terminal executor
- shell/terminal 실행.
- timeout 적용.
- deny pattern 적용.
- `TerminalTool.ts`
- P0 / SAFE

## TOOL-007 AskQuestionTool
- Agent가 사용자에게 추가 질문.
- `AskQuestionTool.ts`
- P1

## TOOL-008 Tool call parser
- provider별 tool-call 응답 파싱.
- `ToolCallParser.ts`
- P0

## TOOL-009 Executor abstraction
- tool execution lifecycle.
- `executors.ts`
- P0

## TOOL-010 Write executor
- write/edit 결과 처리.
- `writeExecutors.ts`
- P0

## TOOL-011 TodoWriteTool
- Todo 목록 관리.
- `TodoWriteTool.ts`
- P1

## TOOL-012 TaskTool / SubAgent orchestration
- Subagent task 생성/결과 수신.
- `TaskTool.ts`, `SubAgentResult.ts`
- P1

## TOOL-013 SkillTool
- Skill 호출.
- `SkillTool.ts`
- P1

## TOOL-014 Browser tool group
- Browser automation tools.
- `BrowserToolGroup.ts`
- P1

## TOOL-015 Debug tools
- Add/Remove Instrumentation, Collect Logs, Request Reproduce.
- `src/tools/debug/*`
- P1

## TOOL-016 Tool registry
- tool 등록/조회.
- `registry.ts`
- P0

## TOOL-017 Parallel search
- 병렬 검색.
- `ParallelSearch.ts`
- P1

---

# 10. Permission / Safety / Verification

## SAFE-001 Permission gate
- tool 실행 전에 permission 정책 확인.
- ask / accept_edits / auto / bypass.
- `PermissionGate.ts`, `ApprovalUI.tsx`
- P0

## SAFE-002 Deny globs
기본적으로 다음 계열을 차단.
- `.env*`
- `secrets/**`
- `id_rsa*`
- `*.pem`
- `.git/**`
- `node_modules/**`
- P0

## SAFE-003 Terminal deny patterns
- `rm -rf /`
- `mkfs`
- `dd if=`
- fork bomb 패턴 등.
- P0

## SAFE-004 Write gate
- Agent write를 정책에 따라 차단/허용.
- `writeGate.ts` (plan)
- P0

## SAFE-005 Secret scan / Secrets Vault
- 민감 정보가 변경/전송되는 상황을 검사.
- `SecretsVault.ts`, `SecretManager.ts`
- P1 / SAFE

## SAFE-006 Checkpoint
- 위험한 multi-file edit 전에 checkpoint 생성.
- `CheckpointManager.ts`
- P1

## SAFE-007 Verification-first
- broad edit 전에 검증/탐색을 우선.
- `VerificationFirstPrompt.ts`
- P1

## SAFE-008 Verification micro-loop
- edit → verify → fix → verify 반복.
- P1

## SAFE-009 Related test execution
- edit/write 후 관련 test 실행 옵션.
- `TestRunner.ts`, `TestFinder.ts`, `LintRunner.ts`
- P1

## SAFE-010 Hooks system
- Agent turn 주변 lifecycle hook.
- `HookSystem.ts`, `autoVerificationHook.ts`, `injectVerificationError.ts`, `askOnMaxRetries.ts`
- P1 / SAFE

---

# 11. Plan Mode V1

## PLAN-001 Plan Mode controller
- Plan lifecycle 관리.
- `PlanModeController.ts`
- P1

## PLAN-002 Research
- workspace 탐색/근거 수집.
- `ResearchPhase.ts`
- P1

## PLAN-003 Clarifying Questions
- 계획 전에 요구사항 명확화.
- `ClarifyingQuestions.tsx`
- P1

## PLAN-004 Plan generation
- 구조화된 구현 계획 생성.
- `PlanGenerator.ts`
- P1

## PLAN-005 Plan review
- 생성된 계획 검토.
- `PlanReview.tsx`
- P1

## PLAN-006 Plan storage
- 계획 저장/재사용.
- `PlanStorage.ts`
- P1

## PLAN-007 Plan promotion
- Plan을 실행 단계로 전환.
- `PlanToAgent.ts`, `planPromote.ts`
- P1

## PLAN-008 Plan editor / history
- Plan 편집·이력 UI.
- `PlanEditor.tsx`, `PlanHistory.tsx`
- P1

## PLAN-009 Plan enforcement / context injection
- Plan 준수 강제, context 주입.
- `PlanEnforcement.ts`, `PlanContextInjection.ts`
- P1

## PLAN-010 Failure recovery / complexity / todo branching
- 실패 복구, 복잡도 휴리스틱, Todo 분기.
- `FailureRecovery.ts`, `ComplexityHeuristic.ts`, `TodoBranching.ts`
- P1

---

# 12. Plan V2

## PLAN2-001 PlanSession
- Plan 전체 lifecycle의 상태 객체.
- `PlanSession.ts`
- P1

## PLAN2-002 PlanEvent
- Plan 상태 변화/이벤트 구조.
- `PlanEvent.ts`
- P1

## PLAN2-003 PlanPhaseTransitions
- research → planning → review → execute 등의 phase transition.
- `PlanPhaseTransitions.ts`
- P1

## PLAN2-004 PlanV2Generator
- Plan V2 구조화 계획 생성.
- `PlanV2Generator.ts`
- P1

## PLAN2-005 LiteLLMPlanModel
- Plan 전용 LLM provider abstraction.
- `LiteLLMPlanModel.ts`
- P1

## PLAN2-006 WorkspaceContext
- Plan 생성에 workspace context 제공.
- `workspaceContext.ts`
- P1

## PLAN2-007 EvidenceEngine
- 계획을 뒷받침하는 workspace evidence 관리.
- `EvidenceEngine.ts`
- P1

## PLAN2-008 FailureContext
- 이전 실패/오류 정보를 Plan에 전달.
- `FailureContext.ts`
- P1

## PLAN2-009 SchemaValidator
- Plan 구조 schema validation.
- `SchemaValidator.ts`
- P1

## PLAN2-010 SemanticValidator
- Plan 의미/논리 검증.
- `SemanticValidator.ts`
- P1

## PLAN2-011 File intent resolution
- Plan에서 실제 대상 파일을 결정.
- `resolvePlanFileTargets.ts`
- P1

## PLAN2-012 Markdown rendering
- 구조화 Plan을 Markdown으로 렌더링.
- `renderPlanMarkdown.ts`
- P1

## PLAN2-013 Observed tool call
- Plan 실행 중 관찰된 tool call을 구조화.
- `toObservedToolCall.ts`
- P1

## PLAN2-014 Plan watchdog
- Plan generation hang 감시.
- (chat `planV2GenerateWatchdog.ts`와 연계)
- P1

## PLAN2-015 PlanModeControllerAdapter
- V1 controller와 V2 연결 어댑터.
- `PlanModeControllerAdapter.ts`
- P1

---

# 13. Plan Execution Engine

## EXEC-001 Execution Plan build
- 승인된 Plan을 실행 가능한 Task graph로 변환.
- `buildExecutionPlan.ts`
- P1

## EXEC-002 Execution Context validation
- 실행 환경 검증.
- `validateExecutionContext.ts`
- P1

## EXEC-003 Execution Plan validation
- 실행 계획 구조 검증.
- `validateExecutionPlan.ts`
- P1

## EXEC-004 Plan phase mapping
- Plan phase → task 매핑.
- `mapPlanPhase.ts`
- P1

## EXEC-005 Task inference
- 계획에서 실제 실행 task를 추론.
- `inferTaskExecution.ts`
- P1

## EXEC-006 Task prompt generation
- 각 task용 Agent/Subagent prompt 생성.
- `planTaskPrompt.ts`
- P1

## EXEC-007 Task scheduler
- task 순서/병렬성 관리.
- `taskScheduler.ts`
- P1

## EXEC-008 Plan execution engine
- task 실행 lifecycle.
- `planExecutionEngine.ts`
- P1

## EXEC-009 Execution persistence
- 실행 상태 저장.
- `planExecutionPersistence.ts`
- P1

## EXEC-010 Execution diagnostics
- 실행 실패/진단 정보 생성.
- `executionDiagnostics.ts`, `diagnosticToWorkEvent.ts`
- P1

## EXEC-011 Execution presentation
- 실행 상태를 UI에 표시.
- `planExecutionPresentation.ts`
- P1

## EXEC-012 Subagent task bridge
- Plan task를 Subagent로 연결.
- `subagentTaskBridge.ts`
- P1

---

# 14. Subagent

## SUB-001 Subagent task model
- status: queued/running/completed/failed/cancelled.
- role: research/coding/review/debug/general.
- `subagents.ts`
- P1

## SUB-002 Subagent creation
- parent turn에 연결된 독립 task 생성.
- P1

## SUB-003 Subagent runner
- Subagent 실행 lifecycle.
- `subagentRunner.ts`
- P1

## SUB-004 Subagent Agent Loop executor
- Subagent 자체 Agent loop 실행.
- `subagentAgentLoopExecutor.ts`
- P1

## SUB-005 Subagent result
- 결과/오류/상태 반환.
- P1

## SUB-006 Subagent cancellation
- 실행 중 cancel.
- P1

## SUB-007 Subagent lifecycle guard
- terminal 상태의 task가 다시 running으로 resurrect되지 않도록 보호.
- P1 / SAFE

## SUB-008 Subagent roles
- research / coding / review / debug / general

## SUB-009 Subagent description
- UI에 표시할 짧은 task description.
- P1

## SUB-010 Subagent detail view
- 실행 상세 확인.
- `SubagentDetailView.tsx`
- P1 / UX

## SUB-011 Subagent run row
- timeline에 subagent 실행 표시.
- `SubagentRunRow.tsx`
- P1

## SUB-012 Subagent changes card
- Subagent가 만든 변경 표시.
- `SubagentChangesCard.tsx`
- P1

## SUB-013 Subagent result presentation
- 결과를 Conversation layer로 전달.
- P1

## SUB-014 Subagent worktree
- Subagent 전용 worktree 연동.
- `subagentWorktree.ts`, `subagentWorktreeReview.ts`
- P1

---

# 15. Git Worktree / Patch

## WT-001 Worktree manager
- Managed git worktree lifecycle.
- `WorktreeManager.ts`, `src/host/worktreeManager.ts`
- P1

## WT-002 Worktree creation
- Agent/Subagent 작업용 isolated worktree 생성.
- P1

## WT-003 Worktree registry
- 생성된 worktree 추적.
- P1

## WT-004 Worktree path validation
- 허용된 managed worktree 경로인지 검증.
- P1 / SAFE

## WT-005 Worktree isolation
- Subagent별 변경사항을 main workspace와 분리.
- P1

## WT-006 Worktree snapshot
- 작업 시점 상태 snapshot.
- P1

## WT-007 Worktree diff
- tracked/untracked 변경 확인.
- P1

## WT-008 Git porcelain parsing
- git status porcelain 처리.
- P1

## WT-009 Patch validation
- `git apply --check` 등 사전 검증.
- `src/patches/` (applier, merger, staleness)
- P1 / SAFE

## WT-010 Patch apply
- 검증된 변경을 main workspace에 적용.
- P1

## WT-011 Untracked file transfer
- untracked 파일을 별도 처리.
- P1

## WT-012 Worktree review
- 적용 전 변경 검토.
- P1

## WT-013 Diff review panel
- 변경 내용을 UI에서 확인.
- P1

## WT-014 Adopt / reject
- Subagent 결과를 채택/거부.
- `AdoptWinner.ts`
- P1

## WT-015 Subagent worktree bridge
- Host ↔ Agent ↔ Worktree 연결.
- P1

> **주의:** Worktree apply lifecycle은 새 프로젝트에서 반드시 transaction/rollback 관점으로 다시 검증해야 한다. tracked patch 적용 후 untracked copy 실패 같은 부분 실패가 전체 상태를 오염시키지 않는지 별도 테스트한다.

---

# 16. Inline Edit / Completion

## INLINE-001 Inline Edit command
- VS Code selection을 대상으로 수정 요청.
- `InlineEditController.ts`, `inlineEdit.ts`
- P1

## INLINE-002 Selection context
- 현재 editor selection을 Agent context로 전달.
- P1

## INLINE-003 Inline edit generation
- 선택 코드의 수정안 생성.
- P1

## INLINE-004 Inline edit diff
- 원본/수정안 비교.
- `InlineEditDiff.tsx`
- P1

## INLINE-005 Inline edit review
- Accept/Reject 등 review lifecycle.
- `inlineEditReview.ts`
- P1

## INLINE-006 Selection diff apply
- 승인된 변경을 실제 editor/file에 반영.
- `SelectionDiffApply.ts`
- P1

## INLINE-007 Inline Completion
- 인라인 자동완성 provider.
- `InlineCompletionProvider.ts`
- P1

---

# 17. Provider Architecture

## PROVIDER-001 Provider type detection
- provider 종류 자동 식별.
- `detectProviderType.ts`
- P0

## PROVIDER-002 Provider registry
- provider 목록/metadata 관리.
- `ProviderRegistry.ts`
- P0

## PROVIDER-003 Provider connections
- 저장된 provider connection 관리.
- name/baseURL/models/health 등의 정보.
- `ProviderConnections.ts`
- P0

## PROVIDER-004 Provider profiles
- provider별 profile.
- `ProviderProfiles.ts`
- P0

## PROVIDER-005 Provider presets
- 사전 정의 provider 설정.
- `providerPresets.ts`
- P1

## PROVIDER-006 Provider fields
- provider별 설정 필드 정의.
- `providerFields.ts`
- P0

## PROVIDER-007 Provider status
- 연결 상태/health 상태 표현.
- `providerStatus.ts`
- P0

## PROVIDER-008 Provider health check
- provider 연결 검사.
- `HealthCheck.ts`
- P0

## PROVIDER-009 Provider probe
- 연결 테스트 및 model discovery 계층.
- P0

## PROVIDER-010 LiteLLM provider
- OpenAI-compatible/LiteLLM 경유 모델 사용.
- `LiteLLMProvider.ts`
- P0

## PROVIDER-011 OpenAI provider
- OpenAI 계열 connection support.
- P1

## PROVIDER-012 Anthropic provider
- Anthropic 계열 connection support.
- P1

## PROVIDER-013 Ollama provider
- Ollama connection support.
- P1

## PROVIDER-014 LM Studio provider
- LM Studio connection support.
- P1

## PROVIDER-015 OpenCode Zen / Go
- OpenCode Zen / Go connection/test/refresh.
- P1

## PROVIDER-016 DGX provider
- DGX 관련 provider.
- `DGXProvider.ts`
- P2

## PROVIDER-017 Secret manager (provider keys)
- API key 등 민감 정보 관리.
- `SecretManager.ts`
- P0 / SAFE

## PROVIDER-018 Tool result formatter
- tool 결과를 provider 형식으로 포맷.
- `ToolResultFormatter.ts`
- P1

---

# 18. Model Architecture

## MODEL-001 Model Registry
- 사용 가능한 model catalog.
- `ModelRegistry.ts`
- P0

## MODEL-002 Model Resolver
- logical model ID → 실제 provider/model resolution.
- `ModelResolver.ts`
- P0

## MODEL-003 Model Routing
- task/context에 맞는 model 선택 계층.
- `ModelRouting.ts`, `ModelRouter.ts`
- P0

## MODEL-004 Model normalization
- provider/model ID 표준화.
- `normalizeModelId.ts`
- P0

## MODEL-005 Model tags
- capability/tag 기반 모델 분류.
- `modelTags.ts`
- P1

## MODEL-006 Available models
- provider 연결 후 모델 discovery.
- P0

## MODEL-007 Composer model persistence
- 연결/선택된 모델 목록 저장.
- P0

## MODEL-008 Thinking capability
- model이 지원하는 reasoning/thinking 여부에 따라 UI/옵션 처리.
- P1

## MODEL-009 Tier-based turns
- Tier A/B model에 따라 max turns를 다르게 적용.
- `ModelTiers.ts` (harness)
- P1

## MODEL-010 Provider order
- 사용자 지정 provider order를 사용할 수 있는 설정.
- P1

## MODEL-011 Model context info
- context window 등 모델 메타.
- `modelContextInfo.ts`
- P1

> **중요한 이식 검토 포인트:** Provider/Model 구조 자체는 최종 브랜치에 존재하지만, "한 작업에서 여러 Provider를 상황별로 자동 사용하고 실패 시 fallback"하는 완전한 runtime policy는 별도 검증/구현 대상으로 분리한다. 새 프로젝트에서는 `ModelResolver`와 `ModelRouting`을 단순 dropdown 선택기와 분리한다.

---

# 19. Harness

## HARNESS-001 Harness enabled
- Agent turn 주변의 reliability behavior.
- P1

## HARNESS-002 Verification first
- broad edit 전에 verification 우선.
- P1

## HARNESS-003 Prefetch
- 필요한 context/tool 정보를 미리 준비.
- P1

## HARNESS-004 Verification micro-loop
- 작은 verify → fix cycle.
- P1

## HARNESS-005 Project rules loader
- 프로젝트 규칙을 읽어 Agent context에 반영.
- `ProjectRulesLoader.ts`
- P1

## HARNESS-006 Routing heuristics
- 요청 특성/모델 등에 따른 실행 판단 보조.
- `RoutingHeuristics.ts`
- P2

## HARNESS-007 Context rules / Cursor pattern / UX helpers
- `ContextRules.ts`, `CursorPattern.ts`, `UXForMedium.ts`, `DontDoMedium.ts`, `DesignSlogans.ts`, `AWhitelist.ts`, `HarnessDuties.ts`, `PromptTurnStructure.ts`, `MinimalMemories.ts`
- P1~P2

---

# 20. Project Intelligence / Context

## CTX-001 Context budget
- Agent context 사용량 제한.
- P0

## CTX-002 Read max lines
- 단일 read tool 호출의 최대 line 수 제한.
- P0

## CTX-003 Context assembler
- system/user/history/tool/project context 조합.
- P0

## CTX-004 Compaction engine
- 긴 context를 압축.
- P0

## CTX-005 Workspace context
- Plan V2/Agent에 workspace 정보 제공.
- P1

## CTX-006 Workspace index
- workspace 파일/구조 인덱싱.
- `WorkspaceIndexer.ts`
- P1

## CTX-007 Codebase index
- `@codebase` 검색.
- `CodebaseIndexer.ts`
- P1

## CTX-008 Semantic search
- 의미 기반 codebase 검색 계층.
- `SemanticSearch.ts`
- P1

## CTX-009 Mention extraction
- `@file`, `@codebase` 등 context mention 처리.
- `MentionExtractor.ts`
- P1

## CTX-010 File intent
- 요청에서 어떤 파일이 대상인지 추론/해결.
- P1

## CTX-011 Prefetch engine
- Agent 실행 전에 관련 정보 준비.
- `PrefetchEngine.ts`, `ContextBlockBuilder.ts`, `ideContextInjector.ts`, `lspCursorContext.ts`, `taskContextStrategy.ts`, `StackTraceParser.ts`
- P1

## CTX-012 Chat search index
- 채팅 내 검색.
- `ChatSearchIndex.ts`
- P2

---

# 21. Debug Mode

## DEBUG-001 Debug controller
- Debug session lifecycle.
- `DebugModeController.ts`
- P1

## DEBUG-002 Hypothesis
- 가능한 원인/가설 구조화.
- `HypothesisGenerator.ts`
- P1

## DEBUG-003 Reproduce
- 문제 재현 단계.
- `ReproduceRecorder.ts`, `ReproduceUI.tsx`
- P1

## DEBUG-004 Analyze
- 로그/코드/실행 결과 분석.
- `LogAnalyzer.ts`
- P1

## DEBUG-005 Fix
- 수정 수행.
- `TargetedFixGenerator.ts`
- P1

## DEBUG-006 Cleanup
- 디버깅용 임시 변경 정리.
- `VerifyCleanup.ts`
- P1

## DEBUG-007 Debug timeline
- 디버깅 과정을 timeline으로 표시.
- `DebugTimeline.tsx`
- P1

## DEBUG-008 Debug evidence
- 재현/분석 근거 저장.
- `BrowserEvidence.ts`, `DebugStorage.ts`
- P1

## DEBUG-009 Instrumentation
- 계측 추가/제거 패턴.
- `InstrumentationPatterns.ts`, debug tools
- P1

## DEBUG-010 Multi-file debug / templates / log server
- `MultiFileDebug.ts`, `Templates.ts`, `DebugLogServer.ts`, `DebugSessionStore.ts`
- P1~P2

---

# 22. Review / Agent Review

## REVIEW-001 Code Review session
- 별도의 Review workflow.
- P1

## REVIEW-002 Agent Review loop
- Agent가 자신의/다른 Agent의 변경을 검토.
- `AgentReviewLoop.ts`
- P1

## REVIEW-003 Review apply policy
- ask / auto / manual.
- P1

## REVIEW-004 Review checkpoint
- 위험한 적용 전에 checkpoint.
- P1

## REVIEW-005 Review diff
- 변경 내용 review.
- `DiffView.tsx`, `FindingList.tsx`
- P1

## REVIEW-006 Accept / Apply / Undo
- `AcceptFix.ts`, `ApplySelected.ts`, `Undo.ts`, `CheckboxSync.ts`, `KeyboardHandler.ts`, `PendingStore.ts`
- P1

---

# 23. Browser / Design Mode

## BROWSER-001 Browser session
- Browser session 시작.
- `BrowserSession.ts`
- P1

## BROWSER-002 Browser automation
- browser automation tools.
- `BrowserTools.ts`, `BrowserToolGroup.ts`
- P1

## BROWSER-003 Browser evidence
- browser 실행 결과를 Agent evidence로 사용.
- P1

## BROWSER-004 Browser preview
- `BrowserPreview.tsx`
- P1

## DESIGN-001 Design Mode
- UI 디자인/preview 작업용 overlay.
- `DesignModeOverlay.ts`, `DesignModePanel.tsx`, `DesignModeContext.ts`
- P1

## DESIGN-002 Design inspection workflow
- preview/디자인 작업과 Agent를 연결.
- P2

---

# 24. MCP

## MCP-001 MCP client
- MCP 서버 연결.
- `MCPClient.ts`
- P1

## MCP-002 MCP reload
- MCP server 설정 reload.
- P1

## MCP-003 MCP connect
- MCP server 연결.
- P1

## MCP-004 MCP disconnect
- 전체 연결 종료.
- P1

## MCP-005 MCP permissions
- MCP tool execution permission과 연결.
- P1 / SAFE

## MCP-006 Stdio MCP session / bootstrap / parse
- `StdioMcpSession.ts`, `bootstrapMcp.ts`, `parseMcpServers.ts`, `DeferredMCPTools.ts`
- P1

---

# 25. Skills

## SKILL-001 Skills system
- 반복 가능한 Agent capability를 skill 단위로 구성.
- `SkillRegistry.ts`
- P1

## SKILL-002 Skill discovery/loading
- 필요한 skill을 Agent runtime에서 사용.
- P2

## SKILL-003 Skill feature flag
- `features.skills`로 활성화.
- P1

---

# 26. Memories

## MEM-001 Memories
- 사용자/프로젝트 관련 memory 기능.
- SecretStorage 기반.
- `MemoryStore.ts`
- P1

## MEM-002 SecretStorage integration
- 민감한 memory/credential 저장.
- P1 / SAFE

## MEM-003 Memory feature flag
- `features.memories`.
- P1

## MEM-004 Auto memory detector
- `AutoMemoryDetector.ts`
- P2

---

# 27. GitHub integration

## GH-001 GitHub agent workflow
- GitHub 관련 Agent 작업.
- `GitHubAgent.ts`
- P1

## GH-002 GitHub token
- optional GitHub PAT 설정.
- P1 / SAFE

## GH-003 PR/Issue workflow
- PR/issue 관련 작업 지원.
- P1

---

# 28. Artifacts

## ART-001 Artifact store
- Agent 결과물/생성물 저장.
- `ArtifactStore.ts`
- P1

## ART-002 Artifact gallery
- UI에서 artifact 목록/결과 확인.
- `ArtifactGallery.tsx`
- P1

## ART-003 Artifact open command
- Gallery command 연결.
- P1

---

# 29. Best-of-N

## BON-001 Best-of-N execution
- 여러 후보 결과를 생성.
- `BestOfN.ts`
- P1

## BON-002 Candidate comparison
- 결과 비교.
- `ComparisonUI.tsx`
- P1

## BON-003 Candidate diff
- 후보별 변경 비교.
- P1

## BON-004 Adopt winner
- 선택한 결과를 채택.
- `AdoptWinner.ts`
- P1

## BON-005 Worktree isolation for candidates
- 후보별 독립 Worktree 사용.
- P1

---

# 30. SCM / Commit Message

## SCM-001 Commit message generator
- 변경 기반 커밋 메시지 생성.
- `CommitMessageGenerator.ts`
- P1

---

# 31. Telemetry / Cost

## TEL-001 Cost tracker
- 토큰/비용 추적.
- `CostTracker.ts`
- P1

## TEL-002 Status bar cost
- 상태바에 비용 표시.
- `StatusBarCost.ts`
- P1

## TEL-003 Telemetry collector
- 일반 텔레메트리 수집.
- `TelemetryCollector.ts`
- P2

---

# 32. Settings UI

## SET-001 Settings shell
- Settings panel.
- `SettingsPanel.tsx`
- P0

## SET-002 Models tab
- model/provider 관련 설정.
- `ModelsTab.tsx`
- P0

## SET-003 Context tab
- context/compaction 설정.
- `ContextTab.tsx`
- P1

## SET-004 Features tab
- feature flags.
- `FeaturesTab.tsx`
- P0

## SET-005 Harness tab
- harness 설정.
- `HarnessTab.tsx`
- P1

## SET-006 MCP tab
- MCP 설정.
- `McpTab.tsx`
- P1

## SET-007 Permission tab
- permission 설정.
- `PermissionTab.tsx`
- P0

## SET-008 Privacy tab
- privacy 관련 설정.
- `PrivacyTab.tsx`
- P1

## SET-009 Queue tab
- queue 동작 설정.
- `QueueTab.tsx`
- P1

## SET-010 Review tab
- review 정책.
- `ReviewTab.tsx`
- P1

## SET-011 Rules tab
- project rules.
- `RulesTab.tsx`
- P1

## SET-012 Terminal tab
- terminal timeout/deny 정책.
- `TerminalTab.tsx`
- P0

## SET-013 JSON config tab
- 고급 JSON 설정.
- `JsonConfigTab.tsx`
- P1

---

# 33. UI Components (요약)

## UI-001 ~ UI-023 (기존)
- AgentTurn, ConversationTurn, MessageBubble, TimelineStepCard, WorkTimeline
- FileEditCard, FileEditPreviewView, TerminalRunCard
- ChangeSummary, ChangedFilesBar, DiffReviewPanel, InlineEditDiff
- PlanExecutionStatus, PlanModeHeader
- SubagentRunRow, SubagentDetailView, SubagentChangesCard
- ExploreChrome, ChatSessionTabs, ModeSelector, ModelSelector
- ComposerPalette, MessageQueueUI

## UI-024 추가 참고
- StreamingMarkdown, MermaidDiagram, CodeBlock, VirtualList
- DebugModeUI, PlanningStatus, ModeBadge, MentionTrigger
- HistoryPanel, Icons, FileTypeIcon, TimelineGroup, TimelineCheckpoint

---

# 34. Cursor-style visual system

## CURSOR-001 Cursor UI base
- `cursor-ui.css` 기반 UI system.

## CURSOR-002 Conversation layout
- conversation layout styling.

## CURSOR-003 Conversation tabs
- tab styling.

## CURSOR-004 Composer polish
- composer visual polish.

## CURSOR-005 Workspace polish
- workspace 영역 polish.

## CURSOR-006 Conversation variants CSS
- variant별 presentation.

---

# 35. Provider / Composer UX 세부

## UXPROV-001 Connection test
- Provider connection test.

## UXPROV-002 Auto-refresh models
- connection 성공 후 model catalog refresh.

## UXPROV-003 Searchable model picker
- model을 입력해 필터.

## UXPROV-004 Saved connections
- provider connection 저장.

## UXPROV-005 Provider order
- provider 순서를 사용자 설정으로 사용할 수 있는 기반.

## UXPROV-006 Local-first auto resolve
- 기본 resolver가 local-first 정책을 사용할 수 있는 구조.

---

# 36. Reliability / Diagnostics

## REL-001 Classifier diagnostics
- 자연어 classifier 관찰.

## REL-002 Plan watchdog
- Plan generate hang 감지.

## REL-003 Streaming stabilization
- streaming state 안정화.

## REL-004 Turn state machine
- turn 상태 명시화.

## REL-005 Send epoch protection
- stale response 보호.

## REL-006 Regeneration safety
- regenerate 시 기존 turn과 새 turn 충돌 방지.

## REL-007 Tool payload validation
- malformed tool output 처리.

## REL-008 Compaction integrity
- tool call pair 보존.

---

# 37. Test Coverage Inventory (요약)

최종 브랜치에는 다음 계열의 테스트가 존재한다. (일부)

## TEST-001 Agent
- AgentLoopController, Subagent Worktree

## TEST-002 Chat / Streaming
- ChatSessionStore, Assistant Stream Session, Inline Edit, Plan V2 Watchdog, Regenerate Turn, Send Epoch, Turn State, Understanding Lead 등

## TEST-003 Core / Harness
- Runtime Services, Routing Heuristics, Project Rules Loader

## TEST-004 Host
- Subagent Host, Worktree Bridge/Registry, Timeline Labels

## TEST-005 Mode
- Mode Classifier

## TEST-006 Plan Execution / Plan V2
- Build Execution Plan, Diagnostics, Engine, Persistence, Presentation, Task Scheduler, Validators, Evidence, Session 등

## TEST-007 Provider
- Provider Connections, Zero-config Registry

## TEST-008 Tools / Conversation
- Windows grep, Terminal search, conversation work event, timeline presentation, subagent result 등

> 이식 시 “존재하는 테스트”와 “반드시 이식할 핵심 테스트”를 구분한다.

---

# 38. 실제 새 프로젝트 이식 순서

## Phase 0 — 뼈대
- [x] EXT-001~005
- [x] HOST-001~015
- [x] CFG-001~003

## Phase 1 — Provider abstraction을 먼저 고정
- [x] PROVIDER-001~014 (015~018 skipped this phase)
- [x] MODEL-001~011
- [x] CFG-008
- [x] UXPROV-001~006 (domain APIs; chat-ui picker later / CHAT-003)

**원칙:** Composer dropdown과 runtime provider routing을 처음부터 분리한다.

## Phase 2 — Agent Core
- [x] AGENT-001~019 (domain + unit tests; host wiring later)
- [x] TOOL-001~017 (R-005 contracts + unit tests)
- [x] CTX-001~005
- [x] SAFE-001~010
- [x] MODE-001~009
- [x] DEBUG-001~010 (domain; UI later)
- [x] REL-001~008
- [x] CFG-004~007, CFG-009~010

## Phase 3 — Chat / Streaming
- [ ] CHAT-001~011
- [ ] STREAM-001~010
- [ ] CONV-001~020

## Phase 4 — Worktree / Patch
- [ ] WT-001~015

## Phase 5 — Subagent
- [ ] SUB-001~014

## Phase 6 — Plan V1/V2 + Execution
- [ ] PLAN-001~010
- [ ] PLAN2-001~015
- [ ] EXEC-001~012

## Phase 7 — Coding UX
- [ ] INLINE-001~007
- [ ] REVIEW-001~006

## Phase 8 — Intelligence / integrations
- [ ] CTX-006~012
- [ ] HARNESS-001~007
- [ ] BROWSER-001~004
- [ ] DESIGN-001~002
- [ ] MCP-001~006
- [ ] SKILL-001~003
- [ ] MEM-001~004
- [ ] GH-001~003
- [ ] ART-001~003
- [ ] BON-001~005
- [ ] SCM-001
- [ ] TEL-001~003

## Phase 9 — Settings / UI polish
- [ ] SET-001~013
- [ ] UI-001~024
- [ ] CURSOR-001~006

## Phase 10 — 통합 검증
- [ ] Provider → Agent → Tool → Context → Chat 전체 흐름
- [ ] Plan → Task → Subagent → Worktree → Review → Adopt
- [ ] Auto Mode → Agent/Plan/Debug/Ask 전환
- [ ] Streaming → Stop → Queue → Regenerate
- [ ] Inline Edit → Diff → Apply
- [ ] Provider failure → fallback/routing
- [ ] Worktree partial failure → rollback/recovery
- [ ] Cost/Telemetry 동작
- [ ] Hooks + Verification micro-loop

---

# 39. 새 프로젝트에서 반드시 분리해야 하는 핵심 계층

```text
UI
 ↓
Conversation / Presentation
 ↓
Application Commands
 ↓
Mode / Orchestration
 ↓
Agent Runtime
 ↓
Tool Runtime
 ↓
Provider Runtime
 ↓
Infrastructure
```

병렬 작업 축:

```text
Agent Runtime
 ├── Main Agent
 ├── Subagent Runtime
 └── Worktree Runtime
```

Plan 축:

```text
Plan Domain
 ├── Plan V1
 ├── Plan V2
 ├── Execution Plan
 ├── Scheduler
 └── Diagnostics
```

---

# 40. 최우선 재설계 포인트

## R-001 Provider Routing
현재 최종 브랜치에는 Provider Registry/Profile/Connection/Model Registry/Resolver/Routing 계층이 존재한다. 그러나 새 프로젝트에서는 이를 단순 Composer 선택 기능과 결합하지 않는다.

목표:

```text
User Request
   ↓
Task Classification
   ↓
Capability Requirement
   ↓
Model Router
   ├── Planning Provider
   ├── Coding Provider
   ├── Fast Provider
   ├── Vision Provider
   ├── Local Provider
   └── Fallback Provider
```

## R-002 Conversation/Event 분리
UI가 자연어 문자열을 보고 tool/edit/terminal을 다시 추측하지 않도록 한다.

```text
Runtime Event
    ↓
Typed Work Event
    ↓
Conversation Model
    ↓
Presentation
```

## R-003 Subagent/Worktree transaction
Subagent 결과 적용은 다음 lifecycle로 고정한다.

```text
Prepare
 ↓
Validate
 ↓
Snapshot
 ↓
Apply
 ↓
Verify
 ↓
Commit/Adopt

failure → rollback
```

## R-004 Plan execution state machine

```text
PlanCreated
 → Researching
 → Planned
 → Reviewing
 → Approved
 → Executing
 → Verifying
 → Completed / Failed / Cancelled
```

## R-005 Tool contract
모든 tool은 다음을 명시한다.

- input schema
- output schema
- permission requirement
- cancellation behavior
- timeout behavior
- error contract
- retry policy
- timeline event

---

# 41. 최종 이식 체크리스트

각 기능마다 다음 8개를 체크한다.

1. `[ ]` Domain type 존재
2. `[ ]` Runtime 구현 존재
3. `[ ]` Host bridge 연결
4. `[ ]` UI 연결
5. `[ ]` Config/feature flag 연결
6. `[ ]` Error/cancel 처리
7. `[ ]` Unit test
8. `[ ]` 실제 E2E 검증

**8개가 모두 끝나야 기능을 `[x]`로 표시한다.**

---

# 42. Canonical Source Map (주요)

## Agent / Loop
- `src/loop/AgentLoopController.ts`
- `src/agent/ContextAssembler.ts`
- `src/agent/modeRegistry.ts`
- `src/agent/subagents.ts`
- `src/agent/subagentRunner.ts`
- `src/agent/subagentAgentLoopExecutor.ts`
- `src/agent/subagentWorktree.ts`
- `src/agent/subagentWorktreeReview.ts`
- `src/agent/thinkingEffort.ts`
- `src/compaction/CompactionEngine.ts`

## Chat
- `src/chat/ChatApp.tsx`
- `src/chat/ChatSessionStore.ts`
- `src/chat/assistantStreamSession.ts`
- `src/chat/turnState.ts`
- `src/chat/sendEpoch.ts`
- `src/chat/regenerateTurn.ts`
- `src/chat/understandingLead.ts`
- `src/chat/inlineEdit.ts`
- `src/chat/inlineEditReview.ts`
- `src/chat/protocol.ts`
- `src/chat/conversation/*`

## Plan
- `src/plan/PlanModeController.ts`
- `src/plan/PlanStorage.ts`
- `src/plan/execution/*`
- `src/plan/v2/*`

## Providers
- `src/providers/*` (Registry, Connections, Profiles, ModelRegistry, ModelResolver, ModelRouting, LiteLLMProvider, ToolCallParser 등)

## Host
- `src/host/*`

## Worktree / Patch
- `src/worktree/WorktreeManager.ts`
- `src/worktree/BestOfN.ts`
- `src/worktree/AdoptWinner.ts`
- `src/patches/*`

## Settings
- `src/settings/SettingsPanel.tsx`
- `src/settings/tabs/*`

## 기타 주요
- `src/debug/*`
- `src/harness/*`
- `src/hooks/*`
- `src/mcp/*`
- `src/memories/*`
- `src/skills/*`
- `src/telemetry/*`
- `src/scm/CommitMessageGenerator.ts`
- `src/sidechat/SideChatSession.ts`
- `src/verification/*`
- `src/checkpoint/CheckpointManager.ts`
- `src/secrets/SecretsVault.ts`
- `src/indexing/*`
- `src/prefetch/*`
- `src/review/*`
- `src/browser/*`
- `src/inline/*`
- `src/tools/*`

---

# 43. 최종 판단

`v2.1-PRODUCTION-MODE`는 단순 Chat extension이 아니라 다음을 하나로 묶은 **Agent IDE runtime**이다.

```text
Chat + Side Chat
+ Agent Loop + Tools + Context + Compaction
+ Modes (Ask / Agent / Plan / Debug / Auto)
+ Plan V1 + Plan V2 + Execution Engine
+ Subagent + Worktree + Best-of-N
+ Review + Inline Edit/Completion
+ Provider / Model / Routing
+ Workspace Intelligence + Prefetch
+ Browser + Design Mode
+ MCP + Skills + Memories
+ GitHub + Artifacts + SCM
+ Telemetry / Cost
+ Hooks + Verification + Checkpoint + Secrets
+ Settings + Cursor-style Conversation UI
```

새 프로젝트에서는 **기능을 파일 단위로 복사하지 말고 위 ID 단위로 이식**한다.

특히 아래 5개는 새 아키텍처의 핵심 축으로 먼저 고정한다.

1. **Provider / Model abstraction**
2. **Agent Runtime / Tool contract**
3. **Typed Conversation / Work Event**
4. **Subagent + Worktree isolation (transaction)**
5. **Plan V2 + Execution orchestration**

그 위에 UI와 integrations를 얹는다.

---

## Source note

이 문서는 `v2.1-PRODUCTION-MODE` 브랜치의 repository tree, 원본 Feature Master 문서, 실제 `src/` 경로를 대조하여 보완한 **이식용 기능 인벤토리 Final**이다.  
기능 존재와 실제 완성/검증 상태는 구분해야 하며, 이식 시마다 8항목 체크리스트를 적용한다.

**본 Final에서 원본 대비 추가·보강한 주요 항목**
- Side Chat (CHAT-010)
- Telemetry / Cost (TEL-001~003)
- SCM Commit Message (SCM-001)
- Hooks system (SAFE-010)
- Patches 명시 (WT-009 등)
- Inline Completion (INLINE-007)
- Verification 세부 (SAFE-009, verification/*)
- Secrets Vault 명시
- Host Worktree manager (HOST-015)
- Plan V1 부가 기능 (PLAN-008~010)
- Plan V2 Adapter (PLAN2-015)
- Agent 병렬/스트리밍 tool executor 등
- Settings JSON tab, Prefetch 세부, Debug 세부 등
