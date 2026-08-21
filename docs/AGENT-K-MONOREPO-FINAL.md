# Agent-K Monorepo Final Guide

**기준 Feature Master:** `docs/AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md`  
**Canonical reference branch:** `yujunkong/agent-k:v2.1-PRODUCTION-MODE` (read-only for transplant)  
**Write branch:** `v3.0`  
**Work plan / order:** `docs/V3_WORK_PLAN.md`, `docs/V3_WORK_ORDER.md`  
**원칙:** published npm lib보다 **모노레포 패키지 경계 + 경로별 에이전트 가드레일**을 우선한다.

이 문서는 다음을 한 파일로 합친 최종본이다.

1. 모노레포 분리 계획 (패키지 구조 · Feature ID 매핑 · Phase)
2. 전역 `AGENTS.md` 규칙
3. 패키지별 Cursor rule 본문

---

# Part A — Monorepo Split Plan

## A-1. 목표

- 에이전트가 “어디를 고쳐야 하는지” 바로 알 수 있게 한다.
- 한 작업 단위 = **한 패키지 / 한 도메인**으로 제한한다.
- VS Code 확장은 **조립만** 하고, 도메인 로직은 `packages/`에 둔다.
- 처음부터 npm publish 하지 않는다. 재사용·버전 분리가 필요할 때만 published lib로 승격한다.

---

## A-2. 권장 디렉터리 구조

```text
agent-k/
├── package.json                 # workspace root
├── pnpm-workspace.yaml          # 또는 npm workspaces
├── AGENTS.md                    # 전역 에이전트 규칙 (Part B)
├── turbo.json                   # (선택)
│
├── extensions/
│   └── agent-k/                 # VS Code extension 조립층
│       ├── package.json
│       └── src/extension.ts     # activation only
│
├── packages/
│   ├── chat-ui/                 # Webview UI (React)
│   ├── host/                    # Extension Host bridge
│   ├── core/                    # Agent loop, modes, context, compaction
│   ├── tools/                   # Tool executors + registry
│   ├── providers/               # Provider / Model / Routing
│   ├── plan/                    # Plan V1/V2 + Execution (2차)
│   ├── worktree/                # Worktree + Best-of-N + Patch (2차)
│   ├── safety/                  # Permission, secrets, checkpoint, hooks (2차)
│   └── shared/                  # types, protocol, pure utils (최소)
│
├── docs/
│   └── AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md
│
└── .cursor/
    └── rules/                   # Part C 규칙 파일
        ├── chat-ui.mdc
        ├── host.mdc
        ├── core.mdc
        ├── tools.mdc
        ├── providers.mdc
        ├── plan.mdc
        ├── worktree.mdc
        └── safety.mdc
```

**1차 최소 세트:** `chat-ui`, `host`, `core`, `tools`, `providers`, `extensions/agent-k`  
Plan / worktree / safety는 처음엔 `core`에 두고 커지면 분리한다.

---

## A-3. 패키지 ↔ Feature ID 매핑

### `packages/chat-ui` — UX / Presentation

| ID 범위 | 내용 |
|---------|------|
| CHAT-001~011 | Chat shell, Composer, Sessions, Side Chat, Palette |
| STREAM-* (UI) | streaming 표시, prose seal UI |
| CONV-001~020 | Conversation presentation, Timeline, Cards |
| UI-001~024 | presentation components |
| CURSOR-001~006 | cursor-ui.css, layout polish |
| SET-001~013 (UI) | SettingsPanel, tabs UI |
| INLINE-004~005 | InlineEditDiff 등 UI |
| BROWSER-004, DESIGN-001 | Browser preview, Design Mode panel UI |

**금지:** VS Code API, filesystem, agent loop, provider network

---

### `packages/host` — Extension Host Bridge

| ID 범위 | 내용 |
|---------|------|
| EXT-001~005 | activation 보조, CSP/nonce, workspace paths |
| HOST-001~015 | ChatViewProvider, chatSend, config bridge, plan/subagent/worktree host |

**허용:** `vscode` API  
**금지:** React UI, agent loop 본문

---

### `packages/core` — Agent Runtime Core

| ID 범위 | 내용 |
|---------|------|
| AGENT-001~019 | AgentLoopController, doom loop, timeout, parallel |
| MODE-001~009 | Ask/Agent/Plan/Debug/Auto |
| CTX-001~012 | ContextAssembler, Compaction, Index, Prefetch |
| STREAM-* (runtime) | turnState, sendEpoch, stream session |
| HARNESS-001~007 | verification-first, rules, heuristics |
| DEBUG-001~010 | Debug domain |
| MEM-*, SKILL-*, ART-*, TEL-*, CFG-*, REL-* | 도메인 로직 |

