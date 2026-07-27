# RW-P1-06 C0 metadata enrichment evidence

> Generated: 2026-07-25 · Parent may close `RW-P1-06.json` after review.

## Target IDs (14)

C0-T10, C0-T17, C0-T18, C0-T19, C0-T20, C0-T21, C0-T22, C0-T23, C0-T24, C0-T26, C0-T33, C0-T35, C0-T36, C0-T38

## Fields added

Each JSON now includes:

- `description` (implementation-aligned prose)
- `acceptanceCriteria` (string array, derived from prior `completedCriteria`)
- `prdRefs` (PRD-29 Settings Hub where relevant; provider tasks cite PRD-02 / Spec-01 / Infra-17)

## Status decisions

| ID | status | Rationale |
|----|--------|-----------|
| All 14 | `done` | Claimed modules exist on disk (`SecretManager.ts`, `ConfigManager.ts`, `QueueTab.tsx`, etc.) |

No `rework` flips — SecretStorage is implemented via `src/providers/SecretManager.ts` (not missing).

## Validation

```bash
python3 - <<'PY'
import json
from pathlib import Path
ids = ["C0-T10","C0-T17","C0-T18","C0-T19","C0-T20","C0-T21","C0-T22",
       "C0-T23","C0-T24","C0-T26","C0-T33","C0-T35","C0-T36","C0-T38"]
for tid in ids:
    p = Path("DONE_TASKS/C0")/f"{tid}.json"
    d = json.loads(p.read_text())
    assert d.get("description") and d.get("acceptanceCriteria") and d.get("prdRefs")
print("ok", len(ids))
PY
```

## Remaining gaps

- **C0-T10** `prdRefs` still generic (no dedicated Mermaid PRD in tree) — optional follow-up.
- Other C0 tasks outside the 14-ID list may still lack `description`/`acceptanceCriteria` (not in RW-P1-06 scope).
