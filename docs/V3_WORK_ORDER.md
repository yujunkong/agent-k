# v3.0 작업 순서 (Work Order)

**참조 브랜치:** `v2.1-PRODUCTION-MODE` (읽기 전용)  
**쓰기 브랜치:** `v3.0`  
**패키지 정의:** `docs/AGENT-K-MONOREPO-FINAL.md`  
**작업 방식:** `docs/V3_WORK_PLAN.md`  
**Feature 권위:** `docs/AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md` (배치 후 이 파일이 `[x]` 기준)

체크 표시: `[ ]` 미착수 · `[~]` 진행 중 · `[x]` 8항목 통과 완료

Master 파일이 아직 없으면 아래 **ID 범위**로 티켓을 쪼개고, Master 도착 시 ID를 1:1로 치환·상세화한다.

---

## D — 문서 / 리셋

| ID | 작업 | 상태 |
|----|------|------|
| D-001 | v3.0 orphan 리셋 (코드 없음) | [x] |
| D-002 | `docs/AGENT-K-MONOREPO-FINAL.md` 배치 | [x] |
| D-003 | `docs/V3_WORK_PLAN.md` 작성 | [x] |
| D-004 | `docs/V3_WORK_ORDER.md` 작성 (이 파일) | [x] |
| D-005 | Feature Master 원본을 `docs/AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md`로 추가 | [ ] |
| D-006 | Master와 이 Work Order ID를 대조해 티켓 세분화 | [ ] |

---

## S — 스켈레톤 (코드 최소, 동작 Feature 아님)

Monorepo Final A-2 구조만. 도메인 로직 이식은 Phase 0부터.

| ID | 작업 | 패키지 | 상태 |
|----|------|--------|------|
| S-001 | 루트 workspace `package.json` + workspaces | root | [ ] |
| S-002 | `extensions/agent-k` 빈 조립 패키지 (package.json만) | extensions/agent-k | [ ] |
| S-003 | `packages/shared` 빈 패키지 | shared | [ ] |
| S-004 | `packages/host` 빈 패키지 | host | [ ] |
| S-005 | `packages/chat-ui` 빈 패키지 | chat-ui | [ ] |
| S-006 | `packages/core` 빈 패키지 | core | [ ] |
| S-007 | `packages/tools` 빈 패키지 | tools | [ ] |
| S-008 | `packages/providers` 빈 패키지 | providers | [ ] |
| S-009 | `packages/plan` / `worktree` / `safety` stub (2차) | plan, worktree, safety | [ ] |
| S-010 | 루트 `AGENTS.md` (Monorepo Final Part B) | root | [ ] |
| S-011 | `.cursor/rules/*.mdc` (Monorepo Final Part C) | .cursor/rules | [ ] |
| S-012 | README에 스켈레톤 후 빌드/실행 방법 (최소) | root | [ ] |

---

## Phase 0 — Assembly + host + shared (+ CFG)

Monorepo Final A-5 Phase 0.

| ID | Feature 범위 (Master) | 패키지 | 비고 | 상태 |
|----|----------------------|--------|------|------|
| P0-001 | EXT-001~005 | extensions/agent-k, host | activation, CSP/nonce, 최소 contributes | [ ] |
| P0-002 | HOST-001~015 (최소) | host | ChatViewProvider 뼈대, postMessage bridge | [ ] |
| P0-003 | shared protocol / work-event types | shared | R-002 계약만, UI 없음 | [ ] |
| P0-004 | CFG-001~003 | core 또는 host | 설정 뼈대 | [ ] |

**Phase 0 완료 조건:** 빈 확장이 로드되고 host↔webview가 shared protocol로 메시지 타입을 주고받는다 (UI는 Hello 수준 가능).

---

## Phase 1 — Providers (R-001)

