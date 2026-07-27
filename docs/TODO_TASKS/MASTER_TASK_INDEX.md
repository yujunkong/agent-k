# MASTER TASK INDEX - Agent-K Extension

> **전체 태스크 인덱스 + 진행률 대시보드**
> **Generated**: 2026-07-25 · **Updated**: 2026-07-27 (SUBAG next)  
> **Source**: PRD C0-C7 + Runbook + Harness/Specs + [`docs/addon.md`](../addon.md) + [`PRD-Subagents`](../PRDs/08_Subagents/PRD-Subagents.md)  
> **Total Tasks**: ~344 | **Phases**: 8 (C0-C7) + HARB + ADDON + **SUBAG**

---

## 📊 전체 진행률 대시보드

| Phase | 태스크 수 | 완료 | 진행중 | 대기 | 완료율 | 상태 |
|-------|-----------|------|--------|------|--------|------|
| **SUBAG** Cursor-style subagents | 11 | 0 | 0 | 11 | 0% | 🔜 **다음 착수** |
| **ADDON** addon.md 갭 | 18 | 18 | 0 | 0 | 100% | ✅ T01–T18 done |
| **C0** Chat UI + Streaming + Settings | 39 | 39 | 0 | 0 | 100% | ✅ 완료 |
| **C1** Ask Mode (Read-Only) | 28 | 28 | 0 | 0 | 100% | ✅ 완료 |
| **C2** Agent Single Turn | 35 | 35 | 0 | 0 | 100% | ✅ 완료 |
| **C3** Agent Multi-Turn + Resynthesize | 33 | 33 | 0 | 0 | 100% | ✅ 완료 |
| **C4** Infrastructure | 42 | 42 | 0 | 0 | 100% | ✅ 완료 |
| **C5** Plan Mode | 25 | 13 | 12 | 0 | 52% | 🔄 13/25 done · 12 rework |
| **C6** Debug Mode | 29 | 0 | 29 | 0 | 0% | 🔄 rework (29) |
| **C7** Production Grade | 46 | 0 | 46 | 0 | 0% | 🔄 rework (46) |
| **HARB** Harness/Specs (병렬) | 38 | 38 | 0 | 0 | 100% | ✅ 전체 완료 |
| **TOTAL** | **~344** | **228** | **87** | **29** | **~66%** | SUBAG 11 pending |

---

## 🎯 마일스톤

| 마일스톤 | 목표일 | 기준 Phase | 완료 조건 |
|----------|--------|------------|-----------|
| **M14: Cursor-style Subagents** | ☐ | SUBAG | Registry·explore·depth·UI·background·resume (T01–T11) |
| **M11: addon.md P0 갭** | ✅ | ADDON | Test 검증·wall timeout·Plan write 게이트·컨텍스트 전략 (T01–T05, T18) |
| **M12: addon.md P1 UX** | ✅ | ADDON | 세션 영속·체크포인트·규칙·Task 격리·슬래시·Status Bar·LSP (T06–T12) |
| **M13: addon.md P2 확장** | ✅ | ADDON | BoN·Review LM·MCP budget·Side chat·Semantic (T13–T17) |
| **M1: 채팅 셸 완성** | ✅ 완료 | C0 | 사이드바 + 스트리밍 + 모드 + Provider + **Settings Hub 뼈대** |
| **M2: Ask 모드 동작** | ✅ 완료 | C1 | 읽기 도구 8개 병렬 실행 + 프리페치 + 쓰기 완전 차단 |
| **M3: 첫 쓰기 성공** | ✅ 완료 | C2 | Search-Replace edit + Diff 승인 + 자동 린트 검증 |
| **M4: 멀티턴 루프 완성** | ✅ 완료 | C3 | 코어 루프 + maxTurns + Doom Loop + **Interrupt & Resynthesize** |
| **M5: 제품급 인프라** | ✅ 완료 | C4 | 권한/체크포인트/컴팩션/훅 + Memories + Side Chat |
| **M6: Plan 모드 완성** | ✅ 완료 | C5 | 질문 UI/Mermaid 플랜 + 승인/에이전트 전환 + TODO 분기 |
| **M7: Debug 모드** | ✅ 완료 | C6 | 가설-계측-재현-분석-수정-청소 전 사이클 |
| **M8: Cursor급 확장** | ✅ 완료 | C7 | Browser/Worktree/Review/MCP/Skills/Artifacts 전 기능 |
| **M9: 하네스 검증 통과** | ✅ 완료 | HARB | Phase A+B (T01~T19) 완료 — 4개 수용 테스트 스위트 구현 |
| **M10: Specs + Tools + Bench** | ✅ 완료 | HARB | T20~T38 Spec 7개 + Tools A~G + Bench 3종 + Docs |

---

## 📋 Phase별 태스크 상세 인덱스

### 🔜 SUBAG: Cursor-style Subagents (11 tasks) — **다음 착수**

> 상세·의존성: [`tasks/SUBAG/README.md`](./tasks/SUBAG/README.md) · PRD: [`../PRDs/08_Subagents/PRD-Subagents.md`](../PRDs/08_Subagents/PRD-Subagents.md)

| # | Task ID | 제목 | 우선순위 | 상태 | 의존성 |
|---|---------|------|----------|------|--------|
| 1 | SUBAG-T01 | AgentDefinition + AgentRegistry | P0 | ☐ | — |
| 2 | SUBAG-T02 | Builtin explore | P0 | ☐ | T01 |
| 3 | SUBAG-T03 | task_run subagent_type + shell/browser | P0 | ☐ | T02 |
| 4 | SUBAG-T04 | Depth=1 가드 + rules 요약 | P0 | ☐ | T03 |
| 5 | SUBAG-T05 | model inherit/fast + readonly | P1 | ☐ | T04 |
| 6 | SUBAG-T06 | SubAgentCard UI | P1 | ☐ | T03 |
| 7 | SUBAG-T07 | Background 디스패치 | P1 | ☐ | T05 |
| 8 | SUBAG-T08 | maxConcurrent fan-out | P1 | ☐ | T07 |
| 9 | SUBAG-T09 | Resume + transcript | P2 | ☐ | T07 |
| 10 | SUBAG-T10 | worktree compose | P2 | ☐ | T05 |
| 11 | SUBAG-T11 | 스모크 + 위임 프롬프트 | P0 | ☐ | T04 |

### 🟢 ADDON: docs/addon.md 갭 (18 tasks) — **전부 완료**

> 상세·의존성: [`tasks/ADDON/README.md`](./tasks/ADDON/README.md) · DONE: [`../DONE_TASKS/ADDON/`](../DONE_TASKS/ADDON/)

| # | Task ID | 제목 | 우선순위 | 상태 | 의존성 |
|---|---------|------|----------|------|--------|
| 1 | ADDON-T01 | 관련 테스트 자동 검증 루프 | P0 | ✅ | — |
| 2 | ADDON-T02 | Run/Turn wall-clock 타임아웃 | P0 | ✅ | — |
| 3 | ADDON-T03 | Plan/write 강제 게이트 | P0 | ✅ | — |
| 4 | ADDON-T04 | 작업유형별 컨텍스트 전략 | P0 | ✅ | — |
| 5 | ADDON-T05 | IDE 컨텍스트 안정 주입 | P0 | ✅ | T04 |
| 6 | ADDON-T18 | P0 수용 스모크 | P0 | ✅ | T01–T04 |
| 7 | ADDON-T06 | Session 호스트 영속 통합 | P1 | ✅ | — |
| 8 | ADDON-T07 | 체크포인트 + 롤백 UX | P1 | ✅ | — |
| 9 | ADDON-T08 | 규칙 파일 자동 로드 | P1 | ✅ | — |
| 10 | ADDON-T09 | Task 서브에이전트 격리 | P1 | ✅ | — |
| 11 | ADDON-T10 | 슬래시 명령 UX | P1 | ✅ | — |
| 12 | ADDON-T11 | 토큰·비용 Status Bar | P1 | ✅ | — |
| 13 | ADDON-T12 | LSP 커서 컨텍스트 깊이 | P1 | ✅ | T05 |
| 14 | ADDON-T13 | Worktree Best-of-N UX | P2 | ✅ | — |
| 15 | ADDON-T14 | Agent Review LM 루프 | P2 | ✅ | — |
| 16 | ADDON-T15 | MCP deferred 예산 | P2 | ✅ | — |
| 17 | ADDON-T16 | Side chat stub 해소 | P2 | ✅ | — |
| 18 | ADDON-T17 | 시맨틱 검색 기반 | P2 | ✅ | — |

### 🟢 C0: Chat UI + Streaming + Settings Hub (39 tasks)

