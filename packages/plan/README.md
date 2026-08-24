# @agent-k/plan

Plan Card domain: **PlanSession + PlanEvent** (SoT) + execution engine.

## Pipeline

```text
plan.generate (host)
  → PlanSchemaGenerator (constrained JSON)
  → PlanDocument
  → plan.generate.result → chat-ui PlanCard

PlanCard Build
  → plan.execute (optional taskIds)
  → buildExecutionPlan + runPlanExecution
  → plan.card.patch (task status)
```

## Rules (R-004)

- Markdown is render-only (`renderPlanMarkdown`).
- Mutations only via `PlanSession.recordEvent()`.
- No React / vscode in this package.

See `docs/V3_WORK_ORDER.md` Phase 6 Track 0–4.
