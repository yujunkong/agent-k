# docs/

Agent K 문서·PRD·태스크 루트.

| 경로 | 내용 |
|------|------|
| [`Extension_high_impact.md`](./Extension_high_impact.md) | **최초 설계 SSOT** |
| [`publishing-marketplace.md`](./publishing-marketplace.md) | **VS Code Marketplace / Open VSX 게시 절차** |
| `addon.md` 등 | 기능/모드 가이드 |
| [`PRDs/`](./PRDs/) | 제품·인프라 PRD (90+) |
| [`TODO_TASKS/`](./TODO_TASKS/) | 미착수 태스크 + [`MASTER_TASK_INDEX.md`](./TODO_TASKS/MASTER_TASK_INDEX.md) |
| [`DONE_TASKS/`](./DONE_TASKS/) | 완료 태스크 JSON 아카이브 |
| [`REWORK_TASKS/`](./REWORK_TASKS/) | 감사·재작업 큐 + 스크립트 |

## 자주 쓰는 명령

```bash
# DONE 실측 ↔ 마스터 인덱스
python3 docs/REWORK_TASKS/scripts/sync-master-index.py
python3 docs/REWORK_TASKS/scripts/sync-master-index.py --update-index

# DONE JSON 스키마 검증
python3 docs/REWORK_TASKS/scripts/validate-done-tasks.py
```

## 다음 착수

[`TODO_TASKS/tasks/ADDON/`](./TODO_TASKS/tasks/ADDON/) — [`addon.md`](./addon.md) 갭 태스크