| # | Task ID | 제목 | 파일/모듈 | 우선순위 | 상태 | 의존성 |
|---|---------|------|-----------|----------|------|--------|
| 1 | C0-T01 | 확장 스캐폴드 생성 (package.json, tsconfig, ESBuild) | `package.json`, `tsconfig.json`, `esbuild.js` | P0 | ✅ | 2026-07-25 abc1234 | - |
| 2 | C0-T02 | Webview ViewProvider 등록 (`agent-k.chat`) | `src/extension.ts`, `src/chat/ChatViewProvider.ts` | P0 | ✅ | T01 |
| 3 | C0-T03 | Vite + React + TypeScript 웹뷰 셋업 (HMR) | `vite.config.ts`, `src/chat/ChatApp.tsx` | P0 | ✅ | T01 |
| 4 | C0-T04 | 메시지 버블 UI (User/Assistant/Tool/System) | `src/chat/components/MessageBubble.tsx` | P0 | ✅ | T03 |
| 5 | C0-T05 | VirtualList 구현 (100+ 메시지 60fps) | `src/chat/components/VirtualList.tsx` | P0 | ✅ | T03 |
| 6 | C0-T06 | 스트리밍 파이프라인 (AbortController + 토큰 단위 렌더링) | `src/chat/hooks/useChatStream.ts` | P0 | ✅ | T03 |
| 7 | C0-T07 | Stop / Regenerate 버튼 + 키보드 단축키 | `src/chat/components/Composer.tsx` | P0 | ✅ | T06 |
| 8 | C0-T08 | StreamingMarkdown 파서 (증분 파싱 + Shiki 하이라이트) | `src/chat/StreamingMarkdown.tsx` | P0 | ✅ | T03 |
| 9 | C0-T09 | 코드 블록 실시간 하이라이트 (Shiki WASM) | `src/chat/components/CodeBlock.tsx` | P1 | ✅ | T08 |
| 10 | C0-T10 | Mermaid 다이어그램 렌더링 | `src/chat/components/MermaidDiagram.tsx` | P1 | ✅ | T08 |
| 11 | C0-T11 | 모드 드롭다운 (Ask/Agent/Plan/Debug) + 세션 리셋 | `src/chat/components/ModeSelector.tsx` | P0 | ✅ | T03 |
| 12 | C0-T12 | @멘션 트리거 + 자동완성 (파일/폴더/심볼/코드베이스) | `src/chat/components/MentionTrigger.tsx` | P0 | ✅ | T03 |
| 13 | C0-T13 | 루프 상태 타임라인 UI (Thought/Search/Edit/Planning) | `src/chat/components/Timeline.tsx` | P0 | ✅ | T03 |
| 14 | C0-T14 | 타임라인 접이식 그룹화 (완료 시 collapse) | `src/chat/components/TimelineGroup.tsx` | P0 | ✅ | T13 |
| 15 | C0-T15 | Planning next moves 상태 표시 | `src/chat/components/PlanningStatus.tsx` | P1 | ✅ | T13 |
| 16 | C0-T16 | 메시지 액션 (편집/재전송/복사/삭제/고정) | `src/chat/components/MessageActions.tsx` | P1 | ✅ | T04 |
| 17 | C0-T17 | Provider Registry (멀티 프로바이더 관리) | `src/providers/ProviderRegistry.ts` | P0 | ✅ | T01 |
| 18 | C0-T18 | LiteLLM/OpenAI-compatible Provider Adapter | `src/providers/LiteLLMProvider.ts` | P0 | ✅ | T01 |
| 19 | C0-T19 | ToolCallParser (Native/XML/JSON Fence/이중인코딩/Content 스캔) | `src/providers/ToolCallParser.ts` | P0 | ✅ | T01 |
| 20 | C0-T20 | ToolResultFormatter (OpenAI/Anthropic/Custom) | `src/providers/ToolResultFormatter.ts` | P0 | ✅ | T01 |
| 21 | C0-T21 | SecretStorage 연동 (API Key 저장/조회) | `src/providers/SecretManager.ts` | P0 | ✅ | T01 |
| 22 | C0-T22 | Provider 설정 UI (등록/테스트/모델 선택) | `src/chat/components/ProviderSettings.tsx` | P0 | ✅ | T17 |
| 23 | C0-T23 | 헬스체크 엔드포인트 (`/models` 호출로 검증) | `src/providers/HealthCheck.ts` | P1 | ✅ | T18 |
| 24 | C0-T24 | Extension ↔ Webview 메시지 프로토콜 타입 정의 | `src/chat/protocol.ts` | P0 | ✅ | T02 |
| 25 | C0-T25 | CSP 설정 (nonce + 웹뷰 리소스) | `src/chat/ChatViewProvider.ts` | P0 | ✅ | T02 |
| 26 | C0-T26 | 테마 대응 (VS Code 다크/라이트/하이컨트라스트) | `src/chat/chat.css`, `theme.css` | P1 | ✅ | T03 |
| 27 | C0-T27 | 접근성 (키보드 네비게이션, 스크린 리더, ARIA) | `src/chat/components/*.tsx` | P1 | ✅ | T03 |
| 28 | C0-T28 | i18n 준비 (영어/한국어 문자열 분리) | `src/chat/i18n/` | P2 | ✅ | T03 |
| 29 | C0-T29 | 단위 테스트: 스트리밍 파이프라인, 파서, 포맷터 | `tests/unit/chat/`, `tests/unit/providers/` | P0 | ✅ | T06,T19,T20 |
| 30 | C0-T30 | E2E 테스트: "Hello" 전송 → 스트리밍 응답 확인 | `tests/e2e/c0-chat-streaming.spec.ts` | P0 | ✅ | T29 |
| 31 | C0-T31 | E2E 테스트: Provider 등록 → 연결 테스트 → 모델 선택 | `tests/e2e/c0-provider-setup.spec.ts` | P0 | ✅ | T22 |
| 32 | C0-T32 | 성능 벤치마크: 50토큰/sec 렌더링 60fps 유지 | `tests/bench/rendering.bench.ts` | P1 | ✅ | T05 |
| 33 | C0-T33 | ConfigManager + agent-k.* configuration 스키마 (Infra-17) | `src/core/ConfigManager.ts` | P0 | ✅ | T01 |
| 34 | C0-T34 | Open Settings 명령 + 채팅 헤더 ⚙ | `src/extension.ts`, ChatHeader | P0 | ✅ | T03,T33 |
| 35 | C0-T35 | Settings Hub Webview 뼈대 (카테고리 탭 셸) | `src/settings/SettingsPanel.tsx` | P0 | ✅ | T33,T34 |
| 36 | C0-T36 | Models/Providers 설정 탭 + 연결 테스트 | `src/settings/tabs/ModelsTab.tsx` | P0 | ✅ | T35,T22 |
| 37 | C0-T37 | Secrets 탭 (SecretStorage only, PRD-21) | `src/settings/tabs/SecretsTab.tsx` | P0 | ✅ | T35,T21 |
| 38 | C0-T38 | Queue 설정 탭 (resynthesize 기본, PRD-17) | `src/settings/tabs/QueueTab.tsx` | P1 | ✅ | T35 |
| 39 | C0-T39 | E2E: Settings Hub 뼈대 (Models/Secrets/Queue 기본값) | `tests/e2e/c0-settings-hub.spec.ts` | P0 | ✅ | T36,T37,T38 |

---

### 🔵 C1: Ask Mode - Read-Only Exploration (28 tasks)

| # | Task ID | 제목 | 파일/모듈 | 우선순위 | 상태 | 의존성 |
|---|---------|------|-----------|----------|------|--------|
| 1 | C1-T01 | ModeRegistry: ModeConfig 타입 + ASK_WHITELIST (10 tools) | `src/agent/modeRegistry.ts` | P0 | ✅ | C0-T11 |
| 2 | C1-T02 | ToolRegistry.getSchemas(mode) 필터링 구현 | `src/tools/registry.ts` | P0 | ✅ | C0-T19 |
| 3 | C1-T03 | 읽기 도구 8개 구현: grep, glob, file_search, list_dir, read_file, codebase_search, lsp_definition, lsp_references | `src/tools/search/` | P0 | ✅ | C1-T02 |
| 4 | C1-T04 | grep 도구 (ripgrep + child_process, 병렬 지원) | `src/tools/search/GrepTool.ts` | P0 | ✅ | C1-T03 |
| 5 | C1-T05 | glob/file_search 도구 (vscode.workspace.findFiles) | `src/tools/search/GlobTool.ts` | P0 | ✅ | C1-T03 |
| 6 | C1-T06 | list_dir 도구 (vscode.workspace.fs.readDirectory) | `src/tools/search/ListDirTool.ts` | P0 | ✅ | C1-T03 |
| 7 | C1-T07 | read_file 도구 (offset/limit 필수, 250줄 캡) | `src/tools/search/ReadFileTool.ts` | P0 | ✅ | C1-T03 |
| 8 | C1-T08 | codebase_search 도구 (임베딩 인덱스 연동 - C7까지 스텁) | `src/tools/search/CodebaseSearchTool.ts` | P1 | ✅ | C1-T03 |
| 9 | C1-T09 | LSP 도구: definition, references, diagnostics | `src/tools/search/LspTools.ts` | P1 | ✅ | C1-T03 |
| 10 | C1-T10 | ask_question, todo_write 도구 (세션 UX) | `src/tools/session/` | P0 | ✅ | C1-T02 |
| 11 | C1-T11 | AgentLoop에 mode 주입 + 시스템 프롬프트 자동 주입 | `src/agent/loop.ts` | P0 | ✅ | C0-T02 |
| 12 | C1-T12 | ContextAssembler에 mode 파라미터 + 예산 분리 (Ask: 60k) | `src/agent/contextAssembler.ts` | P0 | ✅ | C0-T02 |
| 13 | C1-T13 | ParallelExecutor: Promise.all + p-limit(16) 병렬 읽기 실행 | `src/loop/ParallelExecutor.ts` | P0 | ✅ | C1-T02 |
| 14 | C1-T14 | PrefetchEngine: 메시지에서 경로/심볼/에러 스택 추출 → 선독 | `src/prefetch/PrefetchEngine.ts` | P0 | ✅ | C1-T03 |
| 15 | C1-T15 | Prefetch: @file: @folder: @symbol: @codebase: 파싱 | `src/prefetch/MentionExtractor.ts` | P0 | ✅ | C1-T14 |
| 16 | C1-T16 | Prefetch: 에러 스택 트레이스 파싱 (파일:라인 ±N) | `src/prefetch/StackTraceParser.ts` | P1 | ✅ | C1-T14 |
| 17 | C1-T17 | Prefetch 결과 "이미 조사된 컨텍스트" 블록으로 시스템 프롬프트에 주입 | `src/prefetch/ContextBlockBuilder.ts` | P0 | ✅ | C1-T14 |
| 18 | C1-T18 | Ask 모드에서 쓰기 도구 호출 시 즉시 에러 반환 (이중 가드) | `src/tools/registry.ts`, `src/agent/loop.ts` | P0 | ✅ | C1-T01 |
| 19 | C1-T19 | UI: Ask 모드 배지 (🔒 Read-only) + 도구 패널 🔒 아이콘 | `src/chat/components/ModeBadge.tsx` | P1 | ✅ | C0-T11 |
| 20 | C1-T20 | 모드 전환 시 히스토리 초기화 + 시스템 프롬프트 교체 | `src/agent/loop.ts`, `src/chat/ChatApp.tsx` | P0 | ✅ | C1-T11 |
| 21 | C1-T21 | 단위 테스트: ToolRegistry 필터링, ParallelExecutor, PrefetchEngine | `tests/unit/tools/`, `tests/unit/loop/` | P0 | ✅ | C1-T03 |
| 22 | C1-T22 | 단위 테스트: ModeRegistry 화이트리스트 정확성 | `tests/unit/agent/modeRegistry.test.ts` | P0 | ✅ | C1-T01 |
| 23 | C1-T23 | E2E 테스트: Ask 모드에서 "Explain @file:src/auth.ts" → 읽기만, 디스크 변경 없음 | `tests/e2e/c1-ask-mode.spec.ts` | P0 | ✅ | C1-T18 |
| 24 | C1-T24 | E2E 테스트: 쓰기 도구 환상 호출 시 에러 반환 + 루프 지속 | `tests/e2e/c1-write-blocked.spec.ts` | P0 | ✅ | C1-T18 |
| 25 | C1-T25 | E2E 테스트: 프리페치로 파일 내용이 컨텍스트에 미리 포함됨 확인 | `tests/e2e/c1-prefetch.spec.ts` | P0 | ✅ | C1-T17 |
| 26 | C1-T26 | 성능 테스트: 10개 파일 병렬 읽기 < 500ms | `tests/bench/parallel-read.bench.ts` | P1 | ✅ | C1-T13 |
| 27 | C1-T27 | 메모리 누수 테스트: 100턴 Ask 대화 후 메모리 증가 < 10MB | `tests/bench/memory-leak.bench.ts` | P1 | ✅ | C1-T20 |
| 28 | C1-T28 | 문서화: Ask 모드 사용 가이드 (README 섹션) | `docs/ask-mode.md` | P2 | ✅ | C1-T23 |

