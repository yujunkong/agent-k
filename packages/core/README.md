# @agent-k/core

Agent runtime: loop, modes, context, debug, reliability, config domain.

## Status

### Config
- **CFG-001** ConfigManager — global get/set, defaults, VS Code sync hooks
- **CFG-002** ProjectConfig — `.agentk/settings.json` flatten/parse/example
- **CFG-003** PermissionConfig — level, denyGlobs, requireApprovalTools, write-gate policy knobs
- **CFG-004** HarnessConfig — harness/verification/prefetch flags
- **CFG-005** QueueConfig — enter-while-running / stop / debounce
- **CFG-006** TerminalConfig — timeout + deny patterns
- **CFG-007** ReviewConfig — apply policy + auto checkpoint
- **CFG-009** ThinkingEffort — off/low/medium/high/max
- **CFG-010** DebugClassifierConfig — classifier diagnostics toggle

### Agent / Context
- **AGENT-001…019** AgentLoopController, multi-turn, tool loop, compaction, doom loop, classifiers, parallel/streaming tools, synthesizeInstructions
- **CTX-001…005** context budget, read max lines, ContextAssembler, CompactionEngine, WorkspaceContext

### Mode / Debug / Reliability
- **MODE-001…009** Ask/Agent/Plan/Debug/Auto + sticky/override/handoff + ModeRegistry
- **DEBUG-001…010** DebugModeController FSM (domain only, no UI)
- **REL-001…008** classifier diagnostics, plan watchdog, streaming buffer, turn SM, send epoch, regeneration safety, tool payload validation, compaction integrity

Runtime PermissionGate is **SAFE-001** (`packages/safety`), not here.

See `docs/V3_WORK_ORDER.md` and `docs/AGENT-K-MONOREPO-FINAL.md`.
