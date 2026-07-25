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

1. `tasks/P0`부터 순서대로 (의존성 필드 존중)
2. 코드 수정 + AC 증빙 후 `status: done`
3. 관련 `DONE_TASKS/**.json`의 `status`를 `done` 유지 또는 `rework`→`done`으로 갱신
4. `TODO_TASKS/MASTER_TASK_INDEX.md` 동기화 (RW-P0-01)

## 관련

- `DONE_TASKS/` — 완료로 표시된 아티팩트 (신뢰도 주의)
- `TODO_TASKS/` — C5–HARB pending
- PRD: `PRD-17_Message_Queue.md`, `PRD-29_Settings_Hub.md`, `PRD-Spec-05_Permission_Autorun.md`