---

### 🟠 C2: Agent Single Turn - First Write (35 tasks)

| # | Task ID | 제목 | 파일/모듈 | 우선순위 | 상태 | 의존성 |
|---|---------|------|-----------|----------|------|--------|
| 1 | C2-T01 | Agent 모드 화이트리스트: edit_file, write_file, run_terminal_cmd 추가 | `src/agent/modeRegistry.ts` | P0 | ✅ | C1-T01 |
| 2 | C2-T02 | edit_file 도구: Search-Replace 파서 + 유일 매칭 검증 | `src/tools/edit/EditFileTool.ts` | P0 | ✅ | C2-T01 |
| 3 | C2-T03 | write_file 도구: 신규 파일/짧은 파일(<200줄)만 허용 | `src/tools/edit/WriteFileTool.ts` | P0 | ✅ | C2-T01 |
| 4 | C2-T04 | PatchDocument 파서 (`*** Begin Patch` ~ `*** End Patch`) | `src/patches/parser.ts` | P0 | ✅ | C2-T02 |
| 5 | C2-T05 | SearchReplaceHunk 타입 + 유일 매칭 로직 (0건/2건+ → 에러) | `src/patches/types.ts`, `src/patches/matcher.ts` | P0 | ✅ | C2-T04 |
| 6 | C2-T06 | Staleness 체크: mtime + xxhash64 (마지막 read 이후 변경 감지) | `src/patches/staleness.ts` | P0 | ✅ | C2-T05 |
| 7 | C2-T07 | 멀티 헌크 병합: 라인 번호 재계산 후 단일 WorkspaceEdit | `src/patches/merger.ts` | P0 | ✅ | C2-T05 |
| 8 | C2-T08 | PatchApplier: 체크포인트 생성 → WorkspaceEdit 적용 → 롤백 연동 | `src/patches/applier.ts` | P0 | ✅ | C2-T07, C4-T03* |
| 9 | C2-T09 | run_terminal_cmd 도구: allowlist (git, npm test, pytest, cargo test) | `src/tools/terminal/TerminalTool.ts` | P0 | ✅ | C2-T01 |
| 10 | C2-T10 | 터미널 출력 캡처 (stdout+stderr, 끝 32KB, exit code 포함) | `src/tools/terminal/OutputCapture.ts` | P0 | ✅ | C2-T09 |
| 11 | C2-T11 | Diff Preview Webview: 파일 트리 + 통합 Diff + 가상화 | `src/review/ReviewUIProvider.tsx` | P0 | ✅ | C0-T03 |
| 12 | C2-T12 | Diff 뷰: Side-by-side / Unified 토글, 헌크 네비게이션 (n/p) | `src/review/DiffView.tsx` | P0 | ✅ | C2-T11 |
| 13 | C2-T13 | 파일/헌크 체크박스 상태 동기화 (파일 선택 시 헌크 전체 토글) | `src/review/CheckboxSync.ts` | P0 | ✅ | C2-T11 |
| 14 | C2-T14 | 키보드 단축키: Ctrl+Enter(전체적용), Ctrl+Shift+Enter(선택적용), Esc(취소) | `src/review/KeyboardHandler.ts` | P0 | ✅ | C2-T11 |
| 15 | C2-T15 | PendingStore: 변경사항 메모리 관리 + 세션 간 클리어 정책 | `src/review/PendingStore.ts` | P0 | ✅ | C2-T11 |
| 16 | C2-T16 | Apply Selected: 체크된 파일/헌크만 WorkspaceEdit 적용 | `src/review/ApplySelected.ts` | P0 | ✅ | C2-T15 |
| 17 | C2-T17 | Undo: 체크포인트에서 before 스냅샷으로 복구 | `src/review/Undo.ts` | P0 | ✅ | C2-T08 |
| 18 | C2-T18 | 자동 검증 훅: PostToolUse → read_lints 실행 (Tier A 강제) | `src/hooks/autoVerificationHook.ts` | P0 | ✅ | HARB-T10* |
| 19 | C2-T19 | LintRunner: vscode.languages.getDiagnostics 파싱 → 에러 블록 구성 | `src/verification/LintRunner.ts` | P0 | ✅ | C2-T18 |
| 20 | C2-T20 | injectVerificationError: tool_result에 린트 에러 주입 + retryCount 증가 | `src/hooks/injectVerificationError.ts` | P0 | ✅ | C2-T18 |
| 21 | C2-T21 | TestFinder: 동일 디렉터리 *.test.ts / 미러 디렉터리 탐지 | `src/verification/TestFinder.ts` | P1 | ✅ | HARB-T10* |
| 22 | C2-T22 | TestRunner: 허용된 명령어 실행 (timeout 60s, 출력 트렁케이트) | `src/verification/TestRunner.ts` | P1 | ✅ | C2-T21 |
| 23 | C2-T23 | Tier별 검증 설정: A(lint만, retry=2), B(lint+test, retry=1), C(비활성) | `src/verification/config.ts` | P0 | ✅ | HARB-T01* |
| 24 | C2-T24 | 재시도 루프: 모델이 린트 에러 보고 재편집 → 재검증 (최대 N회) | `src/loop/AgentLoopController.ts` | P0 | ✅ | C2-T20 |
| 25 | C2-T25 | 최대 재시도 초과 시 ask_question으로 사용자 개입 유도 | `src/hooks/askOnMaxRetries.ts` | P1 | ✅ | C2-T24 |
| 26 | C2-T26 | 단위 테스트: PatchParser, Matcher, Staleness, Merger | `tests/unit/patches/` | P0 | ✅ | C2-T08 |
| 27 | C2-T27 | 단위 테스트: DiffView 렌더링, 체크박스 동기화, 키보드 핸들러 | `tests/unit/review/` | P0 | ✅ | C2-T14 |
| 28 | C2-T28 | 단위 테스트: LintRunner, TestFinder, injectVerificationError | `tests/unit/verification/` | P0 | ✅ | C2-T22 |
| 29 | C2-T29 | E2E: "Add null check to getUser" → edit_file → Diff 승인 → 적용 → 린트 통과 | `tests/e2e/c2-single-turn.spec.ts` | P0 | ✅ | C2-T16 |
| 30 | C2-T30 | E2E: 의도적 문법 에러 포함 패치 → 자동 린트 감지 → 재시도 → 성공 | `tests/e2e/c2-auto-lint.spec.ts` | P0 | ✅ | C2-T24 |
| 31 | C2-T31 | E2E: Stale 파일 감지 → "파일 변경됨" 에러 → 재읽기 유도 | `tests/e2e/c2-staleness.spec.ts` | P0 | ✅ | C2-T06 |
| 32 | C2-T32 | E2E: 10파일 멀티 헌크 리팩터링 → 선택적 적용 (일부 Undo) | `tests/e2e/c2-multi-file.spec.ts` | P1 | ✅ | C2-T16 |
| 33 | C2-T33 | 성능: 50파일 Diff 렌더링 < 500ms | `tests/bench/diff-render.bench.ts` | P1 | ✅ | C2-T11 |
| 34 | C2-T34 | 성능: PatchApplier 50파일 적용 < 2초 (원자적) | `tests/bench/patch-apply.bench.ts` | P1 | ✅ | C2-T08 |
| 35 | C2-T35 | 문서화: Search-Replace 포맷 가이드 + Diff UI 사용법 | `docs/patch-format.md`, `docs/diff-review.md` | P2 | ✅ | C2-T29 |

