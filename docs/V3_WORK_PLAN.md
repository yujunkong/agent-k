# v3.0 작업 방식 (Work Plan)

**목표:** 에이전트가 “고쳤다”고 해도 반영이 안 되는 문제를 없앤다.  
기존 `v2.1-PRODUCTION-MODE` 코드는 **너무 복잡·경계가 붕괴**되어 분석·수정 캐치율이 낮다.  
따라서 v3.0은 **빈 모노레포에서 Feature ID 단위로 이식·점검**한다. 기존 트리를 통째로 옮기지 않는다.

---

## 1. 브랜치 역할

| 브랜치 | 역할 |
|--------|------|
| `v2.1-PRODUCTION-MODE` | **참조 전용.** 동작·구현 확인용. v3.0에 대량 복붙 금지. |
| `v3.0` | **유일한 쓰기 대상.** 문서 → 스켈레톤 → Feature 이식 순. |

에이전트 작업 시: v2.1은 `git show` / 별도 worktree로 **읽고**, 커밋은 **v3.0에만**.

---

## 2. 기준 문서 (단일 소스)

| 문서 | 경로 | 쓰임 |
|------|------|------|
| Feature Master | `docs/AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md` | *무엇을* 이식·완료 체크할지 (Feature ID) |
| Monorepo Final | `docs/AGENT-K-MONOREPO-FINAL.md` | *어디에* 둘지 (패키지·의존·R-001~R-005·rules) |
| Work Order | `docs/V3_WORK_ORDER.md` | *어떤 순서로* 할지 (Phase · 티켓) |
| 이 문서 | `docs/V3_WORK_PLAN.md` | *어떻게* 작업할지 (규칙·루프·완료 정의) |

Feature Master가 아직 없으면 Work Order의 ID 범위만으로 Phase를 진행하고, Master 파일이 들어오는 즉시 그걸 `[x]` 권위로 승격한다.

---

## 3. 핵심 원칙

1. **한 세션 / 한 PR = Feature ID 하나** (또는 명시된 아주 작은 ID 묶음).
2. **한 패키지**만 수정 (`packages/<one>` 또는 `extensions/agent-k`). 경계 넘으면 먼저 `packages/shared`.
3. **v2.1에서 최대한 가져온다** — 해당 Feature의 검증된 동작·로직·엣지케이스를 `v2.1-PRODUCTION-MODE`에서 찾아 **충실히 이식**한다. 빈 스텁·축소 API로 “완료” 처리하지 않는다.  
   - **허용:** Feature 범위의 모듈을 읽고, 패키지 경계에 맞게 옮기거나 재구성하며 가져오기 (`git show` / worktree).  
   - **금지:** `src/` 트리 통째 move/copy, Feature ID 무시 대량 복붙, UI/host/core를 한 덩어리로 이식.
4. **파일 단위 맹목 복사 금지** — 복붙이 목적이 아니라 Feature Master ID 단위로 **동작 동등**을 맞춘다 (경로·패키지는 Monorepo Final을 따른다).
5. **published npm lib 금지** (재사용·semver가 명확해질 때까지).
6. “고쳤다”의 정의 = **diff가 허용 경로에만 있고** + **8항목 체크 통과** (+ 가능하면 v2.1과 동작 동등).

### 3.1 v2.1 이식 품질 기준 (다음 에이전트 필수)

| 해야 함 | 하면 안 됨 |
|---------|------------|
| Feature Master ID에 대응하는 v2.1 경로를 `git show` / worktree로 **먼저** 확인 | 문서만 보고 추측 구현 |
| 핵심 로직·가드·에러/cancel·테스트를 **최대한 보존**하며 패키지에 맞게 재배치 | “API 시그니처만 있는 스텁”으로 `[x]` |
| UI Feature면 chat-ui까지 붙여 **화면에서 확인 가능**하게 | domain API만 두고 UX를 완료 처리 |
| 경계를 넘기면 shared 계약 먼저 | host에 React, chat-ui에 vscode/fs |

---

## 4. 이식 루프 (매 Feature)

