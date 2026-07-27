# PRD 문서 인덱스 - AI 코딩 확장 (Agent-K Extension)

> **SSOT (설계 진실)**: [`docs/Extension_high_impact.md`](../Extension_high_impact.md)  
> **인덱스/ownership**: `00_Master_Context.md`  
> **목표**: VS Code/Cursor 확장 API만으로 Cursor급 에이전트 루프 구현 + 중급 로컬 모델(Flash급) 하네스로 안정화

---

## 📁 문서 구조

```
docs/PRDs/
├── README.md                          # 이 파일 (마스터 인덱스)
├── 00_Master_Context.md               # 전체 컨텍스트 & 설계 철학
├── PRD-Traceability-Matrix.md         # 원본↔PRD 추적성
├── PRD-Dependency-Graph.md            # 의존성 그래프
├── PRD-Implementation-Runbook.md      # 구현 런북
├── 01_S_Tier_Immediate_Impact/        # S급 - 즉시 체감, 빠른 임팩트
│   ├── PRD-01_Sidebar_Chat_BYOLLM.md
│   ├── PRD-02_Local_LLM_Provider.md
│   ├── PRD-03_Agent_Loop_Modes.md
│   ├── PRD-04_Inline_Completion.md
│   ├── PRD-05_Selection_Diff_Apply.md
│   ├── PRD-06_Workspace_Tools.md
│   └── PRD-07_Parallel_File_Search.md
├── 02_A_Tier_Production_Grade/        # A급 - 제품급 품질
│   ├── PRD-08_Codebase_Indexing.md
│   ├── PRD-09_MultiFile_Apply_PatchReview.md
│   ├── PRD-10_MCP_Client.md
│   ├── PRD-11_Browser_Design_Mode.md
│   ├── PRD-12_Side_Chat.md
│   ├── PRD-13_Worktree_BestOfN.md
│   ├── PRD-14_Agent_Review_Bugbot.md
│   ├── PRD-15_Memories.md
│   ├── PRD-16_Chat_Search_Artifacts.md
│   ├── PRD-17_Message_Queue.md
│   ├── PRD-18_PR_Issue_Agent.md
│   ├── PRD-19_Test_Generation_FixLoop.md
│   ├── PRD-20_Commit_PR_Generation.md
│   ├── PRD-21_Secrets_Config_Vault.md
│   ├── PRD-28_Skills_Pinned.md
│   └── PRD-29_Settings_Hub.md
├── 03_B_Tier_Domain_Specific/         # B급 - 도메인 특화
│   ├── PRD-22_DGX_vLLM_Provider.md
│   ├── PRD-23_Model_Router.md
│   ├── PRD-23b_Model_Router_AB_Tier.md
│   ├── PRD-24_Firmware_SVD_Register.md
│   ├── PRD-25_Legacy_Scan_Report.md
│   ├── PRD-26_MISRA_Lint_AI.md
│   └── PRD-27_Serial_Monitor.md
├── 04_Implementation_Phases/          # 구현 단계별 (C0-C7)
│   ├── PRD-C0_Chat_UI_Streaming.md
│   ├── PRD-C1_Ask_Mode.md
│   ├── PRD-C2_Agent_SingleTurn.md
│   ├── PRD-C3_Agent_MultiTurn.md
│   ├── PRD-C4_Infrastructure.md
│   ├── PRD-C5_Plan_Mode.md
│   ├── PRD-C6_Debug_Mode.md
│   └── PRD-C7_Production_Grade.md
├── 05_Core_Infrastructure/            # 핵심 인프라 (에이전트 루프 바텀업)
│   ├── PRD-Infra-01_Instructions_Rules.md
│   ├── PRD-Infra-02_Context_Assembly.md
│   ├── PRD-Infra-03_Indexing_SemanticSearch.md
│   ├── PRD-Infra-04_Tool_Registry.md
│   ├── PRD-Infra-05_Permission_Autorun.md
│   ├── PRD-Infra-06_Hooks.md
│   ├── PRD-Infra-07_Streaming_Tool_Executor.md
│   ├── PRD-Infra-08_Parallel_Serial_Policy.md
│   ├── PRD-Infra-09_Checkpoints_Rollback.md
│   ├── PRD-Infra-10_Context_Compaction.md
│   ├── PRD-Infra-11_Doom_Loop_Detection.md
│   ├── PRD-Infra-12_MaxTurns_Timeout_Stop.md
│   ├── PRD-Infra-13_Error_Recovery.md
│   ├── PRD-Infra-14_Tool_Call_Orchestration.md
│   ├── PRD-Infra-15_Prefetch_Pipeline.md
│   ├── PRD-Infra-16_Telemetry_Observability.md
│   ├── PRD-Infra-17_Extension_Lifecycle_Config.md
│   ├── PRD-Infra-18_Workspace_Indexer.md
│   ├── PRD-Infra-19_Session_Manager.md
│   ├── PRD-Infra-20_Agent_Loop_Controller.md
│   ├── PRD-Infra-21_Model_Router_Provider_Adapter.md
│   ├── PRD-Infra-22_Cost_Tracker_Budget_Guard.md
│   └── PRD-Infra-23_Multi_Workspace_Remote.md
├── 06_Tool_Catalog/                   # 도구 카탈로그 (원본 A–G 문자 고정)
│   ├── PRD-Tools-A_Search_Explore.md
│   ├── PRD-Tools-B_Edit_File.md
│   ├── PRD-Tools-C_Terminal_Process.md
│   ├── PRD-Tools-D_Web_Browser_Media.md
│   ├── PRD-Tools-E_Session_UX.md
│   ├── PRD-Tools-F_Orchestration_Extension.md
│   └── PRD-Tools-G_Debug_Tools.md
├── 07_Medium_Model_Harness/           # 중급 모델용 하네스 (핵심 차별점)
│   ├── PRD-Harness-01_Model_Tiers.md
│   ├── PRD-Harness-02_Verification_First.md
│   ├── PRD-Harness-03_Cursor_Pattern.md
│   ├── PRD-Harness-04_Memories_Minimal.md
│   ├── PRD-Harness-05_Design_Slogans.md
│   ├── PRD-Harness-06_A_Tier_Whitelist.md
│   ├── PRD-Harness-07_Prompt_Turn_Structure.md
│   ├── PRD-Harness-08_Harness_Duties.md
│   ├── PRD-Harness-09_Prefetch_Pattern.md
│   ├── PRD-Harness-10_Verification_MicroLoop.md
│   ├── PRD-Harness-11_Context_Rules.md
│   ├── PRD-Harness-12_Routing_Heuristics.md
│   ├── PRD-Harness-13_UX_For_Medium.md
│   ├── PRD-Harness-14_Dont_Do_Medium.md
│   └── PRD-Harness-15_Acceptance_Criteria.md
└── 08_Advanced_Specs/                 # 심화 스펙 (①-⑦)
    ├── PRD-Spec-01_Provider_ToolJSON.md
    ├── PRD-Spec-02_Patch_Format.md
    ├── PRD-Spec-03_Context_Budget.md
    ├── PRD-Spec-04_Terminal_Execution.md
    ├── PRD-Spec-05_Permission_Autorun.md
    ├── PRD-Spec-06_Checkpoint_Rollback.md
    └── PRD-Spec-07_Context_Compaction.md
```

