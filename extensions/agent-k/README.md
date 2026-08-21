# extensions/agent-k

VSIX assembler only — activation + contributes + wiring.

## Feature IDs

| ID | Scope |
|----|--------|
| **EXT-001** | `activate` → `@agent-k/host`, Activity Bar + `agent-k.chat` webview |

Domain logic stays in `packages/host` (and other packages). Do not put agent loop / React UI here.

## Status

EXT-001: sidebar Chat view loads Phase 0 hello HTML and completes `ui.ready` → `host.hello`.