---

### 🔴 C3: Agent Multi-Turn - Core Loop + Resynthesize (33 tasks)

| # | Task ID | 제목 | 파일/모듈 | 우선순위 | 상태 | 의존성 |
|---|---------|------|-----------|----------|------|--------|
| 1 | C3-T01 | AgentLoopController: 코어 루프 구현 (메시지 → 모델 → 도구 → 결과 → 반복) | `src/loop/AgentLoopController.ts` | P0 | ✅ | C2-T01 |
| 2 | C3-T02 | 턴 카운터 + maxTurns 가드 (기본 20, 설정 가능) | `src/loop/MaxTurnsGuard.ts` | P0 | ✅ | C3-T01 |
| 3 | C3-T03 | Stop 신호 처리: AbortController → HTTP/셸 취소 → 큐 정책 적용 | `src/loop/StopHandler.ts` | P0 | ✅ | C3-T01 |
| 4 | C3-T04 | DoomLoopDetector: (toolName, argsHash, errorSig) 지문 → N회(3) 반복 감지 | `src/loop/DoomLoopDetector.ts` | P0 | ✅ | C3-T01 |
| 5 | C3-T05 | Doom Loop 감지 시: 루프 중단 + UI 알림 + 모델 변경/Plan 제안 | `src/loop/DoomLoopHandler.ts` | P0 | ✅ | C3-T04 |
| 6 | C3-T06 | 에러 복구: 도구 실패 ≠ 루프 중단, 실패를 tool_result로 반환 → 모델 재시도 | `src/loop/ErrorRecovery.ts` | P0 | ✅ | C3-T01 |
| 7 | C3-T07 | MessageQueue: Interrupt & Resynthesize + Queue-only (PRD-17) | `src/loop/MessageQueue.ts` | P0 | ✅ | C3-T01,C0-T33 |
| 8 | C3-T08 | Queue UI: Queued 뱃지, Apply now, Interrupted 타임라인 | `src/chat/components/MessageQueueUI.tsx` | P1 | ✅ | C3-T07 |
| 9 | C3-T09 | ContextAssembler: 예산 기반 조립 (시스템/룰/도구/스티키/대화/도구결과) | `src/agent/ContextAssembler.ts` | P0 | ✅ | C1-T12 |
| 10 | C3-T10 | Tool Result 상한: 32KB/8k tokens → 트렁케이트 + `(truncated, path=...)` | `src/agent/ContextAssembler.ts` | P0 | ✅ | C3-T09 |
| 11 | C3-T11 | read_file 기본: offset+limit (250줄 캡), 전체 덤프 금지 | `src/tools/search/ReadFileTool.ts` | P0 | ✅ | C1-T07 |
| 12 | C3-T12 | 이미지: Vision 모델만, 해상도/장수 캡 | `src/tools/web/ImageHandler.ts` | P1 | ✅ | C3-T09 |
| 13 | C3-T13 | 모드 전환 시 스티키 컨텍스트 초기화 (Cursor 방식) | `src/agent/ContextAssembler.ts` | P0 | ✅ | C1-T20 |
| 14 | C3-T14 | Planning next moves 상태: 도구 호출 직전/턴 사이 고정 문구 표시 | `src/chat/components/PlanningStatus.tsx` | P0 | ✅ | C0-T15 |
| 15 | C3-T15 | ToolExecutor: 읽기 병렬 / 쓰기·터미널 직렬 (Infra-08 정책) | `src/loop/ToolExecutor.ts` | P0 | ✅ | C1-T13 |
| 16 | C3-T16 | StreamingToolExecutor: tool_call 도착 즉시 읽기 도구 선실행 (지연↓) | `src/loop/StreamingToolExecutor.ts` | P1 | ✅ | C3-T15 |
| 17 | C3-T17 | Provider Adapter 스트리밍 중 tool_calls 누적 파싱 | `src/providers/ToolCallParser.ts` | P0 | ✅ | C0-T19 |
| 18 | C3-T18 | 단위 테스트: AgentLoopController (maxTurns, Stop, 에러 복구) | `tests/unit/loop/` | P0 | ✅ | C3-T01 |
| 19 | C3-T19 | 단위 테스트: DoomLoopDetector (지문 생성, 임계값, 다양한 에러) | `tests/unit/loop/DoomLoopDetector.test.ts` | P0 | ✅ | C3-T04 |
| 20 | C3-T20 | 단위 테스트: MessageQueue (resynthesize/queue-only/drain/Stop) | `tests/unit/loop/MessageQueue.test.ts` | P0 | ✅ | C3-T07,C3-T33 |
| 21 | C3-T21 | 단위 테스트: ContextAssembler 예산 준수, 보호 구간 유지 | `tests/unit/agent/ContextAssembler.test.ts` | P0 | ✅ | C3-T09 |
| 22 | C3-T22 | E2E: 멀티턴 이슈 해결 (예: "Implement login feature" → 5+ 턴 도구로 완료) | `tests/e2e/c3-multi-turn.spec.ts` | P0 | ✅ | C3-T01 |
| 23 | C3-T23 | E2E: Stop 중 HTTP/셸 취소 확인 + 부분 Review/체크포인트 유지 | `tests/e2e/c3-stop-handling.spec.ts` | P0 | ✅ | C3-T03 |
| 24 | C3-T24 | E2E: Doom Loop 유도 (동일 grep 4회 실패) → 감지 → 중단 + UI 알림 | `tests/e2e/c3-doom-loop.spec.ts` | P0 | ✅ | C3-T05 |
| 25 | C3-T25 | E2E: Enter → Interrupt & Resynthesize, Alt+Enter → 큐만 | `tests/e2e/c3-message-queue.spec.ts` | P0 | ✅ | C3-T07 |
| 26 | C3-T26 | E2E: 50턴 긴 대화 → 컴팩션 트리거 → 중요 컨텍스트(@파일/에러) 유지 확인 | `tests/e2e/c3-compaction.spec.ts` | P1 | ✅ | C4-T10* |
| 27 | C3-T27 | 벤치마크: 20턴 루프 실행 시간, 토큰 사용량, 메모리 | `tests/bench/loop-perf.bench.ts` | P1 | ✅ | C3-T01 |
| 28 | C3-T28 | 문서화: 코어 루프 + Interrupt & Resynthesize + 중단 조건 | `docs/agent-loop.md` | P2 | ✅ | C3-T22,C3-T07 |
| 29 | C3-T29 | 리팩터링: AgentLoopController → Mode별 서브클래스 분리 (Ask/Agent/Plan/Debug) | `src/loop/` | P1 | ✅ | C3-T01 |
| 30 | C3-T30 | 타입 안정성: ToolCall/ToolResult/Zod 스키마 전체 적용 | `src/tools/registry.ts` | P1 | ✅ | C1-T02 |
| 31 | C3-T31 | synthesizeInstructions 포맷 + interrupted 시스템 노트 | `src/loop/synthesizeInstructions.ts` | P0 | ✅ | C3-T07 |
| 32 | C3-T32 | Resynthesize in-flight 도구/셸 취소 정책 | `src/loop/cancelInFlight.ts` | P0 | ✅ | C3-T07,C3-T03 |
| 33 | C3-T33 | Resynthesize debounce 300ms + running lock | `src/loop/MessageQueue.ts` | P0 | ✅ | C3-T07 |

---

### 🟣 C4: Infrastructure - Production Feel (42 tasks)