---

## 🎯 우선순위 및 구현 순서

### 즉시 시작 (C0-C2 + S급 핵심)
| 순번 | PRD | 단계 | 비고 |
|------|-----|------|------|
| 1 | `PRD-C0_Chat_UI_Streaming.md` | C0 | 확장 스캐폴드 + 채팅 UI |
| 2 | `PRD-Spec-01_Provider_ToolJSON.md` | ① | Provider 어댑터 + Tool JSON 파서 |
| 3 | `PRD-02_Local_LLM_Provider.md` | 1 | DGX Flash / LiteLLM 연동 |
| 4 | `PRD-C1_Ask_Mode.md` | C1 | 읽기 전용 도구 + 병렬 실행 |
| 5 | `PRD-Harness-09_Prefetch_Pattern.md` | - | 사용자 메시지 프리페치 |
| 6 | `PRD-C2_Agent_SingleTurn.md` | C2 | Search-Replace + Diff 승인 |
| 7 | `PRD-Harness-10_Verification_MicroLoop.md` | - | edit 후 자동 lint/test |
| 8 | `PRD-Spec-02_Patch_Format.md` | ② | Search-Replace 패치 포맷 |
| 9 | `PRD-Harness-15_Acceptance_Criteria.md` | - | 중급 하네스 수용 테스트 4개 |

