# Agent K Plan V2 — Final Patch Notes

## What changed

- PlanTask is now an immutable plan definition; runtime task status lives only in PlanSession.taskStatus.
- Markdown is a render target. Structured Plan Review is read-only and cannot silently mutate the TaskGraph.
- Plan generation is wired into the Plan flow after clarifying questions using constrained JSON output, schema validation, repository-aware semantic validation, and bounded retries.
- Semantic file validation runs in the Extension Host through `plan.fileExists` requests, so the webview does not weaken repository checks.
- Planner retry failures include explicit failure context; model transport failures and file-check failures are surfaced as structured validation failures.
- Plan sessions are kept per chat session and are explicitly reset on discard.
- Approval validates task IDs and automatically includes transitive prerequisites for partial approvals.
- Failed tasks remain eligible for retry; verified tasks are the only terminal execution state.
- Evidence correlation is stricter for write intent, file paths, and verification commands.
- Build handoff uses the current structured task context instead of injecting the entire Markdown plan into the agent prompt.
- Plan rejection regenerates through the structured Planner path with the rejection feedback included.
- Plan generation event history now records attempts explicitly.

## Validation performed

- TypeScript transpile/syntax checks passed for all modified Plan V2, PlanReview, ChatApp, extension, and Plan V2 test files.
- Full npm test/build could not be executed in the provided environment because dependencies are not installed and the environment could not fetch the package tarballs.