```text
1. V3_WORK_ORDER에서 다음 미완료 티켓 선택
2. Feature Master에서 해당 ID 요구사항 확인
3. MONOREPO 표로 패키지 결정 (chat-ui / host / core / …)
4. v2.1-PRODUCTION-MODE에서 해당 Feature 구현 경로를 찾아 **최대한 가져올 내용**을 확정 (읽기)
5. v3.0의 해당 패키지에 이식(경계에 맞게 재배치). 스텁으로 끝내지 말 것
6. 8항목 체크리스트 통과 (UI Feature면 화면 확인 포함)
7. Feature Master [x] + Work Order 체크
8. 커밋 메시지: feat(<pkg>): <ID> <요약>
```

### 8항목 체크리스트 (Monorepo Final A-8)

1. Domain type  
2. Runtime 구현  
3. Host bridge (필요 시)  
4. UI 연결 (필요 시)  
5. Config / feature flag  
6. Error / cancel  
7. Unit test  
8. E2E 검증  

8개 모두 끝나야 Master/`Work Order`에 완료 표시.

---

## 5. 에이전트 프롬프트 최소 형식

작업을 맡길 때 반드시 포함:

```text
Branch: v3.0 only (do not edit v2.1)
Feature ID: <e.g. EXT-001>
Allowed paths: packages/<one>/…  (or extensions/agent-k/…)
Forbidden: other packages, drive-by refactors, stub-only “done”
Reference: git show v2.1-PRODUCTION-MODE:<path> — port as much real logic as fits the package boundary
Done when: behavior parity with v2.1 for this Feature + 8-item checklist + tests; summarize files touched
```

규칙 파일은 Monorepo Final Part C를 `.cursor/rules/*.mdc`로 넣을 때(스켈레톤 Phase) 활성화한다.

---

## 6. 하지 말 것

- v2.1 `src/` 전체를 v3.0으로 move/copy
- chat-ui부터 통째 이식
- “관련 파일 다 고침” 한 PR
- UI가 자연어로 tool/edit 추측 (R-002 위반)
- Composer dropdown과 ModelRouter 한 모듈에 섞기 (R-001)
- Tool contract 없는 tool 추가 (R-005)

---

## 7. 진행 단계 요약

| 단계 | 내용 | 상태 |
|------|------|------|
| D0 | 문서만: Work Plan / Work Order / Monorepo Final | **완료** |
| D1 | Feature Master 원본을 `docs/`에 배치 | **완료** |
| D2 | Master ↔ Work Order Feature ID 세분화 (D-006) | **완료** |
| S0 | 모노레포 스켈레톤 + AGENTS.md + cursor rules (코드 최소) | **완료** |
| P0… | Work Order Phase 0 Feature 이식 | **완료** — SHARED + EXT + HOST + CFG-001~003 |
| P1 | Phase 1 Providers/Models + UXPROV domain | **완료** — PROVIDER/MODEL/CFG-008/UXPROV-001~006 domain (picker UI → CHAT-003) |
| P2 | Phase 2 Agent/Tools/Safety/Modes | **완료** — AGENT/TOOL/CTX/SAFE/MODE/DEBUG(domain)/REL/CFG 잔여 (host·chat-ui 배선 → Phase 3+) |
| P3… | Chat / Streaming / Conversation | **완료** (CHAT-010/STREAM-002/CONV-017 스킵; CONV-014→SUB 이후, CONV-016→checkpoint 이후). **안정 표면:** Work Order 「안정 표면 (2026-08-23)」— 잘 되는 timeline/composer/카드는 신중히만 수정 |
| P4… | Worktree / Patch | **완료** — WT-001…015 domain `[x]`; SUB wiring / BON AgentLoop 후속 |

---

## 8. 성공 기준

- 에이전트에게 패키지·Feature ID만 줘도 수정 위치가 바로 잡힌다.
- “변경 반영 안 됨”이 사라진다 = 실제 diff·테스트가 그 Feature에 묶여 있다.
- v2.1은 참조로만 남고, v3.0이 새로운 canonical 구현이 된다.