### 이후 단계 (C3-C4 + A급 핵심)
| 순번 | PRD | 단계 |
|------|-----|------|
| 10 | `PRD-C3_Agent_MultiTurn.md` | C3 |
| 11 | `PRD-C4_Infrastructure.md` | C4 |
| 12 | `PRD-Infra-09_Checkpoints_Rollback.md` | ⑥ |
| 13 | `PRD-Infra-10_Context_Compaction.md` | ⑦ |
| 14 | `PRD-08_Codebase_Indexing.md` | A급 시작 |
| 15 | `PRD-09_MultiFile_Apply_PatchReview.md` | A급 |
| 16 | `PRD-10_MCP_Client.md` | A급 |
| 17 | `PRD-C5_Plan_Mode.md` | C5 |
| 18 | `PRD-C6_Debug_Mode.md` | C6 |
| 19 | `PRD-C7_Production_Grade.md` | C7 |

---

## 📋 각 PRD 문서 공통 구조

모든 PRD 문서는 다음 섹션을 포함합니다:

1. **Overview** - 기능 개요, 목적, 비즈니스 가치
2. **User Stories** - 사용자 시나리오 (As a... I want... So that...)
3. **Functional Requirements** - 기능 요구사항 (번호 매겨진 목록)
4. **Non-Functional Requirements** - 성능, 보안, UX 등
5. **API & Technical Spec** - VS Code API, 데이터 구조, 인터페이스
6. **UI/UX Specification** - 화면 설계, 인터랙션 플로우
7. **Acceptance Criteria** - 인수 기준 (Given/When/Then)
8. **Dependencies** - 선행 의존성, 관련 PRD (**존재하는 파일명만**)
9. **Implementation Phases** - 단계별 구현 계획
10. **Out of Scope** - 비목표 (Master Context Non-Goals 인용)
11. **Risks & Mitigations** - 리스크 및 대응 방안
12. **References** - 원본 `Extension_high_impact.md` 섹션

**SSOT**: 설계 진실은 [`docs/Extension_high_impact.md`](../Extension_high_impact.md). 중복 주제는 Master Context **Canonical Owner Matrix**의 Primary만 구현 계약.

---

## 🔗 빠른 링크 (카테고리별)

### S급 - 즉시 체감 (7개)
| # | 기능 | PRD | 핵심 API |
|---|------|-----|----------|
| 1 | 사이드바 AI 채팅 + BYOLLM | [PRD-01](./01_S_Tier_Immediate_Impact/PRD-01_Sidebar_Chat_BYOLLM.md) | Chat Participant, Webview, LM Chat Provider |
| 2 | 로컬/LiteLLM/Ollama 연결 | [PRD-02](./01_S_Tier_Immediate_Impact/PRD-02_Local_LLM_Provider.md) | LM Chat Provider, OpenAI-compatible HTTP |
| 3 | Cursor형 Agent 루프 (4모드) | [PRD-03](./01_S_Tier_Immediate_Impact/PRD-03_Agent_Loop_Modes.md) | LM Tools, `workspace.applyEdit`, Terminal API |
| 4 | 인라인 자동완성 (자체 모델) | [PRD-04](./01_S_Tier_Immediate_Impact/PRD-04_Inline_Completion.md) | `InlineCompletionItemProvider` |
| 5 | 선택 영역 → 수정 제안 + Diff | [PRD-05](./01_S_Tier_Immediate_Impact/PRD-05_Selection_Diff_Apply.md) | Commands, WorkspaceEdit, DiffEditor |
| 6 | 워크스페이스 도구 세트 | [PRD-06](./01_S_Tier_Immediate_Impact/PRD-06_Workspace_Tools.md) | 도구 카탈로그 전체 |
| 7 | 병렬 파일 탐색·읽기 | [PRD-07](./01_S_Tier_Immediate_Impact/PRD-07_Parallel_File_Search.md) | `findFiles` + `Promise.all` / concurrency 큐 |

