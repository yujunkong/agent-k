# Mode classifier → ChatApp

Canonical module: `src/mode/` (not `src/agent/modeClassifier.ts`).

## Send path

`ChatApp.handleSend` calls `resolveSendMode`:

- Mode picker **Auto** → `classifyMode` (sticky → heuristic → fallback)
- Locked Ask/Agent/Plan/Debug → that mode (`source: 'manual'`)
- `opts.modeOverride` (Plan→Agent handoff) → override, skip classifier

`ConversationTurn` is derived from the last user/assistant pair via `lastConversationTurn(messages)` for sticky `previousMode` / `previousWasActive`.

The user bubble stores `metadata.mode` + `metadata.modeDecision`.

## LLM router

`classifyModeWithLLM` / `classifyModeHybrid` still fall back to the heuristic until a router model is wired (`ROUTER_SYSTEM_PROMPT`).