**금지:** React, 직접적인 `vscode` UI

---

### `packages/tools` — Tool Runtime

| ID 범위 | 내용 |
|---------|------|
| TOOL-001~017 | Read/Edit/Write/Search/Terminal/AskQuestion/Task/Skill/Browser/Debug |

**계약 (R-005):** input/output schema, permission, cancel, timeout, error, timeline event

---

### `packages/providers` — Provider / Model

| ID 범위 | 내용 |
|---------|------|
| PROVIDER-001~018 | Registry, Connections, Profiles, Health, LiteLLM |
| MODEL-001~011 | Registry, Resolver, Routing |
| UXPROV-001~006 | connection test / model refresh (로직) |
| CFG-008 | provider configuration |

**원칙 (R-001):** Composer dropdown ≠ runtime ModelRouter

---

### `packages/plan` — Plan Domain (2차)

| ID 범위 | 내용 |
|---------|------|
| PLAN-001~010 | Plan V1 |
| PLAN2-001~015 | Plan V2 |
| EXEC-001~012 | Execution engine |

**상태 머신 (R-004):** PlanCreated → Researching → Planned → Reviewing → Approved → Executing → Verifying → Completed | Failed | Cancelled

---

### `packages/worktree` — Isolation (2차)

| ID 범위 | 내용 |
|---------|------|
| WT-001~015 | Worktree, patch, adopt |
| SUB-001~014 | Subagent isolation |
| BON-001~005 | Best-of-N |
| SCM-001 | Commit message |

**원칙 (R-003):** Prepare → Validate → Snapshot → Apply → Verify → Commit / rollback

---

### `packages/safety` — Safety (2차)

| ID 범위 | 내용 |
|---------|------|
| SAFE-001~010 | Permission, deny, secrets, checkpoint, hooks, verification |

---

### `extensions/agent-k` — Assembly only

activation + commands + contributes + wiring만. 도메인 로직 금지.

---

### `packages/shared`

protocol types, work event types, common error types만.  
**의존성:** shared ← 모든 packages. shared는 비즈니스 패키지를 의존하지 않음.

---

## A-4. 의존성 방향

```text
extensions/agent-k
    ↓
host ──────────────────────────┐
    ↓                          ↓
chat-ui ←── protocol ──→ shared
    ↓                          ↑
core ←─────────────────────────┤
    ↓                          │
tools, providers, plan, worktree, safety
```

**순환 의존 금지.**

---

## A-5. 이식 Phase ↔ 패키지

| Phase | 패키지 작업 |
|-------|-------------|
| 0 | `extensions/agent-k` + `host` + `shared`, CFG-001~003 |
| 1 | `providers` 고정 (PROVIDER/MODEL), Composer ↔ Router 분리 |
| 2 | `core` + `tools` + `safety` (AGENT, TOOL, CTX, SAFE) |
| 3 | `chat-ui` (CHAT, STREAM UI, CONV) |
| 4~5 | `worktree` + Subagent |
| 6 | `plan` |
| 7+ | Inline, Review, integrations |

---

## A-6. Published lib 승격 조건

다음을 **모두** 만족할 때만 npm publish 검토:

- [ ] 다른 확장/앱에서 실제 재사용
- [ ] public API 안정 (semver 가능)
- [ ] 모노레포 내부 소비만으로 부족한 이유가 명확
- [ ] 빌드/테스트/문서가 패키지 단위로 독립 가능

---

## A-7. 최우선 재설계 포인트 (Feature Master R-001~R-005)

### R-001 Provider Routing
Composer 선택 UI와 runtime ModelRouter 분리.

```text
User Request → Task Classification → Capability → Model Router
  → Planning / Coding / Fast / Vision / Local / Fallback
```

### R-002 Conversation / Event 분리
```text
Runtime Event → Typed Work Event → Conversation Model → Presentation
```
UI가 자연어를 파싱해 tool/edit를 추측하지 않는다.

### R-003 Subagent / Worktree transaction
```text
Prepare → Validate → Snapshot → Apply → Verify → Commit/Adopt
failure → rollback
```

### R-004 Plan execution state machine
```text
PlanCreated → Researching → Planned → Reviewing → Approved
  → Executing → Verifying → Completed | Failed | Cancelled
```

### R-005 Tool contract
input/output schema, permission, cancel, timeout, error, retry, timeline event.

---

## A-8. 기능 완료 8항목 체크리스트

1. Domain type  
2. Runtime 구현  
3. Host bridge (필요 시)  
4. UI 연결 (필요 시)  
5. Config / feature flag  
6. Error / cancel  
7. Unit test  
8. E2E 검증  

8개 모두 끝나야 Feature Master에서 `[x]`.

---

