# @agent-k/safety

Permission, deny globs, terminal deny, write gate, secrets vault, checkpoint, verification, hooks.

Depends on `@agent-k/shared` only (not `@agent-k/core` — avoids cycles). `PermissionLevel` is duplicated locally to match CFG-003.

## Feature IDs

| ID | Module | Notes |
|----|--------|-------|
| SAFE-001 | `PermissionGate.ts` | levels, session allow, listener |
| SAFE-002 | `denyGlobs.ts` | `isPathDenied` + default globs |
| SAFE-003 | `terminalDenyPatterns.ts` | `rm -rf /`, `mkfs`, `dd if=`, fork bomb |
| SAFE-004 | `writeGate.ts` | `canWrite` from level + path |
| SAFE-005 | `SecretsVault.ts` | interface + in-memory impl (never log values) |
| SAFE-006 | `CheckpointManager.ts` | in-memory create/list/restore metadata |
| SAFE-007 | `VerificationFirst.ts` | policy flag helper |
| SAFE-008 | `VerificationMicroLoop.ts` | check → fix attempts → stop |
| SAFE-009 | `RelatedTestRunner.ts` | interface + stub recording paths |
| SAFE-010 | `HooksSystem.ts` | beforeTool/afterTool; fail → explicit error |

## Commands

```bash
npm test -w @agent-k/safety
npm run typecheck -w @agent-k/safety
```
