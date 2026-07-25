# REWORK_TASKS

> DONE_TASKS 감사에서 발견된 **미검증·PRD/코드 불일치·메타데이터 오류**를 심각도별로 재작업하는 큐입니다.  
> Generated: 2026-07-25 · Source: DONE_TASKS audit

## 왜 존재하는가?

C0–C4가 `DONE_TASKS/`로 이동되어 있으나:

- 완료 증거가 고무도장(`implemented` + `compile`)인 경우가 많음
- PRD 기본값(`accept_edits`, queue 키, Resynthesize)과 코드가 어긋남
- `MASTER_TASK_INDEX` 상세/합계가 DONE 실측과 불일치

**DONE JSON을 진실 소스로 쓰지 말고**, 본 큐 + 현재 PRD + `src/`를 기준으로 재검증하세요.

## 구조

```
REWORK_TASKS/
├── README.md
├── MASTER_REWORK_INDEX.md
├── reports/          # 감사 산출물 (RW-P0-05 등)
├── scripts/          # 검증 스크립트 (RW-P2-03)
└── tasks/
    ├── P0/           # 즉시 차단급
    ├── P1/           # 조만간 필수
    └── P2/           # 정리·품질
```

## 심각도

| 등급 | 의미 | 처리 원칙 |
|------|------|-----------|
| **P0** | 완료 표시를 믿으면 제품/문서가 틀어짐 | 구현·인덱스·설정 키 먼저 |
| **P1** | 정책 충돌·테스트/경로 갭 | P0 직후 |
| **P2** | 스키마·카피·워크플로 문서 | 여유 시 |

## 워크플로

1. `tasks/P0`부터 **P2**까지 순서대로 (의존성 필드 존중) — [우선순위](#심각도)
2. 코드 수정 + **증빙 필수** 후 REWORK `status: done` (DONE JSON만 바꾸지 말 것)
3. 관련 `DONE_TASKS/**.json`의 `status`를 `done` 유지 또는 `rework`→`done`으로 갱신
4. `TODO_TASKS/MASTER_TASK_INDEX.md` 동기화: `python3 REWORK_TASKS/scripts/sync-master-index.py --update-index`

### 완료 체크리스트 (증빙 필수)

REWORK 또는 DONE을 `done`으로 올리기 전 **하나 이상** 충족:

| 증빙 | 예시 |
|------|------|
| Grep proof | `rg 'agent-k.queue.onStop' src/` 출력을 `implementationNotes.verification`에 기록 |
| Test output | e2e/단위 로그 + 통과 케이스 ID |
| commitHash | 실제 git SHA (7자 이상) 또는 `N/A` + 사유 (문서 전용 등) |

고무도장만 (`implemented`, `compile passes`만) → **`evidence:insufficient`** — [`reports/rubber-stamp-policy.md`](./reports/rubber-stamp-policy.md) 참고.

### 태스크 이동 규칙

| From | To | When |
|------|-----|------|
| `TODO_TASKS/tasks/` | `DONE_TASKS/` | AC + 증빙 + 인덱스 ✅/🔄 반영 |
| `DONE_TASKS/` | `REWORK_TASKS/tasks/` | 감사 FAIL, `status: rework` |
| `REWORK_TASKS/tasks/` | `REWORK_TASKS/tasks_DONE/` | REWORK AC + 증빙 PASS |

## 스크립트

| Script | Purpose |
|--------|---------|
| [`scripts/audit-missing-files.py`](./scripts/audit-missing-files.py) | RW-P0-05 — `files[]` 존재 검사 → [`reports/missing-files-audit.md`](./reports/missing-files-audit.md) |
| [`scripts/sync-master-index.py`](./scripts/sync-master-index.py) | RW-P0-01 — DONE 집계 + MASTER 대시보드 |
| [`scripts/validate-done-tasks.py`](./scripts/validate-done-tasks.py) | RW-P2-03 — description / acceptanceCriteria / prdRefs 누락 |
| [`scripts/audit-rubber-stamp.py`](./scripts/audit-rubber-stamp.py) | RW-P0-06 — completedCriteria 고무도장 후보 |

```bash
# DONE 메타데이터 갭 (exit 1 if any gaps)
python3 REWORK_TASKS/scripts/validate-done-tasks.py

# JSON lines for automation
python3 REWORK_TASKS/scripts/validate-done-tasks.py --json
```

## 관련

- [`DONE_TASKS/`](../DONE_TASKS/README.md) — 완료 JSON 아카이브 (신뢰도 주의)
- [`TODO_TASKS/`](../TODO_TASKS/README.md) — C5–HARB pending + [`MASTER_TASK_INDEX.md`](../TODO_TASKS/MASTER_TASK_INDEX.md)
- PRD: `PRD-17_Message_Queue.md`, `PRD-29_Settings_Hub.md`, `PRD-Spec-05_Permission_Autorun.md`


---

## C5–C7 기능점검 (2026-07-25)

C7까지 DONE 이동 후 점검: **스캐폴딩은 있으나 배선·실실행 부족**.  
신규 큐: `RW-C57-*` (공통), `RW-C5-*`, `RW-C6-*`, `RW-C7-*`.  
상세: `reports/c5-c7-functional-audit.md` · `MASTER_REWORK_INDEX.md`.

### 다른 에이전트 위임

실행 순서·복붙 프롬프트: **[`AGENT_HANDOFF.md`](./AGENT_HANDOFF.md)** (Round 2)

- **완료(검증 PASS)**: `tasks_DONE/` — RW-C57-01, RW-C5-01/02/04, RW-C6-01, RW-C7-01/02  
- **미완료 재작업**: `tasks/P0|P1/*-R2.json`  
- 검증 리포트: `reports/handoff-verification-2026-07-25.md`