# Part B — AGENTS.md (전역 규칙)

레포 루트에 `AGENTS.md`로 둔다.

## B-0. 최상위 원칙

1. **한 세션 = 한 도메인** — 가능하면 `packages/<one>` 또는 `extensions/agent-k` 하나만 수정  
2. **Feature ID 기준** — 작업 시작 시 ID 명시 (예: AGENT-010, CHAT-002)  
3. **경계 존중** — 경계를 넘으면 먼저 shared 타입/프로토콜  
4. **복사 이식 금지** — 파일 단위 복사가 아니라 Feature ID 단위 이식  

## B-1. 패키지 경계 요약

| 경로 | 역할 | 해도 됨 | 하면 안 됨 |
|------|------|---------|------------|
| `packages/chat-ui` | Webview UI | React, CSS, timeline/composer | `vscode`, fs, network, agent loop |
| `packages/host` | Extension Host | `vscode` API, bridge | React UI, agent loop 본문 |
| `packages/core` | Agent runtime | loop, modes, context | React, vscode UI |
| `packages/tools` | Tool executors | tool 구현 | UI, provider HTTP 전체 |
| `packages/providers` | Provider/Model | connections, routing | UI, tool 실행 본문 |
| `packages/plan` | Plan domain | state machine, execution | chat UI, worktree apply |
| `packages/worktree` | Isolation | worktree, patch, BoN | chat UI |
| `packages/safety` | Safety | gate, deny, checkpoint | UI |
| `packages/shared` | types only | pure types, protocol | 비즈니스 로직 |
| `extensions/agent-k` | 조립 | activate, wiring | 도메인 로직 |

## B-2. 금지 사항

- `chat-ui`에서 `vscode` import  
- `core` / `tools` / `providers`에 React 컴포넌트  
- UI가 자연어 파싱으로 tool/edit 추측 (R-002)  
- Composer dropdown과 ModelRouter를 한 모듈에 섞기 (R-001)  
- Worktree 부분 적용 후 rollback 없음 (R-003)  
- Plan을 prompt 한 방으로 대체 (R-004)  
- Tool contract 없는 tool 추가 (R-005)  

## B-3. 작업 시작 체크리스트

```text
[ ] 관련 Feature ID 확인
[ ] 수정할 packages/* 하나만 선택
[ ] 해당 패키지 rule 확인
[ ] shared 변경 필요 시 먼저 shared
[ ] 테스트 경로 확인
[ ] 8항목 체크
```

## B-4. Feature ID → 패키지 빠른 참조

- **EXT-*, HOST-*** → `host` + `extensions/agent-k`  
- **CHAT-*, CONV-*, UI-*, CURSOR-*, SET-*(UI)** → `chat-ui`  
- **STREAM-(runtime), AGENT-*, MODE-*, CTX-*, HARNESS-*, DEBUG-*, MEM-*, SKILL-*, ART-*, TEL-*, CFG-*, REL-*** → `core`  
- **TOOL-*** → `tools`  
- **PROVIDER-*, MODEL-*, UXPROV-*** → `providers`  
- **PLAN-*, PLAN2-*, EXEC-*** → `plan` (없으면 `core`)  
- **WT-*, SUB-*, BON-*, SCM-*** → `worktree` (없으면 `core`)  
- **SAFE-*** → `safety` (없으면 `core`/`tools`)  
- **INLINE-*** → UI=`chat-ui`, controller=`host`/`core`  
- **BROWSER-*, DESIGN-*, MCP-*, GH-*** → 로직=`core`/전용, UI=`chat-ui`, bridge=`host`  

## B-5. 커밋 메시지 예

```text
feat(core): AGENT-010 doom loop detection
fix(chat-ui): CONV-014 timeline step card layout
refactor(providers): R-001 separate ModelRouter from composer picker
```

---

# Part C — 패키지별 Cursor Rules

아래 내용을 `.cursor/rules/<name>.mdc` 로 저장한다.

---

## C-1. chat-ui.mdc

```yaml
---
description: chat-ui package — Webview UI only
globs:
  - packages/chat-ui/**
---
```

**역할:** Webview React UI (Composer, Timeline, Conversation, Settings UI, Diff preview).

**Feature IDs:** CHAT-*, CONV-*, UI-*, CURSOR-*, STREAM-*(표시), SET-*(UI), INLINE-*(diff UI), BROWSER/DESIGN panel UI

**해도 됨:** React, CSS, webview state, host와 message protocol(`shared`) 통신, Typed Work Event presentation

**하면 안 됨:** `vscode` import, fs/child_process/agent loop/provider HTTP, ModelRouter·PermissionGate·Worktree apply

**작업 단위:** 이 폴더만 수정.

---

## C-2. host.mdc