### A급 - 제품급 (16개)
| # | 기능 | PRD |
|---|------|-----|
| 8 | 코드베이스 인덱싱 + @codebase | [PRD-08](./02_A_Tier_Production_Grade/PRD-08_Codebase_Indexing.md) |
| 9 | 멀티파일 Apply / 패치 리뷰 UI | [PRD-09](./02_A_Tier_Production_Grade/PRD-09_MultiFile_Apply_PatchReview.md) |
| 10 | MCP 클라이언트 | [PRD-10](./02_A_Tier_Production_Grade/PRD-10_MCP_Client.md) |
| 11 | Browser + Design Mode | [PRD-11](./02_A_Tier_Production_Grade/PRD-11_Browser_Design_Mode.md) |
| 12 | Side chat (`/side`) | [PRD-12](./02_A_Tier_Production_Grade/PRD-12_Side_Chat.md) |
| 13 | Worktree / Best-of-N | [PRD-13](./02_A_Tier_Production_Grade/PRD-13_Worktree_BestOfN.md) |
| 14 | Agent Review / 로컬 Bugbot | [PRD-14](./02_A_Tier_Production_Grade/PRD-14_Agent_Review_Bugbot.md) |
| 15 | Memories | [PRD-15](./02_A_Tier_Production_Grade/PRD-15_Memories.md) |
| 16 | 대화 검색 · 아티팩트 | [PRD-16](./02_A_Tier_Production_Grade/PRD-16_Chat_Search_Artifacts.md) |
| 17 | 메시지 큐 | [PRD-17](./02_A_Tier_Production_Grade/PRD-17_Message_Queue.md) |
| 18 | PR/이슈 연동 에이전트 | [PRD-18](./02_A_Tier_Production_Grade/PRD-18_PR_Issue_Agent.md) |
| 19 | 테스트 생성 · 실패 수정 루프 | [PRD-19](./02_A_Tier_Production_Grade/PRD-19_Test_Generation_FixLoop.md) |
| 20 | 커밋 메시지 · PR 설명 생성 | [PRD-20](./02_A_Tier_Production_Grade/PRD-20_Commit_PR_Generation.md) |
| 21 | 시크릿/설정 금고 UI | [PRD-21](./02_A_Tier_Production_Grade/PRD-21_Secrets_Config_Vault.md) |
| 28 | Skills / 핀 스킬 | [PRD-28](./02_A_Tier_Production_Grade/PRD-28_Skills_Pinned.md) |
| 29 | 설정 허브 (Settings Hub) | [PRD-29](./02_A_Tier_Production_Grade/PRD-29_Settings_Hub.md) |

