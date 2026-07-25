# MASTER REWORK INDEX

> DONE_TASKS 감사 기반 재작업 큐 · 2026-07-25
> **Total**: 19 tasks · P0=7 · P1=8 · P2=4

## Dashboard

| Severity | Count | Pending | Done |
|----------|------:|--------:|-----:|
| **P0** | 7 | 7 | 0 |
| **P1** | 8 | 8 | 0 |
| **P2** | 4 | 4 | 0 |
| **TOTAL** | **19** | **19** | **0** |

## Recommended order

1. RW-P0-01 (MASTER sync) — 문서 정합
2. RW-P0-02 + RW-P0-03 (defaults / queue keys) — 설정 SSOT
3. RW-P0-05 + RW-P0-06 (false completion audit/policy)
4. RW-P0-04 + RW-P0-07 (Resynthesize / Settings Hub)
5. P1 → P2

## P0

| ID | Title | Category | Deps | Status |
|----|-------|----------|------|--------|
| RW-P0-01 | MASTER_TASK_INDEX를 DONE 실측과 동기화 | index-sync | - | ☐ |
| RW-P0-02 | 권한 기본값을 PRD대로 accept_edits로 통일 | prd-code-mismatch | - | ☐ |
| RW-P0-03 | agent-k.queue.* 설정 키를 package.json에 등록 | prd-code-mismatch | - | ☐ |
| RW-P0-04 | Interrupt & Resynthesize 실제 루프 연동 (Stop+Regen 대체) | implementation-gap | - | ☐ |
| RW-P0-05 | 클레임 files[] 누락 93건 감사 → rework/복귀 분류표 작성 | false-completion | - | ☐ |
| RW-P0-06 | 고무도장 completedCriteria(~150건) 검증 정책 도입 | false-completion | - | ☐ |
| RW-P0-07 | Settings Hub C0 클레임 재검증 (T33–T39) | implementation-gap | - | ☐ |

## P1

| ID | Title | Category | Deps | Status |
|----|-------|----------|------|--------|
| RW-P1-01 | Stop 시 큐 정책 기본값 keep으로 DONE/코드 통일 | policy-conflict | - | ☐ |
| RW-P1-02 | Resynthesize debounce를 PRD 300ms로 통일 | policy-conflict | - | ☐ |
| RW-P1-03 | DONE files[] 경로를 실제 모듈 경로로 보정 (샘플→전수) | path-drift | RW-P0-05 | ☐ |
| RW-P1-04 | StopHandler 등 클레임 모듈 구현 또는 DONE 클레임 철회 | implementation-gap | - | ☐ |
| RW-P1-05 | DONE이 클레임한 테스트 경로 복구 (e2e/unit 88→실존 갭) | tests-gap | - | ☐ |
| RW-P1-06 | 얇은 C0 Settings DONE 스텁(description/AC) 보강 | metadata | - | ☐ |
| RW-P1-07 | C2 쓰기 경로 클레임 재검증 (edit/diff/lint) | implementation-gap | RW-P0-05 | ☐ |
| RW-P1-08 | C4 Permission/Checkpoint/Compaction 스모크 재검증 | implementation-gap | RW-P0-02,RW-P0-05 | ☐ |

## P2

| ID | Title | Category | Deps | Status |
|----|-------|----------|------|--------|
| RW-P2-01 | DONE status 값 정규화 (done | rework | completed→done) | schema | - | ☐ |
| RW-P2-02 | C3-T08 등 placeholder 용어를 Interrupt & Resynthesize로 통일 | wording | RW-P0-04 | ☐ |
| RW-P2-03 | DONE JSON 필수 필드 가이드 (description/AC/prdRefs) | schema | - | ☐ |
| RW-P2-04 | DONE↔TODO↔REWORK 워크플로 문서화 | docs | - | ☐ |

