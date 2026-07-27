#!/usr/bin/env python3
"""
RW-P2-03: DONE_TASKS JSON 필수 필드(description, acceptanceCriteria, prdRefs) 검증.

Usage:
  python3 docs/REWORK_TASKS/scripts/validate-done-tasks.py
  python3 docs/REWORK_TASKS/scripts/validate-done-tasks.py --json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DOCS_ROOT = SCRIPT_DIR.parents[1]  # scripts -> REWORK_TASKS -> docs
REPO_ROOT = SCRIPT_DIR.parents[2]  # repo root
DONE_ROOT = DOCS_ROOT / "DONE_TASKS"

REQUIRED = ("description", "acceptanceCriteria", "prdRefs")


def is_missing(doc: dict, key: str) -> bool:
    val = doc.get(key)
    if val is None:
        return True
    if key in ("acceptanceCriteria", "prdRefs") and isinstance(val, list) and len(val) == 0:
        return True
    if key == "description" and isinstance(val, str) and not val.strip():
        return True
    return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Emit JSON array")
    args = parser.parse_args()

    rows: list[dict] = []
    for p in sorted(DONE_ROOT.glob("**/*.json")):
        doc = json.loads(p.read_text(encoding="utf-8"))
        tid = doc.get("id") or p.stem
        missing_fields = [k for k in REQUIRED if is_missing(doc, k)]
        if missing_fields:
            rows.append(
                {
                    "id": tid,
                    "path": str(p.relative_to(REPO_ROOT)),
                    "missing": missing_fields,
                }
            )

    if args.json:
        print(json.dumps(rows, indent=2, ensure_ascii=False))
    else:
        print(f"tasks_with_gaps={len(rows)}")
        for r in rows:
            print(f"{r['id']}: missing {', '.join(r['missing'])}")

    raise SystemExit(0 if not rows else 1)


if __name__ == "__main__":
    main()
