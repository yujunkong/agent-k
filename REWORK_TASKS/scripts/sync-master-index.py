#!/usr/bin/env python3
"""
RW-P0-01: DONE_TASKS 실측 집계 + MASTER_TASK_INDEX.md 대시보드/상태 열 동기화.

Usage:
  python3 REWORK_TASKS/scripts/sync-master-index.py              # stdout summary
  python3 REWORK_TASKS/scripts/sync-master-index.py --update-index
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
DONE_ROOT = REPO_ROOT / "DONE_TASKS"
INDEX_PATH = REPO_ROOT / "TODO_TASKS" / "MASTER_TASK_INDEX.md"

# | # | Task ID | ... | P0 | STATUS | deps |
ROW_RE = re.compile(
    r"^(\|\s*\d+\s*\|\s*(C\d+-T\d+|HARB-T\d+)\s*\|.*?\|\s*(P\d|P0|P1|P2)\s*\|\s*)([^|]+?)(\s*\|.*)$"
)

DASHBOARD_ROW_RE = re.compile(
    r"^(\|\s*\*\*(C\d|HARB|TOTAL)\*\*[^|]*\|)[^|]*(\|)[^|]*(\|)[^|]*(\|)[^|]*(\|)[^|]*(\|)\s*$"
)


def load_done_map() -> dict[str, str]:
    """Task ID -> normalized status (done | rework)."""
    out: dict[str, str] = {}
    for p in sorted(DONE_ROOT.glob("**/*.json")):
        doc = json.loads(p.read_text(encoding="utf-8"))
        tid = doc.get("id") or p.stem
        raw = doc.get("status", "unknown")
        if raw in ("done", "completed"):
            out[tid] = "done"
        elif raw == "rework":
            out[tid] = "rework"
        else:
            out[tid] = raw
    return out


def chapter_stats(done_map: dict[str, str]) -> dict[str, dict[str, int]]:
    chapters: dict[str, dict[str, int]] = defaultdict(
        lambda: {"total": 0, "done": 0, "rework": 0, "other": 0}
    )
    for p in sorted(DONE_ROOT.glob("C*/*.json")):
        phase = p.parent.name
        doc = json.loads(p.read_text(encoding="utf-8"))
        chapters[phase]["total"] += 1
        st = doc.get("status", "")
        if st in ("done", "completed"):
            chapters[phase]["done"] += 1
        elif st == "rework":
            chapters[phase]["rework"] += 1
        else:
            chapters[phase]["other"] += 1
    return chapters


def status_icon(status: str) -> str:
    if status == "done":
        return "✅"
    if status == "rework":
        return "🔄 rework"
    return "☐"


def format_dashboard_line(phase_key: str, stats: dict[str, int], label: str) -> str:
    total = stats["total"]
    done = stats["done"]
    rework = stats["rework"]
    pending = max(0, total - done - rework)
    pct = int(round(100 * done / total)) if total else 0
    if rework and done:
        state = f"🔄 {done}/{total} done · {rework} rework"
    elif rework and not done:
        state = f"🔄 rework ({rework})"
    elif done == total:
        state = "✅ 완료"
    else:
        state = "⏳ 진행"
    return (
        f"| **{phase_key}** {label} | {total} | {done} | {rework} | {pending} | {pct}% | {state} |"
    )


def update_index(done_map: dict[str, str], chapters: dict[str, dict[str, int]]) -> None:
    text = INDEX_PATH.read_text(encoding="utf-8")
    lines = text.splitlines()

    # 상세 행: DONE에 있는 ID만 상태 갱신 (없는 ID는 invent하지 않음)
    new_lines: list[str] = []
    for line in lines:
        m = ROW_RE.match(line)
        if m and m.group(2) in done_map:
            icon = status_icon(done_map[m.group(2)])
            line = f"{m.group(1)}{icon}{m.group(5)}"
        new_lines.append(line)
    text = "\n".join(new_lines)

    # 대시보드 블록 교체 (C0–C7, HARB, TOTAL)
    phase_labels = {
        "C0": "Chat UI + Streaming + Settings",
        "C1": "Ask Mode (Read-Only)",
        "C2": "Agent Single Turn",
        "C3": "Agent Multi-Turn + Resynthesize",
        "C4": "Infrastructure",
        "C5": "Plan Mode",
        "C6": "Debug Mode",
        "C7": "Production Grade",
    }

    out_lines: list[str] = []
    for line in text.splitlines():
        replaced = False
        for pk, label in phase_labels.items():
            if line.startswith(f"| **{pk}**"):
                st = chapters.get(pk, {"total": 0, "done": 0, "rework": 0})
                out_lines.append(format_dashboard_line(pk, st, label))
                replaced = True
                break
        if replaced:
            continue
        if line.startswith("| **HARB**"):
            # HARB는 DONE에 없음 — TODO 기준 유지 (38 pending)
            out_lines.append(
                "| **HARB** Harness/Specs (병렬) | 38 | 0 | 0 | 38 | 0% | ⏳ 다음 목표 |"
            )
            replaced = True
        if replaced:
            continue
        if line.startswith("| **TOTAL**"):
            tot = sum(chapters[p]["total"] for p in chapters)
            done = sum(chapters[p]["done"] for p in chapters)
            rework = sum(chapters[p]["rework"] for p in chapters)
            pending = 38  # HARB still in TODO
            grand = tot + pending
            pct = int(round(100 * done / grand)) if grand else 0
            out_lines.append(
                f"| **TOTAL** | **~{grand}** | **{done}** | **{rework}** | **{pending + max(0, tot - done - rework)}** | **~{pct}%** | |"
            )
            continue
        out_lines.append(line)

    INDEX_PATH.write_text("\n".join(out_lines) + "\n", encoding="utf-8")


def print_summary(chapters: dict[str, dict[str, int]], done_map: dict[str, str]) -> None:
    print("=== DONE_TASKS by chapter ===")
    for pk in sorted(chapters.keys()):
        s = chapters[pk]
        print(f"{pk}: total={s['total']} done={s['done']} rework={s['rework']}")
    print(f"unique_ids_in_done={len(done_map)}")
    print(f"rework_flags={sum(1 for v in done_map.values() if v == 'rework')}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--update-index", action="store_true")
    args = parser.parse_args()

    done_map = load_done_map()
    chapters = chapter_stats(done_map)
    print_summary(chapters, done_map)

    if args.update_index:
        update_index(done_map, chapters)
        print(f"Updated {INDEX_PATH}")


if __name__ == "__main__":
    main()