### B급 - 도메인 특화 (6개)
| # | 기능 | PRD |
|---|------|-----|
| 22 | DGX / vLLM / TRT-LLM 원클릭 프로바이더 | [PRD-22](./03_B_Tier_Domain_Specific/PRD-22_DGX_vLLM_Provider.md) |
| 23 | 모델 라우터 (Cost/Balance/Intelligence) | [PRD-23](./03_B_Tier_Domain_Specific/PRD-23_Model_Router.md) |
| 23b | 모델 라우터 A/B 티어 | [PRD-23b](./03_B_Tier_Domain_Specific/PRD-23b_Model_Router_AB_Tier.md) |
| 24 | 펌웨어: SVD 뷰어 · 레지스터 패널 | [PRD-24](./03_B_Tier_Domain_Specific/PRD-24_Firmware_SVD_Register.md) |
| 25 | 레거시 스캔 → 리포트 | [PRD-25](./03_B_Tier_Domain_Specific/PRD-25_Legacy_Scan_Report.md) |
| 26 | MISRA/린트 AI 설명 | [PRD-26](./03_B_Tier_Domain_Specific/PRD-26_MISRA_Lint_AI.md) |
| 27 | 시리얼 모니터 패널 | [PRD-27](./03_B_Tier_Domain_Specific/PRD-27_Serial_Monitor.md) |

### 핵심 인프라 (23개) — 에이전트 루프의 기반
| # | 기능 | PRD |
|---|------|-----|
| 1 | Instructions & Rules (시스템 프롬프트/규칙) | [PRD-Infra-01](./05_Core_Infrastructure/PRD-Infra-01_Instructions_Rules.md) |
| 2 | Context Assembly (컨텍스트 조립/예산) | [PRD-Infra-02](./05_Core_Infrastructure/PRD-Infra-02_Context_Assembly.md) |
| 3 | Indexing & Semantic Search | [PRD-Infra-03](./05_Core_Infrastructure/PRD-Infra-03_Indexing_SemanticSearch.md) |
| 4 | Tool Registry (도구 레지스트리/스키마) | [PRD-Infra-04](./05_Core_Infrastructure/PRD-Infra-04_Tool_Registry.md) |
| 5 | Permission & Autorun (권한/자동실행) | [PRD-Infra-05](./05_Core_Infrastructure/PRD-Infra-05_Permission_Autorun.md) |
| 6 | Hooks (훅 시스템) | [PRD-Infra-06](./05_Core_Infrastructure/PRD-Infra-06_Hooks.md) |
| 7 | Streaming Tool Executor | [PRD-Infra-07](./05_Core_Infrastructure/PRD-Infra-07_Streaming_Tool_Executor.md) |
| 8 | Parallel/Serial Policy | [PRD-Infra-08](./05_Core_Infrastructure/PRD-Infra-08_Parallel_Serial_Policy.md) |
| 9 | Checkpoints & Rollback | [PRD-Infra-09](./05_Core_Infrastructure/PRD-Infra-09_Checkpoints_Rollback.md) |
| 10 | Context Compaction (4단계 압축) | [PRD-Infra-10](./05_Core_Infrastructure/PRD-Infra-10_Context_Compaction.md) |
| 11 | Doom Loop Detection | [PRD-Infra-11](./05_Core_Infrastructure/PRD-Infra-11_Doom_Loop_Detection.md) |
| 12 | MaxTurns / Timeout / Stop | [PRD-Infra-12](./05_Core_Infrastructure/PRD-Infra-12_MaxTurns_Timeout_Stop.md) |
| 13 | Error Recovery | [PRD-Infra-13](./05_Core_Infrastructure/PRD-Infra-13_Error_Recovery.md) |
| 14 | Tool Call Orchestration | [PRD-Infra-14](./05_Core_Infrastructure/PRD-Infra-14_Tool_Call_Orchestration.md) |
| 15 | Prefetch Pipeline | [PRD-Infra-15](./05_Core_Infrastructure/PRD-Infra-15_Prefetch_Pipeline.md) |
| 16 | Telemetry & Observability | [PRD-Infra-16](./05_Core_Infrastructure/PRD-Infra-16_Telemetry_Observability.md) |
| 17 | Extension Lifecycle & Config | [PRD-Infra-17](./05_Core_Infrastructure/PRD-Infra-17_Extension_Lifecycle_Config.md) |
| 18 | Workspace Indexer | [PRD-Infra-18](./05_Core_Infrastructure/PRD-Infra-18_Workspace_Indexer.md) |
| 19 | Session Manager | [PRD-Infra-19](./05_Core_Infrastructure/PRD-Infra-19_Session_Manager.md) |
| 20 | Agent Loop Controller | [PRD-Infra-20](./05_Core_Infrastructure/PRD-Infra-20_Agent_Loop_Controller.md) |
| 21 | Model Router & Provider Adapter | [PRD-Infra-21](./05_Core_Infrastructure/PRD-Infra-21_Model_Router_Provider_Adapter.md) |
| 22 | Cost Tracker & Budget Guard | [PRD-Infra-22](./05_Core_Infrastructure/PRD-Infra-22_Cost_Tracker_Budget_Guard.md) |
| 23 | Multi-Workspace & Remote | [PRD-Infra-23](./05_Core_Infrastructure/PRD-Infra-23_Multi_Workspace_Remote.md) |

