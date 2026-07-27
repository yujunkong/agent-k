# C4 Permission / Checkpoint / Compaction smoke (RW-P1-08)

> Generated: 2026-07-25 · Evidence: `src/extension.ts`, `src/loop/AgentLoopController.ts`, `src/permission/PermissionGate.ts`, `src/checkpoint/CheckpointManager.ts`, `src/compaction/CompactionEngine.ts`, `src/hooks/HookSystem.ts`, `tests/unit/`

## Scope

Smoke **C4-T01, C4-T03, C4-T09, C4-T15** for module existence + agent-loop wiring + default permission sync.

## PASS/FAIL matrix

| Task ID | Title (short) | Result | Evidence / gap |
|---------|---------------|--------|----------------|
| **C4-T01** | PermissionGate 4 levels | **PASS** | `PermissionGate.ts` implements ask / accept_edits / auto / bypass. `extension.ts` constructs gate with `configManager.get('agent-k.permission.level') \|\| 'accept_edits'`. `AgentLoopController.guardWritePermission` reads same key and calls `gate.requestPermission` for write/terminal/restore tools. RW-P0-03 bridge updates gate on `onDidChangeConfiguration`. |
| **C4-T03** | CheckpointManager | **PASS** | `CheckpointManager` registered on `RuntimeServices` in `activate()`. `writeExecutors` + `PatchApplier` + `checkpoint_restore` tool path in `AgentLoopController` use `RuntimeServices.getCheckpointManager()`. Unit: `tests/unit/checkpoint/checkpoint-mgr.test.ts`. |
| **C4-T09** | ContextCompactionEngine 4-stage | **PARTIAL** | `src/compaction/CompactionEngine.ts` (`ContextCompactionEngine`) implemented. **No import** in `AgentLoopController` — compaction not on live loop path. Unit: `tests/unit/compaction/compaction.test.ts` (module-level). |
| **C4-T15** | HookSystem Pre/PostToolUse | **PARTIAL** | `HookSystem.ts` + `autoVerificationHook.ts` exist. **AgentLoopController** does not invoke HookSystem around `executeTool` — hooks compile-only relative to main loop. Unit: `tests/unit/hooks/hook-system.test.ts`. |

## Default permission integration

| Check | Result |
|-------|--------|
| `configManager` default `agent-k.permission.level` | `accept_edits` (`ConfigManager.loadDefaults`) |
| Extension gate bootstrap | Uses configManager value |
| VS Code `contributes` default | `accept_edits` in `package.json` |
| Settings tab | `PermissionTab.tsx` → `configManager.set('agent-k.permission.level', …)` |

## Re-run checklist

```bash
rg "guardWritePermission|getPermissionGate" src/loop/AgentLoopController.ts
rg "setCheckpointManager|CheckpointManager" src/extension.ts src/tools/writeExecutors.ts
rg "ContextCompactionEngine|CompactionEngine" src/loop/ || echo "loop: no compaction import"
rg "HookSystem" src/loop/ || echo "loop: no hook import"
npm run check-types
```
