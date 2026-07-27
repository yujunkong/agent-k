# Rubber-stamp completion policy (RW-P0-06)

> Detects DONE JSON where `completedCriteria` look complete but lack verifiable evidence.

## Problem

Many DONE tasks mark completion with repeated boilerplate:

- `… implemented`
- `Source code written in appropriate module(s)`
- `npm run compile passes (0 errors)`

Compile success does **not** prove acceptance criteria, PRD alignment, or test coverage.

## Evidence required (completion checklist)

Before setting any task to `done` (DONE, REWORK, or TODO):

| Evidence type | Accept when |
|---------------|-------------|
| **Grep proof** | Command + output snippet in `implementationNotes.verification` or report path |
| **Test output** | `npm test` / e2e log with passing case IDs matching AC |
| **commitHash** | Real 7+ char git SHA, or `N/A` + one-line reason (e.g. docs-only) |
| **Manual checklist** | Linked markdown in `REWORK_TASKS/reports/` with PASS/FAIL rows |

At least **one** non-boilerplate evidence row must appear in `completedCriteria` or linked report.

## `evidence:insufficient` policy

Use when closing a REWORK task review without upgrading DONE:

1. Leave DONE `status: rework` (or TODO pending).
2. Add to REWORK JSON: `"evidence": "insufficient"` and `"evidenceNotes": "<what is missing>"`.
3. Do **not** copy boilerplate `completedCriteria` from sibling tasks.
4. Re-open only when a report path or test/grep/SHA is attached.

Rubber-stamp criteria alone → treat as **insufficient** automatically.

## Detection script

```bash
python3 docs/REWORK_TASKS/scripts/audit-rubber-stamp.py
```

Heuristic: `completedCriteria` matches stamp patterns (`implemented`, `compile passes`, `Source code written`) and lacks test/grep/SHA keywords.

## Remediation

1. Run the script; triage high-severity phases (C5–C7 rework) first.
2. Replace stamp lines with concrete verification strings.
3. Link to `REWORK_TASKS/reports/*` for audit-style tasks (missing files, settings reverify, etc.).

See also: [`REWORK_TASKS/README.md`](../README.md) completion checklist.