```yaml
---
description: host package — Extension Host bridge only
globs:
  - packages/host/**
  - extensions/agent-k/**
---
```

**역할:** activation, WebviewProvider, commands, config bridge, plan/subagent/worktree host wiring.

**Feature IDs:** EXT-*, HOST-*

**해도 됨:** `vscode` API, packages import 조립, postMessage bridge

**하면 안 됨:** React UI 본문, AgentLoop 본문, Tool executor 본문

**extensions/agent-k:** activation + contributes + wiring만.

---

## C-3. core.mdc

```yaml
---
description: core package — Agent runtime
globs:
  - packages/core/**
---
```

**역할:** Agent loop, modes, context, compaction, harness, debug/memories/skills/artifacts/telemetry/config domain.

**Feature IDs:** AGENT-*, MODE-*, CTX-*, HARNESS-*, DEBUG-*, MEM-*, SKILL-*, ART-*, TEL-*, CFG-*, REL-*, STREAM-*(runtime)

**해도 됨:** pure/runtime TS, tools/providers/shared 의존, Typed events emit

**하면 안 됨:** React, vscode UI, provider HTTP 복제

**R-002:** Work Event를 타입으로 발행.

---

## C-4. tools.mdc

```yaml
---
description: tools package — Tool executors
globs:
  - packages/tools/**
---
```

**역할:** Read/Edit/Write/Search/Terminal/AskQuestion/Task/Skill/Browser/Debug executors + registry.

**Feature IDs:** TOOL-*

**R-005 필수:** input/output schema, permission, cancel, timeout, error, retry, timeline event

**하면 안 됨:** React UI, Model routing, Worktree transaction 본문

---

## C-5. providers.mdc

```yaml
---
description: providers package — Provider and Model layer
globs:
  - packages/providers/**
---
```

**역할:** Provider registry/connections/profiles, Model registry/resolver/routing, health.

**Feature IDs:** PROVIDER-*, MODEL-*, UXPROV-*, CFG-008

**R-001 필수:** Composer dropdown과 runtime ModelRouter 분리. UI 코드 금지.

**하면 안 됨:** Tool 실행 본문, React, Agent loop 제어

---

## C-6. plan.mdc

```yaml
---
description: plan package — Plan V1/V2 and execution
globs:
  - packages/plan/**
---
```

**역할:** Plan V1, Plan V2, Execution engine, scheduler, diagnostics.

**Feature IDs:** PLAN-*, PLAN2-*, EXEC-*, MODE-003/007/009

**R-004:** PlanCreated → … → Completed | Failed | Cancelled

**하면 안 됨:** Chat UI, Worktree apply 본문, prompt 한 방으로 plan 대체

---

## C-7. worktree.mdc

```yaml
---
description: worktree package — isolation, subagent apply, best-of-n
globs:
  - packages/worktree/**
---
```

**역할:** managed git worktree, patch validate/apply, subagent isolation, Best-of-N, adopt/reject.

**Feature IDs:** WT-*, SUB-*(isolation), BON-*, SCM-001

**R-003 필수:** Prepare → Validate → Snapshot → Apply → Verify → Commit/Adopt / rollback

**하면 안 됨:** Chat UI, Provider routing, Plan state machine 본문

---

## C-8. safety.mdc

```yaml
---
description: safety package — permission, secrets, hooks, verification
globs:
  - packages/safety/**
---
```

**역할:** Permission gate, deny globs, terminal deny, write gate, secrets, checkpoint, hooks, verification runners.

**Feature IDs:** SAFE-*

**원칙:**  
- deny: `.env*`, `secrets/**`, keys, `.git/**`, `node_modules/**`  
- terminal deny: `rm -rf /`, `mkfs`, `dd if=`, fork bomb 등  
- Hook 실패 시 명시적 error contract  

**하면 안 됨:** UI 구현, Tool 전체 재구현

---

# Part D — 한 줄 결론

**모노레포 패키지 분리 + 경로별 가드레일**로 에이전트 작업 범위를 좁히고,  
확장은 조립만 하며, published lib는 나중에 한다.  
Feature Master ID는 패키지 매핑의 단일 기준이다.

### 적용 순서

1. 이 문서를 레포에 두고  
2. `AGENTS.md`(Part B)를 루트에 복사  
3. Part C를 `.cursor/rules/*.mdc`로 저장  
4. Phase 0부터 `packages/*` + `extensions/agent-k` 스켈레톤 생성  
5. Feature Master 8항목 체크리스트로 이식  

---

## Source

- Feature Master Final: `v2.1-PRODUCTION-MODE` 트리 대조본  
- Split 원칙: monorepo 경계 우선, published lib 후순위  
- R-001~R-005: Feature Master 재설계 포인트  
