# Agent-K v3.0

Clean transplant monorepo. **Not** a refactor of the v2.1 tree.

| Role | Value |
|------|--------|
| Reference (read-only) | `v2.1-PRODUCTION-MODE` |
| Write target | **`v3.0`** |
| Feature checklist | `docs/AGENT-K-FEATURE-MASTER-v2.1-PRODUCTION-MODE-FINAL.md` |
| Package map | `docs/AGENT-K-MONOREPO-FINAL.md` |
| How / order | `docs/V3_WORK_PLAN.md`, `docs/V3_WORK_ORDER.md` |
| Agent rules | `AGENTS.md`, `.cursor/rules/` |

## Layout (skeleton)

```text
extensions/agent-k/     # VSIX assembler only
packages/
  shared/ host/ chat-ui/ core/ tools/ providers/
  plan/ worktree/ safety/   # 2nd-wave stubs
docs/                   # Master + monorepo + work order
```

## Status

- **S-001~S-012:** skeleton done (empty packages, no Feature logic).
- **Next Feature:** `SHARED-001` or `EXT-001` — see Work Order Phase 0.

## Commands

```bash
npm install          # link workspaces
npm run check        # skeleton placeholder
```

Full VS Code build/run lands with **EXT-001** (activation + contributes).
Do not copy `v2.1` `src/` wholesale — transplant by Feature ID only.
