# Agent Handoff: HARB (Medium Model Harness) T01–T38

> **Created**: 2026-07-25  
> **Plan**: `.cursor/plans/harb_harness_kickoff_920783f2.plan.md` (or Cursor Plans: *HARB harness kickoff*)  
> **Repo**: `/Users/kong-yujun/workspace/agent-k`  
> **Status**: **COMPLETE (2026-07-25)** — Phase A/B 핵심 배선·AC 스위트 구현됨. `npm run test:harness` (6 passing) + `npm run compile`로 검증.

### 잔여 갭 (정직한 후속 — MVP 게이트 외)

| 항목 | 상태 |
|------|------|
| `callModel` 실 LLM E2E (LiteLLM 라이브) | 로컬 프록시 필요 — `mockResponse`/`provider` 주입으로 AC/단위는 커버 |
| VS Code `read_lints` → `vscode.languages.getDiagnostics` | `LintRunner`는 파일 휴리스틱 + 확장 호스트 연동 TODO |
| `docs/harness-guide.md` | **작성됨** (상태 38/38 + residual) |

---

## ⛔ STOP — 완료 착각 금지

리웍(C5–C7)과 동일 규칙을 적용한다.

| 착각 | 실제 필요 |
|------|-----------|
| `src/harness/*.ts` 파일이 있다 | `AgentLoopController` / `ContextAssembler` / `toolRegistry`에 **호출·필터**됨 |
| PrefetchEngine 클래스가 있다 | 턴 시작 전 `prefetch()` 결과가 컨텍스트에 **주입** |
| `autoVerificationHook` 있다 | `edit_file`/`write_file` 후 HookSystem 경로로 **실행** |
| ModelRouter 있다 | 루프가 tier를 읽고 `getSchemas(mode, tier)` + RoutingHeuristics 승격 |
| AC 스펙 파일이 있다 | fixture로 **그린** (compile만으로 done 금지) |
| `DONE_TASKS` C* rework | HARB와 무관하게 **제품 미완**으로 취급 |

### Definition of Done (모든 HARB-* 공통)

1. 해당 JSON `acceptanceCriteria` + 대응 PRD 절을 코드로 증명  
2. 배선 증거: `rg`로 import/호출 경로 제시  
3. `npm run compile` (0 errors)  
4. Phase B는 `tests/acceptance/harness/ac*.spec.ts` 통과  
5. 완료 시 `TODO_TASKS/tasks/HARB/HARB-Txx.json` → `DONE_TASKS/HARB/` 이동 + MASTER ☐→✅  
6. JSON만 `status:done` 찍고 끝내기 **금지**

---

## SSOT / 문서

| 문서 | 용도 |
|------|------|
| `docs/Extension_high_impact.md` | 제품 SSOT (중급 하네스 대목) |
| `PRDs/07_Medium_Model_Harness/PRD-Harness-01` … `15` | Tier/Whitelist/AC 상세 |
| `PRDs/08_Advanced_Specs/` | Spec-01…07 (T20–T26) |
| `PRDs/06_Tool_Catalog/` | Tools A–G (T27–T34) |
| `TODO_TASKS/tasks/HARB/HARB-T*.json` | 작업 큐 (AC가 짧은 stub면 **PRD로 보강**하며 진행) |
| `TODO_TASKS/MASTER_TASK_INDEX.md` | HARB 행 ☐ 동기화 |

**선행 완료(참고):** `REWORK_TASKS/` 활성 큐 **0**. 리웍 잔여 갭: `callModel` 스텁, SecretsTab SecretStorage — HARB Phase A에서 `callModel`을 LiteLLM+Parser에 연결하는 것이 병목 해소와 겹침.

---

## 현황 (착수 시점 실측)

### 없음 (신규)

- `src/harness/` 전체
- `tests/acceptance/harness/`
- `docs/harness-guide.md`
- `src/providers/RoutingHeuristics.ts`
- HARB 전용 bench: `tests/bench/flash-stability.bench.ts` 등

