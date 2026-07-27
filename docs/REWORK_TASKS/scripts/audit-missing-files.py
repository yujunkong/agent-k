#!/usr/bin/env python3
"""
RW-P0-05: DONE_TASKS JSON의 files[]·유사 필드 경로를 repo root 기준으로 검사하고
누락 태스크를 A(경로 오류/이전 가능) / B(미구현 클레임) / C(의도적 N/A)로 분류합니다.

Usage:
  python3 docs/REWORK_TASKS/scripts/audit-missing-files.py
  python3 docs/REWORK_TASKS/scripts/audit-missing-files.py --write-report
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# repo root = parents[2] from docs/REWORK_TASKS/scripts/
SCRIPT_DIR = Path(__file__).resolve().parent
DOCS_ROOT = SCRIPT_DIR.parents[1]  # scripts -> REWORK_TASKS -> docs
REPO_ROOT = SCRIPT_DIR.parents[2]  # repo root
DONE_GLOB = "docs/DONE_TASKS/**/*.json"
REPORT_PATH = DOCS_ROOT / "REWORK_TASKS" / "reports" / "missing-files-audit.md"

PATH_KEYS = ("files", "testFiles", "testPaths")


@dataclass
class MissingEntry:
    path: str
    classification: str  # A | B | C
    note: str = ""


@dataclass
class TaskAudit:
    task_id: str
    status: str
    phase: str
    missing: list[MissingEntry] = field(default_factory=list)


def collect_claimed_paths(doc: dict[str, Any]) -> list[str]:
    """JSON에서 파일 경로로 해석되는 문자열을 수집."""
    paths: list[str] = []
    for key in PATH_KEYS:
        val = doc.get(key)
        if isinstance(val, list):
            paths.extend(str(p).strip() for p in val if p)
        elif isinstance(val, str) and val.strip():
            paths.append(val.strip())

    impl = doc.get("implementationNotes")
    if isinstance(impl, dict):
        fm = impl.get("filesModified")
        if isinstance(fm, list):
            paths.extend(str(p).strip() for p in fm if p)

    # 중복 제거, 순서 유지
    seen: set[str] = set()
    out: list[str] = []
    for p in paths:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def is_intentional_na(path: str) -> tuple[bool, str]:
    """C: glob·디렉터리-only·메타 경로 등 검사 대상에서 제외."""
    if not path or path in (".", ".."):
        return True, "empty or relative placeholder"
    if "*" in path or "?" in path or "**" in path:
        return True, "glob pattern"
    if path.endswith("/") or path.endswith("\\"):
        return True, "directory-only reference"
    # 디렉터리 클레임만 있고 하위 파일을 나열하지 않은 경우
    if path.endswith("/") is False and not os.path.splitext(path)[1]:
        full = REPO_ROOT / path
        if full.is_dir():
            return True, "existing directory (not a single file claim)"
    meta_prefixes = ("PRD", "TODO_TASKS/", "DONE_TASKS/", "REWORK_TASKS/", "docs/TODO_TASKS/", "docs/DONE_TASKS/", "docs/REWORK_TASKS/", "docs/PRDs/")
    if any(path.startswith(m) for m in meta_prefixes):
        return True, "documentation / task tree reference"
    return False, ""


def find_relocatable(path: str) -> tuple[bool, str]:
    """A: 동일 basename이 repo 다른 위치에 존재."""
    base = os.path.basename(path)
    if not base or base == path:
        return False, ""
    matches: list[str] = []
    for root, _dirs, files in os.walk(REPO_ROOT):
        # node_modules 등 제외
        if "node_modules" in root or ".git" in root:
            continue
        if base in files:
            rel = os.path.relpath(os.path.join(root, base), REPO_ROOT)
            if rel.replace("\\", "/") != path.replace("\\", "/"):
                matches.append(rel.replace("\\", "/"))
    if len(matches) == 1:
        return True, f"found at `{matches[0]}`"
    if len(matches) > 1:
        return True, f"found {len(matches)} candidates (e.g. `{matches[0]}`)"
    # stem 유사 (QueueIndicator vs MessageQueueUI)
    stem = Path(path).stem.lower()
    if len(stem) >= 6:
        for root, _dirs, files in os.walk(REPO_ROOT / "src"):
            for f in files:
                if stem in f.lower() or f.lower().startswith(stem[:6]):
                    rel = os.path.relpath(os.path.join(root, f), REPO_ROOT)
                    return True, f"similar file `{rel.replace(chr(92), '/')}`"
    return False, ""


def classify_missing(path: str, task: dict[str, Any]) -> MissingEntry:
    na, na_reason = is_intentional_na(path)
    if na:
        return MissingEntry(path, "C", na_reason)

    full = REPO_ROOT / path
    if full.exists():
        return MissingEntry(path, "C", "exists (race or symlink)")

    reloc, reloc_note = find_relocatable(path)
    if reloc:
        return MissingEntry(path, "A", reloc_note)

    # implementationNotes에 다른 경로로 실제 수정됐으면 A
    impl = task.get("implementationNotes") or {}
    if isinstance(impl, dict):
        modified = impl.get("filesModified") or []
        for m in modified:
            mf = REPO_ROOT / str(m)
            if mf.exists() and os.path.basename(m) != os.path.basename(path):
                return MissingEntry(path, "A", f"implemented elsewhere: `{m}`")

    return MissingEntry(path, "B", "no matching file on disk")


def recommended_action(task: TaskAudit) -> str:
    classes = {m.classification for m in task.missing}
    if task.missing and classes <= {"C"}:
        return "No action — paths are N/A or directories"
    if "B" in classes:
        if task.status == "rework":
            return "Keep `rework`; link REWORK task; implement or fix files[]"
        return "Set DONE `status` to `rework` or restore implementation"
    if "A" in classes:
        return "Update DONE `files[]` to actual paths; re-run audit"
    return "Review manually"


def audit_all() -> list[TaskAudit]:
    results: list[TaskAudit] = []
    done_root = DOCS_ROOT / "DONE_TASKS"
    for json_path in sorted(done_root.glob("**/*.json")):
        with open(json_path, encoding="utf-8") as f:
            doc = json.load(f)
        task_id = doc.get("id") or json_path.stem
        status = doc.get("status", "unknown")
        phase = doc.get("phase") or json_path.parent.name

        task_audit = TaskAudit(task_id=task_id, status=status, phase=phase)
        for path in collect_claimed_paths(doc):
            full = REPO_ROOT / path
            na, _ = is_intentional_na(path)
            if na:
                continue
            if not full.exists():
                task_audit.missing.append(classify_missing(path, doc))

        if task_audit.missing:
            # C만 남기면 태스크 전체에서 제외 (실질 누락 없음)
            substantive = [m for m in task_audit.missing if m.classification != "C"]
            if substantive:
                task_audit.missing = substantive
                results.append(task_audit)
    return results


def render_report(audits: list[TaskAudit]) -> str:
    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M %Z")
    by_class: dict[str, int] = {"A": 0, "B": 0, "C": 0}
    for t in audits:
        for m in t.missing:
            by_class[m.classification] = by_class.get(m.classification, 0) + 1

    lines = [
        "# DONE_TASKS missing files audit (RW-P0-05)",
        "",
        f"> Generated: {now} · Script: `docs/REWORK_TASKS/scripts/audit-missing-files.py`",
        "",
        "## Summary",
        "",
        f"| Metric | Count |",
        f"|--------|------:|",
        f"| Tasks with missing file claims (A/B) | {len(audits)} |",
        f"| Missing path rows (A/B) | {sum(len(t.missing) for t in audits)} |",
        f"| Class A (relocatable / typo) | {by_class.get('A', 0)} |",
        f"| Class B (claim without file) | {by_class.get('B', 0)} |",
        "",
        "## Classification legend",
        "",
        "| Class | Meaning | Typical action |",
        "|-------|---------|----------------|",
        "| **A** | Path typo or file lives elsewhere | Fix `files[]` in DONE JSON |",
        "| **B** | Claimed path missing, no relocation | `status: rework` + REWORK queue |",
        "| **C** | Intentional N/A (glob, dir, meta) | Excluded from table below |",
        "",
        "## All tasks with missing files",
        "",
        "| Task ID | Status | Missing path | Class | Notes | Recommended action |",
        "|---------|--------|--------------|-------|-------|-------------------|",
    ]

    for t in audits:
        action = recommended_action(t)
        for i, m in enumerate(t.missing):
            tid = t.task_id if i == 0 else ""
            st = t.status if i == 0 else ""
            act = action if i == 0 else ""
            note = m.note.replace("|", "\\|")
            lines.append(
                f"| {tid} | {st} | `{m.path}` | **{m.classification}** | {note} | {act} |"
            )

    lines.extend(
        [
            "",
            "## Re-run",
            "",
            "```bash",
            "python3 docs/REWORK_TASKS/scripts/audit-missing-files.py --write-report",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit DONE_TASKS file path claims")
    parser.add_argument(
        "--write-report",
        action="store_true",
        help=f"Write full report to {REPORT_PATH.relative_to(REPO_ROOT)}",
    )
    args = parser.parse_args()

    audits = audit_all()
    report = render_report(audits)

    if args.write_report:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(report, encoding="utf-8")
        print(f"Wrote {REPORT_PATH}")

    # stdout summary for CI
    a_count = sum(1 for m in (e for t in audits for e in t.missing) if m.classification == "A")
    b_count = sum(1 for m in (e for t in audits for e in t.missing) if m.classification == "B")
    print(f"tasks_with_missing={len(audits)} paths_A={a_count} paths_B={b_count}")


if __name__ == "__main__":
    main()
