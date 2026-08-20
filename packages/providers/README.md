# @agent-k/providers

LLM provider clients, model registry/routing, and stream parse/format helpers.

**Boundary:** do not import `chat`, `host`, or `tools` implementations.
May use `src/core` config and small shared types (e.g. thinking effort) until `@agent-k/core` exists.

Compatibility shims live at `src/providers/*.ts` so existing relative imports keep working.
Prefer new code to import via `@agent-k/providers/...`.
