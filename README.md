# Agent-K Mode Auto Classifier

Canonical module: `src/mode/` (`classifyMode`, `resolveSendMode`, `lastConversationTurn`).

Do not add a second copy under `src/agent/`. Loop `Mode` lives in `src/agent/types.ts`.

## Wiring

Composer Mode picker:

- **Auto** (default on a new chat) — `handleSend` calls `resolveSendMode` → heuristic classifier
- **Ask / Plan / Debug / Agent** — locked; classifier is skipped (`source: 'manual'`)
- Plan→Agent handoff uses `modeOverride: 'agent'`

`ConversationTurn` is derived from the last user/assistant pair for sticky `previousWasActive`.

## Sticky

- agent/debug keep the mode while the previous turn ran tools, unless the user says plan only / ask only / stop / …
- an in-flight Plan V2 session (research / planning / review) stays on plan
- weak signal → previous turn mode, or **ask** on the first Auto message
