# Plan V2 — comparison & merge notes

Two independent implementations of "Plan V2" were produced for this
refactor. This document compares them and records what was merged into
this module (`src/plan/session/`, the implementation kept as the base).

## Side-by-side

| Concern | This module (kept as base) | Other implementation (`plan-v2.zip`) |
|---|---|---|
| Source of truth | `PlanTask[]` via `PlanDocument` | `PlanTask[]` via `PlanSession.tasks` — same idea |
| Markdown | `renderPlanMarkdown()`, render-only | `PlanRenderer.renderPlanMarkdown()`, render-only — same idea |
| **LLM → structured plan** | `PlanSchemaGenerator` + `LiteLLMPlanModel`: constrained decoding (`response_format: json_schema`) wired to the real provider layer, schema+semantic validation, bounded retry (max 3) with `FailureContext` fed back into the prompt | **Missing.** No generator, no LLM call, no retry loop. `formatValidationFailureContext()` exists but nothing calls it — it's inert without a generator. |
| Schema validation | zod + hand-mirrored JSON Schema | ad-hoc field checks (no schema library) — works, but more error-prone to extend |
| File existence check | **Intent-aware**: `files: {path, intent: 'read'\|'modify'\|'create'}` — only checks existence for `read`/`modify` | **Not intent-aware**: `files: string[]`, checks *every* listed file unconditionally. A task that legitimately creates a new file will spuriously fail `FILE_NOT_FOUND` unless the caller remembers to leave new files out of the list. |
| Task execution status | `EvidenceEngine`: derives status from *observed* tool calls (file touched, verification command run) — no order enforced, multiple tasks can be "in progress" at once | **Missing** (explicitly listed as future work). Instead: single enforced `active` task, explicit `startTask`/`finishTask` calls required, no correlation to actual tool activity. Reintroduces the "enforced step order" pattern the wider design discussion agreed to avoid. |
| `satisfied` vs `verified` | Yes — edit ≠ passing test | No — task is just `done` |
| Session-level phase guard | **Was missing** — any event could set any phase, no illegal-jump protection | `PlanTransitions.ts`: explicit edge table, throws on illegal jump. **Better than this module had.** → merged in as `PlanPhaseTransitions.ts` |
| Task-level status guard | Deliberately permissive (evidence wins) | Same edge-table philosophy applied to tasks too — this module intentionally does **not** copy that part; see rationale in `PlanPhaseTransitions.ts` |
| Event pub/sub | **Was missing** — `getEvents()` only, no listeners | `PlanSessionStore.onEvent()` | → merged in as `PlanSession.onEvent()` |
| Partial approval | **Was missing** — all-or-nothing | `approve(sessionId, taskIds?)` | → merged in as `plan.approved.taskIds` |
| Multi-session store | Single `PlanSession` instance per id, caller manages the map if needed | `PlanSessionStore` (Map-keyed, `getLatest()`, `list()`) — nicer for multi-tab, but the adapter on top still only tracks one active session, so no functional difference given how ChatApp actually uses it today |
| Legacy adapter strategy | Wraps + delegates to the existing `PlanModeController` instance; old class untouched | Reimplements the *entire* `PlanModeController` public surface fresh (including its own copy of `PLAN_STAGE_PROMPTS`), intending to eventually replace it. Higher risk: two independent copies of stage prompts can drift; more code to keep in sync with `extension.ts`. |
| Stage-navigation UX | Not addressed | `StageNavResult`/`StageNavErrorCode` with Korean user-facing hints — genuinely nice UX layer this module lacked |
| `promotePlanToReview`'s markdown→tasks bridge | Not attempted (out of scope, documented) | `tasksFromLegacyDocument()` — but it calls `planGenerator.extractTodos()`, i.e. the **same regex heuristic** this whole refactor exists to remove. Reasonable as a temporary bridge (their README lists retiring it as "Next"), but worth knowing it isn't actually new behavior yet. |

## Bottom line

The two implementations are close to non-overlapping in what they're
strong at:

- **This module** solves the hardest, most load-bearing problem — getting
  a reliable `PlanTask[]` out of the LLM in the first place, and deriving
  execution progress from what the agent actually did rather than what it
  was told to do. Without a generator, "PlanTask[] is the source of truth"
  is just a data shape with nothing populating it from a live plan turn.
- **The other implementation** is stronger on session-lifecycle rigor and
  UI ergonomics: a real illegal-transition guard, event pub/sub, partial
  approval, and a much friendlier stage-navigation error/hint layer.

## What was merged into this module

1. **`PlanPhaseTransitions.ts`** (new file) — session-*phase* edge table
   and `assertLegalPhaseTransition`, adapted from the other
   implementation's `PlanTransitions.ts`. Scoped deliberately to
   `PlanSession.phase` only (idle→research→planning→review→executing→
   completed/failed) — these really are sequential, user/system-gated
   steps. **Not** applied to `PlanSession.taskStatus`, where evidence-driven
   flexibility remains the intended behavior — see the comment at the top
   of `PlanPhaseTransitions.ts` for the reasoning.
