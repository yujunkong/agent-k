# @agent-k/core

Agent runtime: loop, modes, context, harness, config domain.

## Status

- **CFG-001** ConfigManager — global get/set, defaults, VS Code sync hooks
- **CFG-002** ProjectConfig — `.agentk/settings.json` flatten/parse/example
- **CFG-003** PermissionConfig — level, denyGlobs, requireApprovalTools, write-gate policy knobs

Runtime PermissionGate is **SAFE-001** (`packages/safety`), not here.

See `docs/V3_WORK_ORDER.md` and `docs/AGENT-K-MONOREPO-FINAL.md`.
