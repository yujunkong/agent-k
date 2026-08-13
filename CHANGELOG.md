# Change Log

All notable changes to the "agent-k" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- OpenCode Zen / Go: Test Connection (and auto-refresh) **replaces** the Composer
  model catalog instead of merging with leftover local models.
- Composer model picker: searchable filter (type to narrow the list).

- Initial release

### Chat UX Roadmap — Phase 1a (diagnostics only, no behavior change)
- `AgentLoopController`: added optional `onClassifyEvent` hook on `LoopConfig`.
  Instruments the four natural-language classifiers that decide prose
  final/continue/broken-payload status — `isWeakFinalAnswer`,
  `looksLikeClosingSummary`, `claimsContinueWork`,
  `looksLikeBrokenToolPayload`. Each now reports `{fn, result, sample, turn}`
  through the hook; control flow and return values are unchanged
  (verified: original logic moved into `*Impl` methods, wrappers only add
  the emit call).
- New setting `agent-k.debugClassifiers` (default `false`). When enabled,
  logs each classification to the Extension Host console as
  `[agent-k:classify] turn=N fn=result :: "text sample"`.
- Purpose: observe where these heuristics actually misfire (e.g. a genuine
  closing summary getting flagged as "continue work") before touching their
  regex logic — see chat UX roadmap Phase 1a/1b.
- `MessageSteps.tsx` reverted to the pre-rewrite version; not touched in
  this pass. Phase 2 changes should be additive only (see roadmap §4:
  "휴리스틱 축소 — 삭제 아님").

  # Fix: agent-k.debugClassifiers never applied

## Root cause
`package.json` declared `agent-k.debugClassifiers`, but
`AGENT_K_VSCODE_CONFIG_KEYS` in ConfigManager.ts did **not** include it.
`readAgentKFromVSCode()` only syncs keys in that list →
`configManager.get('agent-k.debugClassifiers')` was always undefined →
`onClassifyEvent` never wired → zero logs.

## Fix
1. Add `agent-k.debugClassifiers` to `AGENT_K_VSCODE_CONFIG_KEYS` + defaults.
2. extension.ts: also read `vscode.workspace.getConfiguration('agent-k').get('debugClassifiers')`.
3. Log once at loop start when enabled: `[agent-k:classify] enabled — ...`

## Apply
Copy onto v2.1:
- src/core/ConfigManager.ts
- src/extension.ts

Then F5 again. In Extension Development Host:
1. settings.json: `"agent-k.debugClassifiers": true`
2. Agent mode one short turn (not plan.v2.generate only)
3. Debug Console filter: `agent-k:classify`
You should see the "enabled" line immediately when a chat loop starts.