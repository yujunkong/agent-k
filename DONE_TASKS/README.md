# DONE_TASKS

> C0–C7 태스크 JSON 아카이브 (277개, 2026-07-25 실측). `status: rework` 87건 포함.

## 주의

일괄 마감·고무도장 증거가 많아 **그대로 진실 소스로 쓰지 마세요.**  
재검증·PRD/코드 정합은 [`REWORK_TASKS/`](../REWORK_TASKS/README.md) 심각도 큐 **P0→P2**를 따릅니다.

### 증빙 정책 (REWORK와 동일)

`done` 표시 시 `completedCriteria`에 **grep / test 출력 / commitHash(SHA 또는 N/A+사유)** 중 하나 이상 필요.  
고무도장만이면 [`evidence:insufficient`](../REWORK_TASKS/reports/rubber-stamp-policy.md)로 간주.

## 구조

```
DONE_TASKS/
├── C0/ … C7/     # 완료·rework JSON
└── README.md
```

## 관련

- [`TODO_TASKS/`](../TODO_TASKS/README.md) — pending + 마스터 인덱스
- [`REWORK_TASKS/reports/`](../REWORK_TASKS/reports/) — missing-files, settings reverify, missing-tests 감사