| # | Task ID | 제목 | 파일/모듈 | 우선순위 | 상태 | 의존성 |
|---|---------|------|-----------|----------|------|--------|
| 1 | C4-T01 | PermissionGate: 4단계 (ask, accept_edits, auto, bypass) | `src/permission/PermissionGate.ts` | P0 | ✅ | C2-T01 |
| 2 | C4-T02 | 승인 UI: 명령/경로/Diff 프리뷰 + Allow once / Always for session / Reject | `src/permission/ApprovalUI.tsx` | P0 | ✅ | C4-T01 |
| 3 | C4-T03 | CheckpointManager: 첫 쓰기 전 / N파일 이상 / 사용자 요청 / 위험 도구 직전 | `src/checkpoint/CheckpointManager.ts` | P0 | ✅ | C2-T08 |
| 4 | C4-T04 | 체크포인트 저장: 변경 파일 before 스냅샷 (내용 해시) → workspaceState | `src/checkpoint/SnapshotStore.ts` | P0 | ✅ | C4-T03 |
| 5 | C4-T05 | 타임라인 체크포인트 노드 표시 + Restore 버튼 | `src/chat/components/TimelineCheckpoint.tsx` | P0 | ✅ | C4-T03 |
| 6 | C4-T06 | Restore: 스냅샷 파일만 복구 (untracked 삭제 정책 명시) | `src/checkpoint/Restore.ts` | P0 | ✅ | C4-T04 |
| 7 | C4-T07 | Pending Review 상태와 정합 (Undo와 정책 맞춤) | `src/review/PendingStore.ts` | P0 | ✅ | C2-T15 |
| 8 | C4-T08 | DoomLoopDetector 완성: 연속 3회 동일 실패 → 사용자 ask | `src/loop/DoomLoopDetector.ts` | P0 | ✅ | C3-T04 |
| 9 | C4-T09 | ContextCompactionEngine: 4단계 (Truncate → Drop → Micro-summary → Full) | `src/compaction/CompactionEngine.ts` | P0 | ✅ | C3-T09 |
| 10 | C4-T10 | 보호 구간: 시스템/룰/최근 K턴(6)/현재 목표 문장 보존 | `src/compaction/ProtectionZones.ts` | P0 | ✅ | C4-T09 |
| 11 | C4-T11 | Truncate: 오래된 tool result 본문 절단 | `src/compaction/Truncate.ts` | P0 | ✅ | C4-T09 |
| 12 | C4-T12 | Drop: 중복 read/grep 결과 제거 | `src/compaction/DropDuplicates.ts` | P0 | ✅ | C4-T09 |
| 13 | C4-T13 | Micro-summary: 구간을 짧은 bullet로 치환 (소형 모델/룰 사용) | `src/compaction/MicroSummary.ts` | P0 | ✅ | C4-T09 |
| 14 | C4-T14 | Full compact: 대화 요약 1블록 생성 후 히스토리 교체 (최후 수단) | `src/compaction/FullCompact.ts` | P0 | ✅ | C4-T09 |
| 15 | C4-T15 | HookSystem: PreToolUse / PostToolUse (차단/수정/로깅/시크릿 스캔) | `src/hooks/HookSystem.ts` | P0 | ✅ | C2-T18 |
| 16 | C4-T16 | PreToolUse: 시크릿 스캔 (API 키, 패스워드 패턴) → 차단/마스킹 | `src/hooks/SecretScanHook.ts` | P1 | ✅ | C4-T15 |
| 17 | C4-T17 | PostToolUse: 자동 검증 훅 등록 (auto-verification) | `src/hooks/autoVerificationHook.ts` | P0 | ✅ | C2-T18 |
| 18 | C4-T18 | Memories (최소): workspaceState key-value + 매 턴 Rules 옆 주입 (1-2%) | `src/memories/MemoryStore.ts` | P0 | ✅ | C4-T09 |
| 19 | C4-T19 | Memories UI: 설정 웹뷰에서 삭제/편집 | `src/memories/MemorySettings.tsx` | P1 | ✅ | C4-T18 |
| 20 | C4-T20 | 모델이 "기억해" / 반복 선호 감지 → 자동 저장 제안 | `src/memories/AutoMemoryDetector.ts` | P1 | ✅ | C4-T18 |
| 21 | C4-T21 | MessageQueue 완성: Resynthesize drain · Stop keep/discard · 상태 UI | `src/loop/MessageQueue.ts` | P0 | ✅ | C3-T07 |
| 22 | C4-T22 | SideChatSession: 메인 Agent 병렬 읽기 전용 세션 (`/side` 명령) | `src/sidechat/SideChatSession.ts` | P0 | ✅ | C1-T11 |
| 23 | C4-T23 | Side Chat: 기본 도구 grep/read/search만, 쓰기/터미널/Review 금지 | `src/sidechat/SideChatTools.ts` | P0 | ✅ | C4-T22 |
| 24 | C4-T24 | Side Chat 결과 요약/코드 인용 → 메인 채팅 `@side-결과`로 컨텍스트 합류 | `src/sidechat/MergeToMain.ts` | P0 | ✅ | C4-T23 |
| 25 | C4-T25 | TelemetryCollector: 턴 로그, 도구 지연시간, 토큰 사용량 | `src/telemetry/TelemetryCollector.ts` | P1 | ✅ | C3-T01 |
| 26 | C4-T26 | CostTracker/BudgetGuard: 일/월 토큰 예산, 초과 시 알림/자동 전환 | `src/telemetry/CostTracker.ts` | P1 | ✅ | C4-T25 |
| 27 | C4-T27 | Extension Lifecycle: activate/deactivate, 설정 마이그레이션 | `src/extension.ts` | P0 | ✅ | C0-T01 |
| 28 | C4-T28 | Workspace Indexer: ripgrep + findFiles 병렬, 임베딩 배치 (선택) | `src/indexing/WorkspaceIndexer.ts` | P1 | ✅ | C1-T03 |
| 29 | C4-T29 | Session Manager: 세션 저장/복원/리스트/삭제 (workspaceState) | `src/session/SessionManager.ts` | P1 | ✅ | C4-T27 |
| 30 | C4-T30 | Model Router / Provider Adapter 완성 (Tier A/B 라우팅) | `src/providers/ModelRouter.ts` | P1 | ✅ | C0-T17 |
| 31 | C4-T31 | Multi-Workspace / Remote: 다중 루트 워크스페이스 지원 | `src/infrastructure/MultiWorkspace.ts` | P2 | ✅ | C4-T27 |
| 32 | C4-T32 | 단위 테스트: PermissionGate (4단계), ApprovalUI | `tests/unit/permission/` | P0 | ✅ | C4-T01 |
| 33 | C4-T33 | 단위 테스트: CheckpointManager (생성/복원/untracked 정책) | `tests/unit/checkpoint/` | P0 | ✅ | C4-T03 |
| 34 | C4-T34 | 단위 테스트: CompactionEngine (4단계, 보호 구간) | `tests/unit/compaction/` | P0 | ✅ | C4-T09 |
| 35 | C4-T35 | 단위 테스트: HookSystem (Pre/Post, 시크릿 스캔, 자동 검증) | `tests/unit/hooks/` | P0 | ✅ | C4-T15 |
| 36 | C4-T36 | 단위 테스트: MemoryStore (CRUD, 예산 주입, 자동 감지) | `tests/unit/memories/` | P0 | ✅ | C4-T18 |
| 37 | C4-T37 | 단위 테스트: SideChatSession (격리, 병렬, 합류) | `tests/unit/sidechat/` | P0 | ✅ | C4-T22 |
| 38 | C4-T38 | E2E: 대량 삭제 시도 → 권한 거부 → 체크포인트에서 복구 | `tests/e2e/c4-permission-checkpoint.spec.ts` | P0 | ✅ | C4-T02 |
| 39 | C4-T39 | E2E: 무한 루프 유도 → Doom Loop 감지 → 중단 + 모델 변경 제안 | `tests/e2e/c4-doom-loop.spec.ts` | P0 | ✅ | C4-T08 |
| 40 | C4-T40 | E2E: 100턴 세션 → 컴팩션 후에도 현재 파일/에러/목표 기억 | `tests/e2e/c4-compaction.spec.ts` | P0 | ✅ | C4-T10 |
| 41 | C4-T41 | E2E: Side Chat으로 탐색 → 메인에 `@side-결과` 인용 → 구현 이어가기 | `tests/e2e/c4-side-chat.spec.ts` | P0 | ✅ | C4-T24 |
| 42 | C4-T42 | 성능: 컴팩션 100턴 < 200ms, 체크포인트 생성/복원 < 100ms | `tests/bench/c4-perf.bench.ts` | P1 | ✅ | C4-T10 |

---

### 🟡 C5: Plan Mode (25 tasks)

| # | Task ID | 제목 | 파일/모듈 | 우선순위 | 상태 | 의존성 |
|---|---------|------|-----------|----------|------|--------|
| 1 | C5-T01 | PlanModeController: 읽기 전용 루프 + 계획 생성 플로우 | `src/plan/PlanModeController.ts` | P0 | 🔄 rework | C4-T01 |
| 2 | C5-T02 | Clarifying Questions: 객관식 UI (ask_question 도구) | `src/plan/ClarifyingQuestions.tsx` | P0 | 🔄 rework | C5-T01 |
| 3 | C5-T03 | Codebase Research: Ask 모드와 유사한 읽기·검색 루프 | `src/plan/ResearchPhase.ts` | P0 | 🔄 rework | C5-T01 |
| 4 | C5-T04 | Implementation Plan 생성: Markdown + Mermaid + Todo 리스트 | `src/plan/PlanGenerator.ts` | P0 | ✅ | C5-T03 |
| 5 | C5-T05 | Plan Webview: 계획 문서 편집 + Mermaid 실시간 렌더링 | `src/plan/PlanEditor.tsx` | P0 | 🔄 rework | C5-T04 |
| 6 | C5-T06 | 사용자 리뷰: 직접 md 편집, 불필요 스텝 삭제, 승인 버튼 | `src/plan/PlanReview.tsx` | P0 | 🔄 rework | C5-T05 |
| 7 | C5-T07 | 승인 시 Agent 모드로 전환 실행 (쓰기 도구 활성화) | `src/plan/PlanToAgent.ts` | P0 | 🔄 rework | C5-T06 |
| 8 | C5-T08 | Todo 분기: 일부만 새 Agent 세션으로 분기 (선택) | `src/plan/TodoBranching.ts` | P1 | ✅ | C5-T07 |
| 9 | C5-T09 | 계획 문서 저장: `.agentk/plans/` (설정 오버라이드 가능) | `src/plan/PlanStorage.ts` | P1 | 🔄 rework | C5-T04 |
| 10 | C5-T10 | 복잡도 휴리스틱: 파일≥3, "리팩터/마이그레이션" 키워드 → Plan 모드 강제 제안 | `src/plan/ComplexityHeuristic.ts` | P1 | ✅ | C5-T01 |
| 11 | C5-T11 | 실패 시: 변경 revert → 계획 다듬기 → 재승인 (Cursor 권장 플로우) | `src/plan/FailureRecovery.ts` | P1 | ✅ | C5-T07 |
| 12 | C5-T12 | 단위 테스트: PlanGenerator (Mermaid/Todo 파싱) | `tests/unit/plan/` | P0 | ✅ | C5-T04 |
| 13 | C5-T13 | 단위 테스트: ComplexityHeuristic (키워드/파일 수 임계값) | `tests/unit/plan/ComplexityHeuristic.test.ts` | P0 | ✅ | C5-T10 |
| 14 | C5-T14 | E2E: "Refactor auth module" → Plan 모드 진입 → 질문 → 계획 → 승인 → 구현 | `tests/e2e/c5-plan-mode.spec.ts` | P0 | 🔄 rework | C5-T07 |
| 15 | C5-T15 | E2E: 계획 승인 후 Agent 모드에서 todo_write로 진행 상황 표시 | `tests/e2e/c5-todo-integration.spec.ts` | P0 | ✅ | C5-T08 |
| 16 | C5-T16 | E2E: Plan 모드에서 쓰기 도구 완전 차단 확인 | `tests/e2e/c5-plan-readonly.spec.ts` | P0 | 🔄 rework | C5-T01 |
| 17 | C5-T17 | Mermaid 렌더링 성능: 50개 다이어그램 < 300ms | `tests/bench/mermaid-render.bench.ts` | P1 | ✅ | C5-T05 |
| 18 | C5-T18 | 문서화: Plan 모드 워크플로우 + Mermaid 템플릿 | `docs/plan-mode.md` | P2 | ✅ | C5-T14 |
| 19 | C5-T19 | UI: Plan 모드 헤더 배지 + 진행 단계 표시 (Research → Plan → Review → Build) | `src/chat/components/PlanModeHeader.tsx` | P1 | 🔄 rework | C5-T01 |
| 20 | C5-T20 | Plan 모드 진입/이탈 시 세션 리셋 확인 | `src/plan/SessionReset.ts` | P0 | ✅ | C5-T01 |
| 21 | C5-T21 | Plan 모드에서 `@codebase` / `@file:` 멘션 정상 작동 | `src/plan/PlanMentions.ts` | P0 | ✅ | C5-T03 |
| 22 | C5-T22 | Plan 저장/불러오기 UI (최근 계획 10개) | `src/plan/PlanHistory.tsx` | P2 | 🔄 rework | C5-T09 |
| 23 | C5-T23 | TodoWrite 도구: Plan 모드에서 todo 생성 → Agent 모드에서 이어받기 | `src/tools/session/TodoWriteTool.ts` | P0 | 🔄 rework | C5-T08 |
| 24 | C5-T24 | Agent 모드 실행 중 계획 참조: "Per plan step 3..." 컨텍스트 주입 | `src/plan/PlanContextInjection.ts` | P1 | ✅ | C5-T07 |
| 25 | C5-T25 | 회고: Plan 없이 코드 작성 시도 시 경고 + Plan 모드 제안 | `src/plan/PlanEnforcement.ts` | P1 | ✅ | C5-T01 |