### 재사용 (파일 있음 · **루프 미배선**)

| 모듈 | 경로 | 갭 |
|------|------|-----|
| Prefetch | `src/prefetch/PrefetchEngine.ts` | Loop/Assembler 미호출 |
| Auto-verify | `src/hooks/autoVerificationHook.ts` | `executeTool` 후 미호출 |
| Context budget | `src/agent/ContextAssembler.ts` | 하네스 프롬프트 블록 미주입 |
| Compaction | `src/compaction/CompactionEngine.ts` | 루프 미연결 |
| Permission | `src/permission/PermissionGate.ts` | denyGlobs 설정 미로드 |
| ModelRouter | `src/providers/ModelRouter.ts` | 루프 미사용 |
| Provider 3층 | `LiteLLMProvider` / `ToolCallParser` / `ToolResultFormatter` | `callModel()` 스텁 |
| Patches | `src/patches/*`, `writeExecutors.ts` | staleness 미연결 |
| Registry | `src/tools/registry.ts` `getSchemas(mode)` | **tier 필터 없음** |
| Terminal | `src/tools/terminal/TerminalTool.ts` | 세션 cwd/env·bg/await 미완 |

---

## 실행 순서 (필수)

```
Phase A Foundation
  HARB-T01 ModelTiers
  → T06 AWhitelist (+ registry getSchemas tier)
  → T02 VerificationFirst / T05 Slogans / T03 CursorPattern
  → T07 PromptTurnStructure / T14 DontDoMedium
  → T09 Prefetch 배선 / T10 Verification 배선 / T08 HarnessDuties
  → T12 RoutingHeuristics / T11 ContextRules / T04 MinimalMemories / T13 UXForMedium
  → callModel → LiteLLM + Parser/Formatter (mock 주입 가능)

Phase B Acceptance MVP  ← 하네스 MVP 게이트
  T15 suite + T16 AC-1 + T17 AC-2 + T18 AC-3 + T19 AC-4
  (결정적 fixture 우선; 라이브 Flash 불요)

Phase C Specs T20–T26
Phase D Tools T27–T34
Phase E Bench T35–T37 + Docs T38
```

MVP 완료 조건: Phase A 배선 증거 + AC-1…4 그린.

---

## Phase별 구현 체크리스트

### Phase A — `src/harness/` + 배선

생성할 파일 (PRD 파일명과 정렬):

- `src/harness/ModelTiers.ts`
- `src/harness/VerificationFirstPrompt.ts`
- `src/harness/CursorPattern.ts`
- `src/harness/MinimalMemories.ts`
- `src/harness/DesignSlogans.ts`
- `src/harness/AWhitelist.ts` — Tier A **정확히 10**:  
  `grep, glob, list_dir, read_file, edit_file, write_file, run_terminal_cmd, read_lints, ask_question, todo_write`  
  (`codebase_search`/`lsp_*`/`switch_mode`/`fetch_rules` = optional 기본 off)  
  deny: `delete_file`, `browser_*`, bulk `mcp_*`, multi-task
- `src/harness/PromptTurnStructure.ts` — 턴당 tool 캡, read-before-edit
- `src/harness/HarnessDuties.ts` — 9 duties
- `src/harness/ContextRules.ts`
- `src/harness/DontDoMedium.ts`
- `src/harness/UXForMedium.tsx` — ChatApp 마운트
- `src/providers/RoutingHeuristics.ts` — Plan 대형→B, lint 2회→B, JSON 3회→세션 중단
- `src/harness/index.ts` — re-export

배선 타깃:

1. `toolRegistry.getSchemas(mode, tier?)` → Tier A면 `AWhitelist.filter`
2. `ContextAssembler.assemble` → VerificationFirst + Slogans + CursorPattern (+ prefetch sticky)
3. `AgentLoopController`  
   - 턴 시작: `PrefetchEngine.prefetch`  
   - `edit_file`/`write_file` 후: `createAutoVerificationHook`  
   - `PromptTurnStructure` / `DontDoMedium` 가드  
   - `RoutingHeuristics` 카운터  
   - `callModel`: LiteLLMProvider (테스트용 mock provider 주입 슬롯)