| ID | Feature 범위 | 패키지 | 비고 | 상태 |
|----|--------------|--------|------|------|
| P1-001 | PROVIDER-001~018 | providers | Registry, Connections, Profiles, Health, LiteLLM | [ ] |
| P1-002 | MODEL-001~011 | providers | Registry, Resolver, **ModelRouter** | [ ] |
| P1-003 | UXPROV-001~006 | providers (+ host bridge) | connection test / model refresh 로직 | [ ] |
| P1-004 | CFG-008 | providers | provider configuration | [ ] |
| P1-005 | R-001 검증 | providers / chat-ui | Composer dropdown ≠ ModelRouter (모듈 분리) | [ ] |

---

## Phase 2 — core + tools + safety

| ID | Feature 범위 | 패키지 | 비고 | 상태 |
|----|--------------|--------|------|------|
| P2-001 | AGENT-001~019 | core | AgentLoop, doom loop, timeout, parallel | [ ] |
| P2-002 | MODE-001~009 | core | Ask/Agent/Plan/Debug/Auto | [ ] |
| P2-003 | CTX-001~012 | core | Context, Compaction, Prefetch | [ ] |
| P2-004 | HARNESS-001~007 | core | verification-first, rules | [ ] |
| P2-005 | TOOL-001~017 | tools | R-005 contract 필수 | [ ] |
| P2-006 | SAFE-001~010 | safety (또는 core/tools) | permission, secrets, checkpoint, hooks | [ ] |
| P2-007 | STREAM-* (runtime) | core | turnState, sendEpoch — UI 표시는 Phase 3 | [ ] |

---

## Phase 3 — chat-ui

| ID | Feature 범위 | 패키지 | 비고 | 상태 |
|----|--------------|--------|------|------|
| P3-001 | CHAT-001~011 | chat-ui | shell, Composer, Sessions, Palette | [ ] |
| P3-002 | CONV-001~020 | chat-ui | Timeline, Cards — Typed Work Event만 소비 (R-002) | [ ] |
| P3-003 | UI-001~024 / CURSOR-001~006 | chat-ui | presentation / layout | [ ] |
| P3-004 | STREAM-* (UI) | chat-ui | streaming 표시, prose seal | [ ] |
| P3-005 | SET-001~013 (UI) | chat-ui | SettingsPanel — 로직은 providers/core | [ ] |

---

## Phase 4~5 — worktree + Subagent (R-003)

| ID | Feature 범위 | 패키지 | 비고 | 상태 |
|----|--------------|--------|------|------|
| P4-001 | WT-001~015 | worktree | Prepare→…→rollback | [ ] |
| P4-002 | SUB-001~014 | worktree / core | isolation | [ ] |
| P4-003 | BON-001~005 | worktree | Best-of-N | [ ] |
| P4-004 | SCM-001 | worktree | commit message | [ ] |

---

## Phase 6 — plan (R-004)

| ID | Feature 범위 | 패키지 | 비고 | 상태 |
|----|--------------|--------|------|------|
| P6-001 | PLAN-001~010 | plan | Plan V1 | [ ] |
| P6-002 | PLAN2-001~015 | plan | Plan V2 | [ ] |
| P6-003 | EXEC-001~012 | plan | Execution engine + state machine | [ ] |

---

## Phase 7+ — Inline, Review, integrations

| ID | Feature 범위 | 패키지 | 비고 | 상태 |
|----|--------------|--------|------|------|
| P7-001 | INLINE-* | chat-ui + host/core | UI vs controller 분리 | [ ] |
| P7-002 | Review / BROWSER / DESIGN / MCP / GH | 해당 패키지 | Master 상세에 따름 | [ ] |

---

## 다음으로 할 일 (지금)

1. **D-005** — Feature Master 파일을 v3.0 `docs/`에 추가 (사용자 제공/업로드).
2. **D-006** — Master 항목을 이 Order의 Phase 티켓에 매핑.
3. **S-001~S-011** — 빈 모노레포 스켈레톤 + AGENTS.md + rules.
4. **P0-001**부터 이식 시작.

한 번에 Phase 전체를 열지 말 것. **다음 체크 하나 = 다음 PR/세션.**
