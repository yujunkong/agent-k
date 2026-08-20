# @agent-k/shared

Protocol types, Typed Work Events, and pure subagent-result helpers.

**Phase 0 (extracted):**
- `protocol.ts` — Extension ↔ Webview message contracts
- `workEvent.ts` — `ConversationWorkEvent` / `HostWorkPayload` contracts (R-002)
- `subagentResult.ts` — subagent completion / worktree action model

**Forbidden:** React, `vscode`, business logic from core/tools/providers.

Consumers should import `@agent-k/shared` (or `/protocol`, `/workEvent`, `/subagentResult`).
Compatibility shims remain under `src/chat/protocol.ts` and `src/chat/conversation/subagentResult.ts`.
