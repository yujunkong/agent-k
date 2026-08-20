# Monorepo split — pointer

Canonical document:

**[`AGENT-K-MONOREPO-FINAL.md`](./AGENT-K-MONOREPO-FINAL.md)**

That file is the single source for:

- Package layout (`chat-ui`, `host`, `core`, `tools`, `providers`, `plan`, `worktree`, `safety`, `shared`, `extensions/agent-k`)
- Feature ID ↔ package mapping
- Phase order (0 → providers → core/tools/safety → chat-ui → worktree → plan)
- R-001…R-005 redesign points
- AGENTS.md / Cursor rule bodies (also applied under repo root / `.cursor/rules/`)

## Current extract status

| Package | Status |
|---------|--------|
| `@agent-k/providers` | **extracted** (`packages/providers`; `src/providers` shims) |
| `@agent-k/shared` | scaffold (`packages/shared/src/index.ts`) |
| chat-ui / host / core / tools / plan / worktree / safety | ownership stubs (code still in `src/`) |
| `extensions/agent-k` | assembly stub (VSIX still root `package.json`) |

Do **not** npm-publish until FINAL §A-6 conditions are met.