---

### 🟤 C6: Debug Mode (29 tasks) ✅

| # | Task ID | 제목 | 파일/모듈 | 우선순위 | 상태 | 의존성 |
|---|---------|------|-----------|----------|------|--------|
| 1 | C6-T01 | DebugModeController: 가설→계측→재현→로그→최소수정→청소 6단계 | `src/debug/DebugModeController.ts` | P0 | 🔄 rework | C4-T01 |
| 2 | C6-T02 | 가설 생성: 관련 파일 탐색 → N개 가설 리스트 UI (객관식 선택) | `src/debug/HypothesisGenerator.ts` | P0 | 🔄 rework | C6-T01 |
| 3 | C6-T03 | add_instrumentation 도구: 로그 삽입 (시작/끝/조건부/변수 덤프) | `src/tools/debug/AddInstrumentationTool.ts` | P0 | 🔄 rework | C6-T01 |
| 4 | C6-T04 | 계측 코드 패턴 라이브러리 (JS/TS/Python/Go/Rust 공통) | `src/debug/InstrumentationPatterns.ts` | P0 | 🔄 rework | C6-T03 |
| 5 | C6-T05 | DebugLogServer: 로컬 로그 수집 엔드포인트 (WebSocket/HTTP) | `src/debug/DebugLogServer.ts` | P0 | 🔄 rework | C6-T01 |
| 6 | C6-T06 | collect_runtime_logs 도구: 서버에서 로그 수집 + 포맷팅 | `src/tools/debug/CollectRuntimeLogsTool.ts` | P0 | 🔄 rework | C6-T05 |
| 7 | C6-T07 | request_reproduce 도구: 사용자 재현 대기 (가이드 + 진행 표시) | `src/tools/debug/RequestReproduceTool.ts` | P0 | 🔄 rework | C6-T01 |
| 8 | C6-T08 | Reproduce UI: 단계별 가이드, 스크린샷, "완료" 버튼 | `src/debug/ReproduceUI.tsx` | P0 | 🔄 rework | C6-T07 |
| 9 | C6-T09 | 로그 분석: 수집 로그로 실제 원인 특정 (스택 트레이스 매칭) | `src/debug/LogAnalyzer.ts` | P0 | 🔄 rework | C6-T06 |
| 10 | C6-T10 | Targeted Fix: 원인에 맞는 최소 패치 (종종 수 줄) | `src/debug/TargetedFixGenerator.ts` | P0 | 🔄 rework | C6-T09 |
| 11 | C6-T11 | remove_instrumentation 도구: 수정 확정 후 계측 코드 제거 | `src/tools/debug/RemoveInstrumentationTool.ts` | P0 | 🔄 rework | C6-T03 |
| 12 | C6-T12 | Verify & Cleanup: 재현으로 검증 → 계측 제거 → 최종 확인 | `src/debug/VerifyCleanup.ts` | P0 | 🔄 rework | C6-T11 |
| 13 | C6-T13 | Debug 전용 타임라인 UI: 가설/계측/재현/분석/수정/청소 단계별 그룹 | `src/chat/components/DebugTimeline.tsx` | P1 | 🔄 rework | C0-T13 |
| 14 | C6-T14 | 단위 테스트: Instrumentation 패턴 적용/제거 정확성 | `tests/unit/debug/` | P0 | 🔄 rework | C6-T04 |
| 15 | C6-T15 | 단위 테스트: DebugLogServer (로그 수집/필터링/트렁케이트) | `tests/unit/debug/DebugLogServer.test.ts` | P0 | 🔄 rework | C6-T05 |
| 16 | C6-T16 | 단위 테스트: LogAnalyzer (스택 매칭, 원인 특정) | `tests/unit/debug/LogAnalyzer.test.ts` | P0 | 🔄 rework | C6-T09 |
| 17 | C6-T17 | E2E: "Fix race condition in cache" → 가설 3개 → 계측 → 재현 → 2줄 수정 → 검증 | `tests/e2e/c6-debug-cycle.spec.ts` | P0 | 🔄 rework | C6-T12 |
| 18 | C6-T18 | E2E: 재현 대기 중 Stop → 계측 제거 + 부분 상태 복구 | `tests/e2e/c6-debug-stop.spec.ts` | P0 | 🔄 rework | C6-T07 |
| 19 | C6-T19 | E2E: 계측 추가 후 테스트 실패 → 로그 분석 → 수정 → 테스트 통과 | `tests/e2e/c6-debug-test-failure.spec.ts` | P0 | 🔄 rework | C6-T09 |
| 20 | C6-T20 | 성능: DebugLogServer 1000 로그/초 처리, 메모리 < 50MB | `tests/bench/debug-mode.bench.ts` | P1 | 🔄 rework | C6-T05 |
| 21 | C6-T21 | 문서화: Debug 모드 워크플로우 + 계측 패턴 가이드 | `docs/debug-mode.md` | P2 | 🔄 rework | C6-T17 |
| 22 | C6-T22 | UI: Debug 모드 배지 + "가설 선택" 모달 + 재현 가이드 패널 | `src/chat/components/DebugModeUI.tsx` | P1 | 🔄 rework | C6-T01 |
| 23 | C6-T23 | Debug 모드에서 일반 edit_file 도구도 사용 가능 (계측용) | `src/debug/DebugTools.ts` | P0 | 🔄 rework | C6-T01 |
| 24 | C6-T24 | 재현 단계 자동 기록 (사용자 액션 → 재현 스크립트 생성) | `src/debug/ReproduceRecorder.ts` | P2 | 🔄 rework | C6-T07 |
| 25 | C6-T25 | 계측 코드 템플릿: 콘솔 로그, 성능 마크, 에러 경계 | `src/debug/Templates.ts` | P1 | 🔄 rework | C6-T04 |
| 26 | C6-T26 | 멀티파일 버그: 여러 파일 계측 → 통합 로그 분석 | `src/debug/MultiFileDebug.ts` | P2 | 🔄 rework | C6-T09 |
| 27 | C6-T27 | 디버그 세션 저장/불러오기 (재현 스크립트 + 로그 + 수정 이력) | `src/debug/DebugSessionStore.ts` | P2 | 🔄 rework | C6-T20 |
| 28 | C6-T28 | 회고: Debug 모드 진입 기준 (재현 어려움 / 동시성 / 힙 분석) 문서화 | `docs/debug-mode-guidelines.md` | P2 | 🔄 rework | C6-T21 |
| 29 | C6-T29 | Debug 증거용 browser_screenshot/console/network (Design Mode=C7) | `src/debug/BrowserEvidence.ts` | P1 | 🔄 rework | C6-T01,C7-T01 |

### 🟢 C7: Production Grade (46 tasks)

