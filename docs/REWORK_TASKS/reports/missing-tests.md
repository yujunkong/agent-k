# Missing test paths claimed in DONE_TASKS (RW-P1-05)

> Generated: 2026-07-25 · Source: DONE JSON `files[]` / `filesModified`

## Summary

| Metric | Count |
|--------|------:|
| Missing test path references | 70 |
| Unique task IDs affected | 43 |

## Priority C5–C7 e2e specs (present on disk)

These acceptance specs exist and should be used as rework evidence anchors:

- ✅ `tests/e2e/c5-plan-mode.spec.ts`
- ✅ `tests/e2e/c5-plan-readonly.spec.ts`
- ✅ `tests/e2e/c6-debug-cycle.spec.ts`
- ✅ `tests/e2e/c7-mcp.spec.ts`
- ✅ `tests/e2e/c7-worktree-bon.spec.ts`

## All missing test claims

| Task ID | Status | Missing path | Kind |
|---------|--------|--------------|------|
| C0-T31 | done | `tests/e2e/fixtures/mock-provider-server.ts` | file |
| C1-T21 | done | `tests/unit/loop/ParallelExecutor.test.ts` | file |
| C1-T21 | done | `tests/unit/prefetch/PrefetchEngine.test.ts` | file |
| C1-T24 | done | `tests/e2e/c1-write-blocked.spec.ts` | file |
| C1-T26 | done | `tests/bench/parallel-read.bench.ts` | file |
| C1-T27 | done | `tests/bench/memory-leak.bench.ts` | file |
| C2-T16 | done | `tests/unit/patches/matcher.test.ts` | file |
| C2-T16 | done | `tests/unit/patches/staleness.test.ts` | file |
| C2-T16 | done | `tests/unit/patches/merger.test.ts` | file |
| C2-T17 | done | `tests/unit/review/DiffView.test.tsx` | file |
| C2-T17 | done | `tests/unit/review/CheckboxSync.test.ts` | file |
| C2-T17 | done | `tests/unit/review/KeyboardHandler.test.ts` | file |
| C2-T18 | done | `tests/unit/verification/LintRunner.test.ts` | file |
| C2-T18 | done | `tests/unit/verification/TestFinder.test.ts` | file |
| C2-T18 | done | `tests/unit/hooks/injectVerificationError.test.ts` | file |
| C2-T20 | done | `tests/e2e/c2-auto-lint.spec.ts` | file |
| C2-T21 | done | `tests/e2e/c2-staleness.spec.ts` | file |
| C2-T22 | done | `tests/e2e/c2-multi-file.spec.ts` | file |
| C2-T24 | done | `tests/bench/patch-apply.bench.ts` | file |
| C2-T26 | done | `tests/unit/patches/matcher.test.ts` | file |
| C2-T26 | done | `tests/unit/patches/staleness.test.ts` | file |
| C2-T26 | done | `tests/unit/patches/merger.test.ts` | file |
| C2-T27 | done | `tests/unit/review/DiffView.test.tsx` | file |
| C2-T27 | done | `tests/unit/review/CheckboxSync.test.ts` | file |
| C2-T27 | done | `tests/unit/review/KeyboardHandler.test.ts` | file |
| C2-T28 | done | `tests/unit/verification/LintRunner.test.ts` | file |
| C2-T28 | done | `tests/unit/verification/TestFinder.test.ts` | file |
| C2-T28 | done | `tests/unit/hooks/injectVerificationError.test.ts` | file |
| C2-T30 | done | `tests/e2e/c2-auto-lint.spec.ts` | file |
| C2-T31 | done | `tests/e2e/c2-staleness.spec.ts` | file |
| C2-T32 | done | `tests/e2e/c2-multi-file.spec.ts` | file |
| C2-T33 | done | `tests/unit/patches/matcher.test.ts` | file |
| C2-T33 | done | `tests/unit/patches/staleness.test.ts` | file |
| C2-T33 | done | `tests/unit/patches/merger.test.ts` | file |
| C2-T34 | done | `tests/unit/review/DiffView.test.tsx` | file |
| C2-T34 | done | `tests/unit/review/CheckboxSync.test.ts` | file |
| C2-T34 | done | `tests/unit/review/KeyboardHandler.test.ts` | file |
| C2-T34 | done | `tests/bench/patch-apply.bench.ts` | file |
| C2-T35 | done | `tests/unit/verification/LintRunner.test.ts` | file |
| C2-T35 | done | `tests/unit/verification/TestFinder.test.ts` | file |
| C2-T35 | done | `tests/unit/hooks/injectVerificationError.test.ts` | file |
| C3-T19 | done | `tests/unit/loop/DoomLoopDetector.test.ts` | file |
| C3-T20 | done | `tests/unit/loop/MessageQueue.test.ts` | file |
| C3-T23 | done | `tests/e2e/c3-stop-handling.spec.ts` | file |
| C3-T24 | done | `tests/e2e/c3-doom-loop.spec.ts` | file |
| C3-T25 | done | `tests/e2e/c3-message-queue.spec.ts` | file |
| C3-T26 | done | `tests/e2e/c3-compaction.spec.ts` | file |
| C4-T32 | done | `tests/unit/permission/PermissionGate.test.ts` | file |
| C4-T32 | done | `tests/unit/permission/ApprovalUI.test.tsx` | file |
| C4-T33 | done | `tests/unit/checkpoint/CheckpointManager.test.ts` | file |
| C4-T33 | done | `tests/unit/checkpoint/SnapshotStore.test.ts` | file |
| C4-T33 | done | `tests/unit/checkpoint/Restore.test.ts` | file |
| C4-T34 | done | `tests/unit/compaction/CompactionEngine.test.ts` | file |
| C4-T34 | done | `tests/unit/compaction/ProtectionZones.test.ts` | file |
| C4-T35 | done | `tests/unit/hooks/HookSystem.test.ts` | file |
| C4-T35 | done | `tests/unit/hooks/SecretScanHook.test.ts` | file |
| C4-T35 | done | `tests/unit/hooks/AutoVerificationHook.test.ts` | file |
| C4-T36 | done | `tests/unit/memories/MemoryStore.test.ts` | file |
| C4-T36 | done | `tests/unit/memories/AutoMemoryDetector.test.ts` | file |
| C4-T37 | done | `tests/unit/sidechat/SideChatSession.test.ts` | file |
| C4-T39 | done | `tests/e2e/c4-doom-loop.spec.ts` | file |
| C4-T40 | done | `tests/e2e/c4-compaction.spec.ts` | file |
| C4-T41 | done | `tests/e2e/c4-side-chat.spec.ts` | file |
| C4-T42 | done | `tests/bench/c4-perf.bench.ts` | file |
| C5-T15 | done | `tests/e2e/c5-todo-integration.spec.ts` | file |
| C6-T17 | rework | `tests/e2e/c6-debug-mode.spec.ts` | file |
| C6-T18 | rework | `tests/e2e/c6-debug-stop.spec.ts` | file |
| C6-T19 | rework | `tests/e2e/c6-debug-test-failure.spec.ts` | file |
| C6-T20 | rework | `tests/bench/debug-server.bench.ts` | file |
| C7-T44 | rework | `tests/bench/browser.bench.ts` | file |
