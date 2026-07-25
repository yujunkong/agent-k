# RW-P1-03 files[] path fix spot-check

> Generated: 2026-07-25 · Script: `REWORK_TASKS/scripts/fix-done-files-paths.py --apply`  
> Re-audit: `python3 REWORK_TASKS/scripts/audit-missing-files.py --write-report` → **30 tasks**, **11 class A**, **24 class B** (B = missing tests/unimplemented; out of scope for path remap)

## Summary

| Metric | Before (audit) | After apply |
|--------|----------------|------------|
| DONE JSON files patched | — | **91** |
| Class A unresolved (script) | 28 | **0** |
| Class A path rows (audit) | 125 | **11** |

Remaining class **A** rows are mostly alternate test paths or multi-candidate notes — see `missing-files-audit.md`. Class **B** claims (missing e2e specs, C7 firmware stubs) intentionally left for rework.

## Spot-check (≥10 task IDs — every `files[]` entry exists on disk)

| Task ID | Sample `files[]` path | Exists |
|---------|----------------------|--------|
| C2-T02 | `src/tools/editTools.ts` | yes |
| C2-T03 | `src/tools/editTools.ts` | yes |
| C1-T04 | `src/tools/readTools.ts` | yes |
| C1-T11 | `src/loop/AgentLoopController.ts` | yes |
| C0-T28 | `src/chat/i18n/strings.ts` | yes |
| C0-T13 | `src/chat/components/TimelineGroup.tsx` | yes |
| C3-T08 | `src/chat/components/MessageQueueUI.tsx` | yes |
| C4-T04 | `src/checkpoint/CheckpointManager.ts` | yes |
| C7-T03 | `src/browser/DesignModePanel.tsx` | yes |
| C7-T26 | `src/settings/tabs/SecretsTab.tsx` | yes |
| C0-T05 | `src/chat/components/VirtualList.tsx` | yes |
| C3-T29 | `src/loop/AgentLoopController.ts` | yes |

## How to reproduce

```bash
python3 REWORK_TASKS/scripts/fix-done-files-paths.py --apply
python3 REWORK_TASKS/scripts/audit-missing-files.py
# per-path check:
test -f src/tools/editTools.ts && test -f src/tools/readTools.ts
```

## Documented unresolved (class B — not path typos)

Examples still listed in audit as **B**: `tests/e2e/c5-todo-integration.spec.ts`, `src/firmware/SVDViewer.tsx`, C6 debug e2e specs. These require implementation or `status: rework`, not rename.
