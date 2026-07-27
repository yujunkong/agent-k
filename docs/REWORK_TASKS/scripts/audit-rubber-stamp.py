#!/usr/bin/env python3
"""
RW-P0-06 보조: completedCriteria 고무도장 패턴 탐지.

Usage:
  python3 docs/REWORK_TASKS/scripts/audit-rubber-stamp.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DOCS_ROOT = SCRIPT_DIR.parents[1]  # scripts -> REWORK_TASKS -> docs
REPO_ROOT = SCRIPT_DIR.parents[2]  # repo root
DONE_ROOT = DOCS_ROOT / "DONE_TASKS"

STAMP_PATTERNS = (
    re.compile(r"implemented", re.I),
    re.compile(r"compile passes", re.I),
    re.compile(r"Source code written", re.I),
)
EVIDENCE_PATTERNS = (
    re.compile(r"grep|test|e2e|unit|SHA|commit|#[0-9a-f]{7,}", re.I),
    re.compile(r"npm run test", re.I),
    re.compile(r"playwright", re.I),
)


def criteria_evidence(criteria: list[str]) -> bool:
    blob = "\n".join(criteria)
    if any(p.search(blob) for p in EVIDENCE_PATTERNS):
        return True
    # compile만 2개 이상 stamp
    stamps = sum(1 for c in criteria for p in STAMP_PATTERNS if p.search(c))
    return stamps < 2 or len(criteria) > 3


def main() -> None:
    flagged: list[tuple[str, list[str]]] = []
    for p in sorted(DONE_ROOT.glob("**/*.json")):
        doc = json.loads(p.read_text(encoding="utf-8"))
        cc = doc.get("completedCriteria") or []
        if not isinstance(cc, list) or not cc:
            continue
        if not criteria_evidence(cc):
            flagged.append((doc.get("id", p.stem), cc))

    print(f"rubber_stamp_candidates={len(flagged)}")
    for tid, cc in flagged[:20]:
        print(f"  {tid}: {len(cc)} criteria")
    if len(flagged) > 20:
        print(f"  ... and {len(flagged) - 20} more")


if __name__ == "__main__":
    main()