### 도구 카탈로그 (7개) — `Extension_high_impact.md` A–G와 동일
| # | 카테고리 | PRD |
|---|----------|-----|
| A | Search · Explore (grep/glob/read/list/codebase_search/lsp) | [PRD-Tools-A](./06_Tool_Catalog/PRD-Tools-A_Search_Explore.md) |
| B | Edit · File (`edit_file` / write / delete + Review UI) | [PRD-Tools-B](./06_Tool_Catalog/PRD-Tools-B_Edit_File.md) |
| C | Terminal · Process (`run_terminal_cmd` allowlist for Tier A) | [PRD-Tools-C](./06_Tool_Catalog/PRD-Tools-C_Terminal_Process.md) |
| D | Web · Browser · Media (`web_*`, `browser_*`=C7, `read_lints`) | [PRD-Tools-D](./06_Tool_Catalog/PRD-Tools-D_Web_Browser_Media.md) |
| E | User · Session UX (ask_question / todo / rules / switch_mode) | [PRD-Tools-E](./06_Tool_Catalog/PRD-Tools-E_Session_UX.md) |
| F | Orchestration · Extension (task / MCP / skill / worktree) | [PRD-Tools-F](./06_Tool_Catalog/PRD-Tools-F_Orchestration_Extension.md) |
| G | Debug Mode Tools (계측 · 재현 · 로그 · 청소) | [PRD-Tools-G](./06_Tool_Catalog/PRD-Tools-G_Debug_Tools.md) |

> 도메인 특화(SVD/시리얼/MISRA/레거시)는 Tools 문자가 아니라 [PRD-24](./03_B_Tier_Domain_Specific/PRD-24_Firmware_SVD_Register.md)~[PRD-27](./03_B_Tier_Domain_Specific/PRD-27_Serial_Monitor.md).  
> Canonical owner / Non-Goals: [00_Master_Context.md](./00_Master_Context.md)

