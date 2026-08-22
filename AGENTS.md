# Agent-K — Agent Boundaries (v3.0)

Canonical docs:
- Feature Master: `docs/AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md`
- Monorepo: `docs/AGENT-K-MONOREPO-FINAL.md`
- Work plan / order: `docs/V3_WORK_PLAN.md`, `docs/V3_WORK_ORDER.md`

**Reference branch (read-only):** `v2.1-PRODUCTION-MODE`  
**Write branch:** `v3.0`  
**원칙:** published npm lib보다 모노레포 패키지 경계 + 경로별 가드레일.  
**이식:** v2.1에서 **해당 Feature 로직을 최대한 가져온다** (스텁으로 완료 금지). 통째 `src/` 복붙은 금지. 상세: `docs/V3_WORK_PLAN.md` §3 / §3.1.

## B-0. 최상위 원칙

1. **한 세션 = 한 도메인** — 가능하면 `packages/<one>` 또는 `extensions/agent-k` 하나만 수정
2. **Feature ID 기준** — 작업 시작 시 ID 명시 (예: AGENT-010, CHAT-002)
3. **경계 존중** — 경계를 넘으면 먼저 `packages/shared` 타입/프로토콜
4. **v2.1 충실 이식** — Feature 범위의 검증된 구현을 `git show` / worktree로 확인 후 패키지 경계에 맞게 가져온다. 빈 스텁 `[x]` 금지
5. **맹목 파일 복사 금지** — 트리 통째 move/copy가 아니라 Feature ID 단위로 **동작 동등** 이식

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
[ ] 관련 Feature ID 확인 (V3_WORK_ORDER + Feature Master)
[ ] v2.1-PRODUCTION-MODE에서 대응 구현 경로 확인 (git show / worktree)
[ ] 수정할 packages/* 하나만 선택
[ ] 해당 패키지 rule 확인
[ ] shared 변경 필요 시 먼저 shared
[ ] 스텁이 아니라 v2.1 동작 동등 수준으로 이식
[ ] 테스트 경로 확인
[ ] 8항목 체크 (UI Feature면 화면 확인 포함)
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
