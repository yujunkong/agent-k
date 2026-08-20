# Monorepo split plan (Agent-K)

Published npm libraries are **out of scope** until another app/extension needs a stable API.
This doc tracks **workspace packages** so agents can stay inside one boundary.

## Why

`src/` already mixes chat / host / harness / tools / providers / mcp. Agents miss the right edit surface.
Package folders + path rules raise catch rate without paying early publish/versioning cost.

## Phases

### Phase 0 — Agent guardrails (done in-repo)

- Root `AGENTS.md`
- `.cursor/rules/*.mdc` per domain (`src/**` + future `packages/**` globs)

### Phase 1 — Workspace scaffold + leaf extract

- npm `workspaces`: `packages/*`
- First real move: **`@agent-k/providers`** → `packages/providers`
- Keep `src/providers/*` as **thin re-export shims** so existing relative imports keep compiling
- Package stubs (README + package.json only) for chat-ui, host, core, tools, mcp

### Phase 2 — Boundary repair (before more moves)

Break / invert these edges:

1. `harness` ↔ `tools` (`AWhitelist` ↔ `registry`) → one-way
2. `tools` → `chat` (`normalizeAskQuestion`, `editDiffPreview`) → move helpers into tools/shared
3. Shrink `ChatApp.tsx` domain imports; host↔webview via `protocol.ts` only
4. Lift shared types (`tools/types`, `agent/types`, protocol) into a tiny contracts surface if needed

### Phase 3 — Runtime packages

Order (risk ascending):

1. `packages/mcp`
2. `packages/tools` (after tools←chat inversion)
3. `packages/core` (harness + loop + agent + config/services)
4. `packages/host` + `extensions/agent-k` assembler
5. `packages/chat-ui` **last** (Vite entry; most coupled today)

### Phase 4 — Optional publish

Only when an external consumer needs semver'd APIs.

## Package map (target)

| Package | Owns today | Notes |
|---------|------------|-------|
| `@agent-k/chat-ui` | `src/chat/**`, settings React panels | Vite IIFE → `dist/chat.js` |
| `@agent-k/host` | `src/host/**`, `extension.ts` | esbuild → `dist/extension.js` |
| `@agent-k/core` | harness, loop, agent, core, mode, prefetch, … | No chat-ui imports |
| `@agent-k/tools` | `src/tools/**` (+ backends) | No chat-ui imports |
| `@agent-k/providers` | `packages/providers/**` | Leaf; shims under `src/providers` |
| `@agent-k/mcp` | `src/mcp/**` | Register via tools API |

## Build constraints

- Keep **dual bundlers**: esbuild (host) + Vite (webview).
- Workspace packages are **bundled source deps**, not runtime `node_modules` requires inside the VSIX (except true externals like `vscode`).
- Typecheck: root `tsc --noEmit` (+ later project references for boundary enforcement).

## Success criteria for agents

- Task prompt can say “only `@agent-k/chat-ui`” and rules/globs attach.
- Cross-domain PRs become explicit and rare.
- No need for published libs to get that benefit.
