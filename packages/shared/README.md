# @agent-k/shared

Protocol / work-event / common error types only. No business logic.

## Feature IDs

| ID | Scope |
|----|--------|
| **SHARED-001** | Extension ↔ Webview protocol (`ui.ready` / `host.hello`, chat.send/stop/stream stubs) |
| **SHARED-002** | Typed Work Event contracts (R-002) — closed `kind` / `status`, no UI string guessing |

## Layout

```text
src/
  common/       mode, ids, SharedError
  protocol/     messages, guards, chat-send, chat-stream, sessions
  work-events/  TypedWorkEvent, FileEditPayload, TerminalRunPayload
```

## Commands

```bash
npm test -w @agent-k/shared
npm run typecheck -w @agent-k/shared
```

See `docs/V3_WORK_ORDER.md` Phase 0 and `docs/AGENT-K-MONOREPO-FINAL.md` (`packages/shared`, R-002).
