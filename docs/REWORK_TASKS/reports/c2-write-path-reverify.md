# C2 write path re-verification (RW-P1-07)

> Generated: 2026-07-25 · Evidence: `src/loop/AgentLoopController.ts`, `src/tools/writeExecutors.ts`, `src/patches/applier.ts`, `src/agent/modeRegistry.ts`, `src/hooks/askOnMaxRetries.ts`, `tests/`

## Scope

Re-check **C2-T01, C2-T02, C2-T08, C2-T15, C2-T18** against runtime wiring (not DONE JSON alone).

## PASS/FAIL matrix

| Task ID | Title (short) | Result | Evidence / gap |
|---------|---------------|--------|----------------|
| **C2-T01** | Agent whitelist: edit/write/terminal | **PASS** | `modeRegistry.ts` lists `edit_file`, `write_file`, `run_terminal_cmd`, `delete_file`. `tests/unit/agent/modeRegistry.test.ts` covers allow checks. |
| **C2-T02** | edit_file Search-Replace parser | **PARTIAL** | DONE cites `src/tools/edit/EditFileTool.ts` + `matcher.ts` — **missing**. Live path: `executeEditFile` → `PatchApplier` + `patchDocument.applySearchReplace` in `writeExecutors.ts`. **AgentLoopController** dispatches `edit_file` via `writeExecutors` map (lines ~573–588). Unique-match semantics live in `patchDocument`, not legacy EditFileTool path. |
| **C2-T08** | PatchApplier + checkpoint rollback | **PASS** | `src/patches/applier.ts` creates checkpoint via `CheckpointManager`, applies hunks, rolls back on failure. Used from `writeExecutors.executeEditFile`. |
| **C2-T15** | Max retries → ask_question | **PARTIAL** | `src/hooks/askOnMaxRetries.ts` + `AskQuestionTool.ts` exist. **AgentLoopController** does not grep-import HookSystem / askOnMaxRetries on max-retry path — module present, loop integration unverified. |
| **C2-T18** | LintRunner / TestFinder unit tests | **FAIL** | `tests/unit/verification/LintRunner.test.ts` exists. **Missing** `TestFinder.test.ts`, `injectVerificationError.test.ts` per DONE file list. |

## Summary

- **edit_file is wired** in `AgentLoopController.executeTool` → `writeExecutors.edit_file` — core RW-P0-05 write path **PASS** for agent mode.
- Legacy C2 file paths in DONE remain stale; prefer updating DONE `files[]` to `writeExecutors.ts` + `patches/applier.ts`.

## Re-run checklist

```bash
rg "edit_file: executeEditFile" src/loop/AgentLoopController.ts
rg "executeEditFile" src/tools/writeExecutors.ts
test -f src/patches/applier.ts && echo applier OK
test -f src/hooks/askOnMaxRetries.ts && echo ask hook OK
ls tests/unit/verification/
```