2. **`PlanSession.onEvent()`** — listener pub/sub, borrowed from
   `PlanSessionStore.onEvent()`, so UI code can react to state changes
   instead of re-reading `getState()` after every call.
3. **Partial approval** — `plan.approved` now carries an optional
   `taskIds`; `PlanSession.isAllTasksVerified()` / `getNextSuggestedTask()`
   scope to the approved subset when one was given, defaulting to "all
   tasks" otherwise (unchanged behavior when omitted).
4. **`PlanModeControllerAdapter.approve(taskIds?)`** — exposes the above.

## What was deliberately *not* merged

- **Enforced single-`active`-task + explicit start/finish task calls.**
  This is a real, coherent design — just a different bet than this
  module makes. It optimizes for a predictable UI ("here is the one thing
  happening now") at the cost of requiring perfect start/finish call
  discipline from whatever orchestrates the agent loop, and having no way
  to account for an agent that (very plausibly) reads or edits a
  different task's file while nominally working on another. This module
  keeps `EvidenceEngine` instead. `PlanSession.getNextSuggestedTask()`
  already provides the same "what should the UI highlight as current"
  signal without making it authoritative over what actually happened.
- **Rewriting `PlanModeController`'s entire surface.** Kept this module's
  narrower "wrap and mirror" adapter instead, to minimize what has to
  compile/behave correctly without the ability to test in this sandbox
  (no network → no `npm install` → nothing here has been run, only
  hand-reviewed).
- **Non-intent-aware file existence checks.** This module's
  `read`/`modify`/`create` distinction is strictly more correct; adopting
  the other implementation's simpler `files: string[]` would be a
  regression.

## Recommendation if you want to fold the other implementation's UX layer in fully

`StageNavResult`/`canNavigateStages()`/Korean hint messages are worth
porting as a thin `PlanNav.ts` in this module — they don't conflict with
anything here and would give `ChatApp.tsx` better error messages when a
stage-change attempt is invalid. Not done in this pass to keep the diff
reviewable; flag if you want it added next.

## Post-final-v2 P0 hardening (Grok review pass)

GPT `agent-k-planv2-final-v2` already had:
- shared-file / shared-command ambiguity → no multi-task satisfy
- empty verification → `awaiting_verification` + `verifyTaskManually`
- stricter path/command matching

This pass adds the remaining contract rules:

1. **Dependency gate (PlanSession)**  
   `satisfied` / `awaiting_verification` / `verified` require all
   `dependencies` to already be `verified`. Otherwise the transition is
   rewritten to `blocked` (event log updated to match). Observation may
   still mark `in_progress` out of order.

2. **Auto-unblock**  
   When a task becomes `verified`, any dependent that is `blocked` and
   whose full dep set is now verified returns to `pending`.

3. **SoT write order (adapter)**  
   `start` / `completeResearch` / `approve` / `reject` record on
   `PlanSession` first, then mirror into legacy `PlanModeController`.
   Execution reads stay on the session.

## v3 — closing the two remaining gaps

Two issues were confirmed by direct code reading (not just review notes)
after the Grok P0 pass:

1. **`pathsMatch()` bare-basename false positive was still present**, despite
   a comment claiming it was fixed. `taskPath: "foo.ts"` still matched
   `toolPath: "/workspace/a/foo.ts"` via `b.endsWith('/' + a)`, because that
   check doesn't care how many path segments `a` has. Confirmed by an
   existing test (`does not match a bare basename to an unrelated nested
   file`) that was asserting the fixed behavior but would have failed
   against the actual code — i.e. it was already written correctly, it just
   hadn't been run (no `npm install` in any sandbox so far, per every
   implementation's own notes).

   Fix: a single-segment task path (no `/`) now only matches on exact
   equality with the normalized tool path — no suffix matching at all.
   Multi-segment task paths keep the existing suffix-at-a-boundary
   behavior. This makes the pre-existing test pass for real.

2. **`PlanSession.verifyTaskManually()` had no UI entry point.** The data
   model (`awaiting_verification` status, the method itself, adapter
   pass-through) was all correct, but nothing in `ChatApp.tsx` or
   `PlanReview.tsx` ever called it — a task with no automatic verification
   command would sit in `awaiting_verification` with no way for the user to
   actually clear it through the product.

   Fix: `PlanReview.tsx` now renders a "수동 확인 필요" section listing
   tasks in `awaiting_verification` with a 확인 완료 button per task, wired
   in `ChatApp.tsx` to `planAdapter.verifyTaskManually(taskId)`. Also
   added `PlanSession.onEvent()` → a `planTick` state counter in
   `ChatApp.tsx` so the component actually re-renders when task status
   changes — previously nothing subscribed to `onEvent` even though it
   existed, so reads of `planAdapter.session.*` in JSX were only
   opportunistically fresh.