### Medium Model Harness (15개) — Flash-tier 안정화 핵심
| # | 주제 | PRD |
|---|------|-----|
| 1 | Model Tiers (A/B/C 정의) | [PRD-Harness-01](./07_Medium_Model_Harness/PRD-Harness-01_Model_Tiers.md) |
| 2 | Verification First (검증 우선 철학) | [PRD-Harness-02](./07_Medium_Model_Harness/PRD-Harness-02_Verification_First.md) |
| 3 | Cursor Pattern (Think→Act→Verify) | [PRD-Harness-03](./07_Medium_Model_Harness/PRD-Harness-03_Cursor_Pattern.md) |
| 4 | Memories Minimal | [PRD-Harness-04](./07_Medium_Model_Harness/PRD-Harness-04_Memories_Minimal.md) |
| 5 | Design Slogans | [PRD-Harness-05](./07_Medium_Model_Harness/PRD-Harness-05_Design_Slogans.md) |
| 6 | A-Tier Whitelist | [PRD-Harness-06](./07_Medium_Model_Harness/PRD-Harness-06_A_Tier_Whitelist.md) |
| 7 | Prompt/Turn Structure | [PRD-Harness-07](./07_Medium_Model_Harness/PRD-Harness-07_Prompt_Turn_Structure.md) |
| 8 | Harness Duties (9가지 의무) | [PRD-Harness-08](./07_Medium_Model_Harness/PRD-Harness-08_Harness_Duties.md) |
| 9 | Prefetch Pattern | [PRD-Harness-09](./07_Medium_Model_Harness/PRD-Harness-09_Prefetch_Pattern.md) |
| 10 | Verification Micro-Loop | [PRD-Harness-10](./07_Medium_Model_Harness/PRD-Harness-10_Verification_MicroLoop.md) |
| 11 | Context Rules (보호 구간) | [PRD-Harness-11](./07_Medium_Model_Harness/PRD-Harness-11_Context_Rules.md) |
| 12 | Routing Heuristics | [PRD-Harness-12](./07_Medium_Model_Harness/PRD-Harness-12_Routing_Heuristics.md) |
| 13 | UX for Medium Model | [PRD-Harness-13](./07_Medium_Model_Harness/PRD-Harness-13_UX_For_Medium.md) |
| 14 | Don't Do Medium (안티패턴) | [PRD-Harness-14](./07_Medium_Model_Harness/PRD-Harness-14_Dont_Do_Medium.md) |
| 15 | Acceptance Criteria (통합 테스트) | [PRD-Harness-15](./07_Medium_Model_Harness/PRD-Harness-15_Acceptance_Criteria.md) |

### 심화 스펙 ①-⑦
| # | 주제 | PRD |
|---|------|-----|
| ① | Provider & Tool JSON | [PRD-Spec-01](./08_Advanced_Specs/PRD-Spec-01_Provider_ToolJSON.md) |
| ② | Patch Format (Search/Replace) | [PRD-Spec-02](./08_Advanced_Specs/PRD-Spec-02_Patch_Format.md) |
| ③ | Context Budget (128k 슬롯) | [PRD-Spec-03](./08_Advanced_Specs/PRD-Spec-03_Context_Budget.md) |
| ④ | Terminal Execution | [PRD-Spec-04](./08_Advanced_Specs/PRD-Spec-04_Terminal_Execution.md) |
| ⑤ | Permission & Autorun | [PRD-Spec-05](./08_Advanced_Specs/PRD-Spec-05_Permission_Autorun.md) |
| ⑥ | Checkpoint & Rollback | [PRD-Spec-06](./08_Advanced_Specs/PRD-Spec-06_Checkpoint_Rollback.md) |
| ⑦ | Context Compaction (4단계) | [PRD-Spec-07](./08_Advanced_Specs/PRD-Spec-07_Context_Compaction.md) |

---

## 📌 마스터 컨텍스트 문서

| 문서 | 설명 |
|------|------|
| [00_Master_Context.md](./00_Master_Context.md) | 전체 프로젝트 컨텍스트, 설계 철학, 아키텍처 개요, 용어 정의 |

---

## 🔄 문서 버전 관리

| 버전 | 날짜 | 변경사항 |
|------|------|----------|
| v1.0 | 2025-01-XX | 초기 생성 (Extension_high_impact.md 기반) |
| v1.1 | 2025-07-25 | Core Infrastructure 23개, Tool Catalog 7개, Advanced Specs 7개 추가 완료 |
| v1.2 | 2026-07-25 | Tools A–G 원본 taxonomy 정렬, 교차참조 감사, SSOT/ownership/Out of Scope, PRD-28 Skills |
| v1.3 | 2026-07-25 | PRD-29 Settings Hub · Infra-17 queue/harness 키 · 원본 설정 절 정합 |
| v1.4 | 2026-07-25 | Master 중복 제거 · Permission 기본=`accept_edits` · C0 Settings FR · `agent-k.*` ID 통일 |

---

> **참고**: 각 PRD는 독립적으로 읽을 수 있도록 작성되었으나, 의존성이 있는 경우 `Dependencies` 섹션에 명시되어 있습니다. 구현 시에는 **Implementation Phases (C0-C7)** 순서를 따르는 것을 권장합니다.