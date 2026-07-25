# HARB residual re-verify (2026-07-25)

## Commands
- `npm run compile` → 0 errors
- `npm run test:harness` → **6 passing** (AC-1×2, AC-2×1, AC-3×1, AC-4×2)

## Wiring evidence
- `read_lints`: `src/tools/readTools.ts`, `executeReadLints` in `executors.ts`, AgentLoop map
- Prefetch inject: `injectPrefetchBlock` / `getLastPrefetch`
- Chat: `buildHarnessTurnContext` + `UXForMediumPanel` in ChatApp
- Compaction: `CompactionResult.messages` applied in loop
- JSON recovery: `ToolCallParser` in callModel path

## Queue
- DONE_TASKS/HARB: 38
- TODO_TASKS/tasks/HARB: 0
- MASTER: 100% HARB row

## Residual (non-MVP)
- Live LiteLLM E2E
- VS Code getDiagnostics for LintRunner
