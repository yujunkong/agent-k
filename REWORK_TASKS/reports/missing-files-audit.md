# DONE_TASKS missing files audit (RW-P0-05)

> Generated: 2026-07-25 18:18 KST · Script: `REWORK_TASKS/scripts/audit-missing-files.py`

## Summary

| Metric | Count |
|--------|------:|
| Tasks with missing file claims (A/B) | 30 |
| Missing path rows (A/B) | 35 |
| Class A (relocatable / typo) | 11 |
| Class B (claim without file) | 24 |

## Classification legend

| Class | Meaning | Typical action |
|-------|---------|----------------|
| **A** | Path typo or file lives elsewhere | Fix `files[]` in DONE JSON |
| **B** | Claimed path missing, no relocation | `status: rework` + REWORK queue |
| **C** | Intentional N/A (glob, dir, meta) | Excluded from table below |

## All tasks with missing files

| Task ID | Status | Missing path | Class | Notes | Recommended action |
|---------|--------|--------------|-------|-------|-------------------|
| C0-T06 | done | `src/chat/types.ts (StreamDelta에 toolCalls 추가, ProviderConfig에 type 필수 추가)` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
|  |  | `src/chat/api/chatApi.ts (provider config 타입 수정: provider string 시 currentProvider merge)` | **A** | similar file `src/chat/ChatApp.tsx` |  |
|  |  | `src/chat/hooks/useChatStream.ts (전면 재작성: TypeScript 타입 안전성, sendMessage/stop/regenerate 시그니처 통일)` | **B** | no matching file on disk |  |
| C0-T07 | done | `src/chat/components/Composer.tsx: Alt+Enter 큐잉, Cmd+Enter/Ctrl+Enter 처리, 동적 placeholder` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
|  |  | `src/chat/ChatApp.tsx: handleQueueMessage 추가, queue ref로 스트리밍 완료 후 자동 전송` | **A** | similar file `src/chat/ChatApp.tsx` |  |
|  |  | `src/extension.ts: agent-k.chat.focusInput 명령 등록, switchMode 복원` | **A** | similar file `src/extension.ts` |  |
|  |  | `package.json: keybindings 3개 추가 (focusInput, mode.switch, provider.add)` | **B** | no matching file on disk |  |
| C0-T08 | done | `src/chat/StreamingMarkdown.tsx (전면 재작성: 노드 타입 8종, 증분 파싱, 상태 머신)` | **A** | similar file `src/chat/StreamingMarkdown.tsx` | Update DONE `files[]` to actual paths; re-run audit |
| C0-T31 | done | `tests/e2e/fixtures/mock-provider-server.ts` | **A** | implemented elsewhere: `tests/e2e/c0-provider-setup.spec.ts` | Update DONE `files[]` to actual paths; re-run audit |
| C0-T32 | done | `bench/stream-generator.ts` | **A** | similar file `src/chat/StreamingMarkdown.tsx` | Update DONE `files[]` to actual paths; re-run audit |
| C2-T30 | done | `tests/e2e/c2-auto-lint.spec.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C2-T31 | done | `tests/e2e/c2-staleness.spec.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C2-T32 | done | `tests/e2e/c2-multi-file.spec.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C2-T34 | done | `tests/bench/patch-apply.bench.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C3-T19 | done | `tests/unit/loop/DoomLoopDetector.test.ts` | **A** | similar file `src/loop/DoomLoopHandler.ts` | Update DONE `files[]` to actual paths; re-run audit |
| C3-T23 | done | `tests/e2e/c3-stop-handling.spec.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C3-T24 | done | `tests/e2e/c3-doom-loop.spec.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C3-T26 | done | `tests/e2e/c3-compaction.spec.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C4-T39 | done | `tests/e2e/c4-doom-loop.spec.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C4-T40 | done | `tests/e2e/c4-compaction.spec.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C4-T41 | done | `tests/e2e/c4-side-chat.spec.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C4-T42 | done | `tests/bench/c4-perf.bench.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C5-T15 | done | `tests/e2e/c5-todo-integration.spec.ts` | **B** | no matching file on disk | Set DONE `status` to `rework` or restore implementation |
| C6-T17 | rework | `tests/e2e/c6-debug-mode.spec.ts` | **B** | no matching file on disk | Keep `rework`; link REWORK task; implement or fix files[] |
| C6-T18 | rework | `tests/e2e/c6-debug-stop.spec.ts` | **B** | no matching file on disk | Keep `rework`; link REWORK task; implement or fix files[] |
| C6-T19 | rework | `tests/e2e/c6-debug-test-failure.spec.ts` | **B** | no matching file on disk | Keep `rework`; link REWORK task; implement or fix files[] |
| C6-T20 | rework | `tests/bench/debug-server.bench.ts` | **B** | no matching file on disk | Keep `rework`; link REWORK task; implement or fix files[] |
| C7-T03 | rework | `src/browser/DesignModeOverlay.tsx` | **A** | similar file `src/browser/DesignModeContext.ts` | Update DONE `files[]` to actual paths; re-run audit |
| C7-T19 | rework | `src/skills/PinnedSkillsUI.tsx` | **A** | implemented elsewhere: `src/skills/SkillRegistry.ts` | Update DONE `files[]` to actual paths; re-run audit |
| C7-T26 | rework | `src/secrets/SecretsVault.tsx` | **A** | similar file `src/settings/tabs/SecretsTab.tsx` | Update DONE `files[]` to actual paths; re-run audit |
| C7-T34 | rework | `src/firmware/SVDViewer.tsx` | **B** | no matching file on disk | Keep `rework`; link REWORK task; implement or fix files[] |
| C7-T35 | rework | `src/legacy/LegacyScanner.ts` | **B** | no matching file on disk | Keep `rework`; link REWORK task; implement or fix files[] |
| C7-T36 | rework | `src/compliance/MISRAExplainer.ts` | **B** | no matching file on disk | Keep `rework`; link REWORK task; implement or fix files[] |
| C7-T37 | rework | `src/serial/SerialMonitor.tsx` | **B** | no matching file on disk | Keep `rework`; link REWORK task; implement or fix files[] |
| C7-T44 | rework | `tests/bench/browser.bench.ts` | **A** | similar file `src/tools/browser/BrowserToolGroup.ts` | Update DONE `files[]` to actual paths; re-run audit |

## Re-run

```bash
python3 REWORK_TASKS/scripts/audit-missing-files.py --write-report
```