4. CompactionEngine 예산 초과 시 호출; ConfigManager → `PermissionGate.setDenyGlobs`

### Phase B — Acceptance

경로: `tests/acceptance/harness/`

| ID | 파일 | 요지 |
|----|------|------|
| T16 | `ac1-single-fix.spec.ts` | prefetch 주입 → edit unique match → lint → Diff 승인 1회 시뮬 |
| T17 | `ac2-test-loop.spec.ts` | 실패 로그 → edit → test 재실행 mock ≤2 |
| T18 | `ac3-ask-accuracy.spec.ts` | ask에서 write 0; 인용 바이트 일치 |
| T19 | `ac4-json-recovery.spec.ts` | 깨진 JSON 10건 ≥8 복구 또는 안전 에러 |

기존 E2E(`c1-ask-mode` 등)는 **대체 아님** — harness AC는 별도 스위트.

### Phase C — Specs (갭필만, 대형 재작성 금지)

- T20 Provider 3층 → `callModel` 경로 증빙  
- T21 staleness → `writeExecutors`/`applier`  
- T22 Assembler 예산 % 테스트 강화  
- T23/T29 Terminal 세션 cwd/env + background/await/kill 최소 API  
- T24 denyGlobs 설정 키  
- T25 첫 쓰기 checkpoint 트리거  
- T26 compaction 루프 훅  

### Phase D — Tools A–G

- `read_lints` 레지스트리 등록  
- search/edit 경로 정리 또는 re-export  
- Zod 스키마 점진 추가  
- 이미 배선된 debug/MCP/task는 AC/grep 증빙  

### Phase E — Bench + Docs

- `tests/bench/flash-stability.bench.ts` (mock provider)  
- `tests/bench/patch-rejection.bench.ts`  
- `tests/bench/context-budget.bench.ts` (50턴 스티키)  
- `docs/harness-guide.md`  

---

## Copy-paste prompt (다음 에이전트용)

```
Continue Agent-K HARB in /Users/kong-yujun/workspace/agent-k.

CRITICAL: Read TODO_TASKS/HARB_AGENT_HANDOFF.md fully (완료 착각 금지).
Plan: HARB harness kickoff (Phase A→E). SSOT = docs/Extension_high_impact.md + docs/PRDs/07_Medium_Model_Harness/.

Do NOT mark HARB-T* done based on file existence alone.
Prove wiring: getSchemas tier filter, Prefetch in loop, autoVerification after edit, callModel not stub.

Start with HARB-T01 + HARB-T06 only. Report in Korean: trap cleared? evidence (rg paths)?
Then proceed T02/T05/T03 → loop wiring → AC suite.
Respond to user in Korean; code/IDs in English. Add comments during development.
```

---

## 완료 이동 절차

```bash
# 증거 확인 후
mkdir -p DONE_TASKS/HARB
# 해당 HARB-Txx.json 을 DONE_TASKS/HARB/ 로 이동, status=done, verifiedAt, verification 필드 추가
python3 REWORK_TASKS/scripts/sync-master-index.py --update-index
npm run compile
```

MASTER HARB 대시보드: 현재 38 pending → 완료 수·✅ 행 갱신.

---

## 정직 잔여 (계획상 허용)

- 라이브 Flash 벤치(T35)는 mock 우선; 실모델은 플래그/수동  
- SecretsTab SecretStorage는 HARB 범위 밖 (리웍 잔여)  
- `TODO_TASKS/tasks/HARB/*.json`의 AC 문자열이 stub(`"enum"`)인 경우 → 구현 시 PRD Acceptance로 보강  

---

## 관련 핸드오프

- 리웍 완료: `REWORK_TASKS/AGENT_HANDOFF.md` (큐 drained; HARB와 별개)
