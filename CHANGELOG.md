# Change Log

All notable changes to the "agent-k" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

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