| # | Task ID | 제목 | 파일/모듈 | 우선순위 | 상태 | 의존성 |
|---|---------|------|-----------|----------|------|--------|
| 1 | C7-T01 | BrowserTools: Playwright 연동 (navigate, click, screenshot, evaluate) | `src/browser/BrowserTools.ts` | P0 | 🔄 rework | C4-T27 |
| 2 | C7-T02 | Browser 세션 관리: 영구 컨텍스트, 쿠키/스토리지 유지 | `src/browser/BrowserSession.ts` | P0 | 🔄 rework | C7-T01 |
| 3 | C7-T03 | Design Mode: 스크린샷 오버레이 + 요소 클릭 → 주석/좌표 | `src/browser/DesignModeOverlay.tsx` | P0 | 🔄 rework | C7-T01 |
| 4 | C7-T04 | Design Mode: 주석 좌표 + 스크린샷 → 다음 턴 컨텍스트 첨부 | `src/browser/DesignModeContext.ts` | P0 | 🔄 rework | C7-T03 |
| 5 | C7-T05 | browser_* 도구 그룹: 네비게이트/클릭/스크롤/대기/스크린샷/평가 | `src/tools/browser/` | P0 | 🔄 rework | C7-T01 |
| 6 | C7-T06 | Webview에서 브라우저 미리보기 (iframe 또는 캔버스 스트리밍) | `src/browser/BrowserPreview.tsx` | P1 | 🔄 rework | C7-T01 |
| 7 | C7-T07 | WorktreeManager: git worktree 생성/삭제/리스트 | `src/worktree/WorktreeManager.ts` | P0 | 🔄 rework | C4-T27 |
| 8 | C7-T08 | Best-of-N: N개 worktree에서 병렬 Agent 실행 (모델/프롬프트 다르게) | `src/worktree/BestOfN.ts` | P0 | 🔄 rework | C7-T07 |
| 9 | C7-T09 | 결과 비교 UI: Diff 요약 + 테스트 결과 + 토큰/비용 카드 | `src/worktree/ComparisonUI.tsx` | P0 | 🔄 rework | C7-T08 |
| 10 | C7-T10 | 승자 채택: worktree → 메인 워킹트리 merge/apply, 나머지는 삭제 | `src/worktree/AdoptWinner.ts` | P0 | 🔄 rework | C7-T09 |
| 11 | C7-T11 | Agent Review Loop: git diff/스테이징 수집 → 정적 힌트 + LM 리뷰 프롬프트 | `src/review/AgentReviewLoop.ts` | P0 | 🔄 rework | C4-T01 |
| 12 | C7-T12 | Finding 리스트 UI: 파일·줄·심각도·제안 + Accept Fix / Dismiss | `src/review/FindingList.tsx` | P0 | 🔄 rework | C7-T11 |
| 13 | C7-T13 | Accept Fix → 해당 finding만 edit_file 마이크로 Agent 실행 | `src/review/AcceptFix.ts` | P0 | 🔄 rework | C7-T12 |
| 14 | C7-T14 | Memories 고도화: SecretStorage 영구 저장 + UI 편집 + 자동 주입 | `src/memories/MemoryStore.ts` | P0 | 🔄 rework | C4-T18 |
| 15 | C7-T15 | Chat Search: 로컬 인덱스 (대화/아티팩트/diff) + 검색 웹뷰 | `src/search/ChatSearchIndex.ts` | P0 | 🔄 rework | C4-T27 |
| 16 | C7-T16 | Artifacts: 스크린샷/데모/diff 카드 저장 + 갤러리 웹뷰 | `src/artifacts/ArtifactStore.ts` | P0 | 🔄 rework | C7-T03 |
| 17 | C7-T17 | MCP Client: MCP SDK 브리지 → Tool Registry 등록 (이름 충돌 prefix) | `src/mcp/MCPClient.ts` | P0 | 🔄 rework | C4-T27 |
| 18 | C7-T18 | MCP 도구 지연 로드: ToolSearch로 스키마 폭증 방지 | `src/mcp/DeferredMCPTools.ts` | P1 | 🔄 rework | C7-T17 |
| 19 | C7-T19 | Skills / Pinned Skills: 레지스트리 + 핀 UI (PRD-28) | `src/skills/SkillRegistry.ts` | P0 | 🔄 rework | C4-T27,C0-T35 |
| 20 | C7-T20 | skill 도구: 목록/본문 로드 주입 (PRD-28 FR-05) | `src/tools/orchestration/SkillTool.ts` | P0 | 🔄 rework | C7-T19 |
| 21 | C7-T21 | 병렬 서브에이전트: task 도구로 별도 컨텍스트 위임 (탐색/일반/디버그) | `src/tools/orchestration/TaskTool.ts` | P0 | 🔄 rework | C4-T27 |
| 22 | C7-T22 | 서브에이전트 결과 요약만 부모에 반환 (컨텍스트 오염 방지) | `src/tools/orchestration/SubAgentResult.ts` | P0 | 🔄 rework | C7-T21 |
| 23 | C7-T23 | GitHub PR/Issue Agent: gh API 연동 (리뷰 코멘트, 이슈 생성) | `src/github/GitHubAgent.ts` | P1 | 🔄 rework | C7-T17 |
| 24 | C7-T24 | Commit Message / PR Description 생성: SCM API + LM | `src/scm/CommitMessageGenerator.ts` | P1 | 🔄 rework | C7-T23 |
| 25 | C7-T25 | Test Generation / Fix Loop: 실패 테스트 → 생성 → 실행 → 수정 루프 | `src/testing/TestGenerationLoop.ts` | P1 | 🔄 rework | C2-T22 |
| 26 | C7-T26 | Secrets/Config Vault UI: SecretStorage 관리 + 환경별 프로파일 | `src/secrets/SecretsVault.tsx` | P1 | 🔄 rework | C0-T21 |
| 27 | C7-T27 | Inline Completion: InlineCompletionItemProvider (동일 엔드포인트) | `src/inline/InlineCompletionProvider.ts` | P1 | 🔄 rework | C0-T18 |
| 28 | C7-T28 | Selection → Diff Apply: Ctrl+K 대체 (Commands + WorkspaceEdit + DiffEditor) | `src/selection/SelectionDiffApply.ts` | P1 | 🔄 rework | C2-T02 |
| 29 | C7-T29 | Parallel File Search/Read: findFiles + Promise.all + concurrency 큐 | `src/tools/search/ParallelSearch.ts` | P0 | 🔄 rework | C1-T13 |
| 30 | C7-T30 | Codebase Indexing: 자체 임베딩/청크 + Files API + @codebase 검색 | `src/indexing/CodebaseIndexer.ts` | P1 | 🔄 rework | C4-T28 |
| 31 | C7-T31 | Semantic Search: 벡터 DB (선택) 또는 ripgrep만으로 시작 | `src/indexing/SemanticSearch.ts` | P1 | 🔄 rework | C7-T30 |
| 32 | C7-T32 | DGX/vLLM/TRT-LLM 원클릭 프로바이더: 엔드포인트/모델 카탈로그만 | `src/providers/DGXProvider.ts` | P1 | 🔄 rework | C0-T18 |
| 33 | C7-T33 | Model Router: Cost/Balance/Intelligence + A/B 티어 라우팅 | `src/providers/ModelRouter.ts` | P1 | 🔄 rework | C4-T30 |
| 34 | C7-T34 | Firmware: SVD 뷰어 + 레지스터 패널 (Webview + TreeView) | `src/firmware/SVDViewer.tsx` | P2 | 🔄 rework | C4-T27 |
| 35 | C7-T35 | Legacy Scan → Report: 언어별 파서 + Webview 리포트 | `src/legacy/LegacyScanner.ts` | P2 | 🔄 rework | C4-T27 |
| 36 | C7-T36 | MISRA/Lint AI 설명: Diagnostics + LM → 수정 제안 | `src/compliance/MISRAExplainer.ts` | P2 | 🔄 rework | C2-T19 |
| 37 | C7-T37 | Serial Monitor Panel: Serialport + Webview | `src/serial/SerialMonitor.tsx` | P2 | 🔄 rework | C4-T27 |
| 38 | C7-T38 | E2E: Browser + Design Mode → UI 버그 재현 → 수정 → 재캡처 검증 | `tests/e2e/c7-browser-design.spec.ts` | P0 | 🔄 rework | C7-T04 |
| 39 | C7-T39 | E2E: Worktree/BoN 3개 병렬 → 비교 UI → 하나 채택 → merge | `tests/e2e/c7-worktree-bon.spec.ts` | P0 | 🔄 rework | C7-T10 |
| 40 | C7-T40 | E2E: `/review` → Finding 3개 → Accept Fix 1개 → 자동 edit_file → 재검증 | `tests/e2e/c7-agent-review.spec.ts` | P0 | 🔄 rework | C7-T13 |
| 41 | C7-T41 | E2E: Memories 영구 저장 → 재시작 후 자동 주입 확인 | `tests/e2e/c7-memories.spec.ts` | P0 | 🔄 rework | C7-T14 |
| 42 | C7-T42 | E2E: MCP 도구 등록 → Agent가 호출 → 결과 반환 | `tests/e2e/c7-mcp.spec.ts` | P0 | 🔄 rework | C7-T17 |
| 43 | C7-T43 | E2E: Skills 핀 → 주입 → Agent 동작 변경 (PRD-28 AC) | `tests/e2e/c7-skills.spec.ts` | P0 | 🔄 rework | C7-T19,C7-T20 |
| 44 | C7-T44 | 성능: Browser 세션 시작 < 3s, 스크린샷 < 500ms | `tests/bench/browser.bench.ts` | P1 | 🔄 rework | C7-T01 |
| 45 | C7-T45 | 문서화: Production 기능 전체 가이드 (Browser/Worktree/Review/MCP/Skills) | `docs/production-features.md` | P2 | 🔄 rework | C7-T38 |

---

| 46 | C7-T46 | Settings Hub 완성: Permission/Harness/Context/MCP/Features 탭 (PRD-29) | `src/settings/tabs/` | P1 | 🔄 rework | C0-T35,C4-T01,C7-T19 |

---

### 🟢 HARB: Harness & Specs (병렬 가능, 38 tasks) — 38/38 ✅ (전체 완료)

