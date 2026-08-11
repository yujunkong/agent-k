# Plan V2 Finalization

## Runtime source of truth

`PlanSession` is the runtime source of truth. `PlanModeController` is retained only as a compatibility boundary during migration and must not become an independent execution state machine.

## Verification invariant

A task with no machine-checkable verification is **not automatically verified**. A successful write moves it to `awaiting_verification`; explicit user/manual verification is required before `verified`.

## Evidence invariant

A single ambiguous tool event must not silently satisfy multiple tasks. Shared-file writes and shared verification commands are left unresolved until additional evidence disambiguates them.

## E2E acceptance path

Research -> structured generation -> schema validation -> semantic validation -> Review -> Approve -> Agent tool event -> satisfied/awaiting verification -> verified -> next task -> completed.

## Migration

Legacy markdown promotion remains only as a compatibility path until the V2 E2E path is proven in the real extension host. After that, remove the legacy promotion/controller execution dependency rather than keeping two authoritative state machines.