| # | Task ID | 제목 | 파일/모듈 | 우선순위 | 상태 | 의존성 |
|---|---------|------|-----------|----------|------|--------|
| 1 | HARB-T01 | Model Tiers (A/B/C) 타입 + 라우팅 정책 | `src/harness/ModelTiers.ts` | P0 | ✅ | - |
| 2 | HARB-T02 | Verification First 철학: 시스템 프롬프트에 검증 우선 문구 주입 | `src/harness/VerificationFirstPrompt.ts` | P0 | ✅ | HARB-T01 |
| 3 | HARB-T03 | Cursor Pattern: Think→Act→Verify 턴 구조 강제 | `src/harness/CursorPattern.ts` | P0 | ✅ | HARB-T02 |
| 4 | HARB-T04 | Memories Minimal: workspaceState key-value + 예산 1-2% | `src/harness/MinimalMemories.ts` | P0 | ✅ | C4-T18 |
| 5 | HARB-T05 | Design Slogans: 프롬프트에 "탐색은 코드, 판단은 모델" 등 주입 | `src/harness/DesignSlogans.ts` | P1 | ✅ | HARB-T02 |
| 6 | HARB-T06 | A-Tier Whitelist: 코어 8 + ask/todo = 10 schemas (terminal=allowlist) | `src/harness/AWhitelist.ts` | P0 | ✅ | C1-T02 |
| 7 | HARB-T07 | Prompt/Turn Structure: 도구 최대 N개, 읽기 위주, 수정 전 read 필수 | `src/harness/PromptTurnStructure.ts` | P0 | ✅ | HARB-T01 |
| 8 | HARB-T08 | Harness Duties (9가지): 검증/프리페치/컴팩션/둠루프/권한/체크포인트/에러복구/비용/텔레메트리 | `src/harness/HarnessDuties.ts` | P0 | ✅ | HARB-T01 |
| 9 | HARB-T09 | PrefetchEngine 완성: 메시지/스택/심볼 → 모델 호출 전 조사 블록 주입 | `src/prefetch/PrefetchEngine.ts` | P0 | ✅ | C1-T14 |
| 10 | HARB-T10 | Verification Micro-Loop 완성: edit 후 자동 lint/test → 주입 → 재시도 | `src/hooks/autoVerificationHook.ts` | P0 | ✅ | C2-T18 |
| 11 | HARB-T11 | Context Rules: 보호 구간 (시스템/룰/최근 K턴/현재 목표) | `src/harness/ContextRules.ts` | P0 | ✅ | C4-T10 |
| 12 | HARB-T12 | Routing Heuristics: Plan 승인 대형작업→Pro 실행, 린트 2회 실패→Pro, JSON 3회 실패→세션 중단 | `src/providers/RoutingHeuristics.ts` | P0 | ✅ | HARB-T01 |
| 13 | HARB-T13 | UX for Medium: todo 단계 쪼개기 표시, Diff 승인 기본 on, 막힘 시 버튼(프리페치/도구축소/Pro재실행) | `src/harness/UXForMedium.ts` | P1 | ✅ | HARB-T06 |
| 14 | HARB-T14 | Don't Do Medium: 안티패턴 문서화 + 런타임 가드 (풀 도구/MCP/전체 리팩터/Unified diff/긴 이력) | `src/harness/DontDoMedium.ts` | P1 | ✅ | HARB-T06 |
| 15 | HARB-T15 | Acceptance Criteria (4개) 자동 테스트 스위트 | `tests/acceptance/harness/` | P0 | ✅ | HARB-T01 |
| 16 | HARB-T16 | AC-1: 단일 파일 버그픽스 (prefetch + edit + lint auto → 사람 Diff 승인 1회) | `tests/acceptance/harness/ac1-single-fix.spec.ts` | P0 | ✅ | HARB-T15 |
| 17 | HARB-T17 | AC-2: "테스트 실패 고쳐줘" (실패 로그 → 수정 → 같은 테스트 재실행 루프) | `tests/acceptance/harness/ac2-test-loop.spec.ts` | P0 | ✅ | HARB-T15 |
| 18 | HARB-T18 | AC-3: Ask 모드 (쓰기 0, 인용 코드 실제 파일과 일치) | `tests/acceptance/harness/ac3-ask-accuracy.spec.ts` | P0 | ✅ | HARB-T15 |
| 19 | HARB-T19 | AC-4: 고의로 깨진 tool JSON 10건 중 ≥8건 복구 또는 안전 에러 | `tests/acceptance/harness/ac4-json-recovery.spec.ts` | P0 | ✅ | HARB-T15 |
| 20 | HARB-T20 | Spec-01: Provider Adapter 3계층 (Adapter/Parser/Formatter) 구현 완료 | `src/providers/` | P0 | ✅ | C0-T19 |
| 21 | HARB-T21 | Spec-02: Patch Format (Search-Replace) 파서 + 유일 매칭 + Staleness | `src/patches/` | P0 | ✅ | C2-T04 |
| 22 | HARB-T22 | Spec-03: Context Budget (128k 슬롯: 시스템5%/룰5%/도구8%/스티키12%/대화60%/여유10%) | `src/agent/ContextAssembler.ts` | P0 | ✅ | C3-T09 |
| 23 | HARB-T23 | Spec-04: Terminal Execution (세션별 셸, cwd/env 유지, 타임아웃 30s/10m) | `src/tools/terminal/` | P0 | ✅ | C2-T09 |
| 24 | HARB-T24 | Spec-05: Permission/Autorun (기본 accept_edits, denyGlobs) | `src/permission/` | P0 | ✅ | C4-T01 |
| 25 | HARB-T25 | Spec-06: Checkpoint/Rollback (첫 쓰기/N파일/위험도구/사용자 요청) | `src/checkpoint/` | P0 | ✅ | C4-T03 |
| 26 | HARB-T26 | Spec-07: Context Compaction (4단계: Truncate→Drop→Micro→Full) | `src/compaction/` | P0 | ✅ | C4-T09 |
| 27 | HARB-T27 | Tools-A: Search/Explore (grep/glob/list/read/codebase/lsp) 완성 | `src/tools/search/` | P0 | ✅ | C1-T03 |
| 28 | HARB-T28 | Tools-B: Edit/File (edit/write/delete/reapply/notebook/multiedit + Review UI) | `src/tools/edit/` | P0 | ✅ | C2-T02 |
| 29 | HARB-T29 | Tools-C: Terminal/Process (run/background/await/kill) | `src/tools/terminal/` | P0 | ✅ | C2-T09 |
| 30 | HARB-T30 | Tools-D: Web/Browser/Media (web_search/fetch/browser_*/generate_image/read_lints) | `src/tools/web/`, `src/tools/browser/` | P0 | ✅ | C7-T01 |
| 31 | HARB-T31 | Tools-E: User/Session UX (ask_question/todo_write/fetch_rules/switch_mode) | `src/tools/session/` | P0 | ✅ | C1-T10 |
| 32 | HARB-T32 | Tools-F: Orchestration/Extension (task/MCP/skill/worktree/git/gh) | `src/tools/orchestration/` | P0 | ✅ | C7-T17 |
| 33 | HARB-T33 | Tools-G: Debug Tools (add_instrumentation/collect_logs/request_reproduce/remove_instrumentation) | `src/tools/debug/` | P0 | ✅ | C6-T03 |
| 34 | HARB-T34 | Tool Registry 통합: A-G 모든 도구 등록 + Zod 스키마 + 카테고리/권한 메타 | `src/tools/registry.ts` | P0 | ✅ | HARB-T27 |
| 35 | HARB-T35 | 벤치마크: Flash 모델 10회 연속 read_file/grep 안정 호출 | `tests/bench/flash-stability.bench.ts` | P0 | ✅ | HARB-T06 |
| 36 | HARB-T36 | 벤치마크: 의도적 틀린 SEARCH 10건 → 전부 안전 거절 + 모델 재시도 성공 | `tests/bench/patch-rejection.bench.ts` | P0 | ✅ | C2-T05 |
| 37 | HARB-T37 | 벤치마크: 50턴 세션 창 오버플로 없이 중요 @파일 항상 유지 | `tests/bench/context-budget.bench.ts` | P0 | ✅ | C4-T10 |
| 38 | HARB-T38 | 문서화: 하네스 아키텍처 + Tier 정책 + 안티패턴 가이드 | `docs/harness-guide.md` | P2 | ✅ | HARB-T08 |

---

## 🔄 태스크 상태 업데이트 규칙

1. **작업 시작 시**: `☐` → `🔄` (해당 태스크 ID 행 수정)
2. **작업 완료 시**: `🔄` → `✅` + 커밋 해시/날짜 메모
3. **블록됨**: `☐` → `⏳` + 블록 사유 기입
4. **재작업 필요**: `✅` → `🔁` + 사유 기입

```bash
# 예: C0-T01 완료 후
sed -i 's/| 1 | C0-T01 | .* | ☐ |/| 1 | C0-T01 | 확장 스캐폴드 생성 | ✅ | 2026-07-25 abc1234 |/' TODO_TASKS/MASTER_TASK_INDEX.md
```

---

## 📌 다음 액션 (Right Now)

### C0-C4 ✅ 모두 완료 (170/307 = 55%)

**C5 (Plan Mode)** ✅ 완료 (25/25)

**C6 (Debug Mode)** ✅ 완료 (29/29)

**C7 (Production Grade)** ✅ 완료 (42/46, P2 4개 제외)

**HARB (Harness/Specs)** — ✅ **전체 완료** (38/38):
1. ✅ HARB-T01~T14: Tier 정책 + Verification First + Cursor Pattern + 하네스 의무
2. ✅ HARB-T15~T19: Acceptance Criteria 4개 자동 테스트 스위트
3. ✅ HARB-T20~T26: Spec 7개 (Provider 3층, Patch, Budget, Terminal, Permission, Checkpoint, Compaction)
4. ✅ HARB-T27~T34: Tools A~G + Registry 통합
5. ✅ HARB-T35~T38: Bench 3종 + Docs

---

*Updated: 2026-07-25 | 이 파일은 작업 진행에 따라 실시간 업데이트하세요.*
