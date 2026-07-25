#!/usr/bin/env python3
"""
RW-P1-03: Class A missing path claims in DONE_TASKS — remap files[] to on-disk paths.

Reuses classification from audit-missing-files.py. Applies fixes when a single
best replacement exists (audit note, filesModified, or explicit rename map).

Usage:
  python3 REWORK_TASKS/scripts/fix-done-files-paths.py           # dry-run summary
  python3 REWORK_TASKS/scripts/fix-done-files-paths.py --apply   # patch DONE JSON
"""

from __future__ import annotations

import argparse
import json
import re
import runpy
import sys
from dataclasses import dataclass, field
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
DONE_ROOT = REPO_ROOT / "DONE_TASKS"

_audit_path = SCRIPT_DIR / "audit-missing-files.py"
_audit = runpy.run_path(str(_audit_path))

collect_claimed_paths = _audit["collect_claimed_paths"]
classify_missing = _audit["classify_missing"]
is_intentional_na = _audit["is_intentional_na"]

# Well-known module consolidations (basename / legacy path fragment → canonical)
EXPLICIT_REMAP: dict[str, str] = {
    "src/tools/edit/EditFileTool.ts": "src/tools/editTools.ts",
    "src/tools/edit/WriteFileTool.ts": "src/tools/editTools.ts",
    "src/patches/matcher.ts": "src/tools/editTools.ts",
    "src/tools/search/GrepTool.ts": "src/tools/readTools.ts",
    "src/tools/search/GlobTool.ts": "src/tools/readTools.ts",
    "src/tools/search/FileSearchTool.ts": "src/tools/readTools.ts",
    "src/tools/search/ListDirTool.ts": "src/tools/readTools.ts",
    "src/tools/search/ReadFileTool.ts": "src/tools/readTools.ts",
    "src/tools/search/CodebaseSearchTool.ts": "src/tools/readTools.ts",
    "src/tools/search/LspTools.ts": "src/tools/readTools.ts",
    "src/tools/search/index.ts": "src/tools/readTools.ts",
    "src/agent/loop.ts": "src/loop/AgentLoopController.ts",
    "src/loop/AgentLoop.ts": "src/loop/AgentLoopController.ts",
    "src/loop/MaxTurnsGuard.ts": "src/loop/AgentLoopController.ts",
    "src/loop/StopHandler.ts": "src/loop/StopHandler.ts",
    "src/loop/ErrorRecovery.ts": "src/loop/AgentLoopController.ts",
    "src/chat/hooks/useI18n.ts": "src/chat/i18n/strings.ts",
    "src/chat/i18n/en.json": "src/chat/i18n/strings.ts",
    "src/chat/i18n/ko.json": "src/chat/i18n/strings.ts",
    "src/chat/mentions/MentionProvider.ts": "src/chat/components/MentionTrigger.tsx",
    "src/chat/components/TimelineRow.tsx": "src/chat/components/TimelineGroup.tsx",
    "src/chat/components/QueueIndicator.tsx": "src/chat/components/MessageQueueUI.tsx",
    "src/chat/components/ToolPanel.tsx": "src/chat/components/ModeBadge.tsx",
    "src/browser/DesignModeOverlay.tsx": "src/browser/DesignModePanel.tsx",
    "src/skills/PinnedSkillsUI.tsx": "src/skills/SkillRegistry.ts",
    "src/secrets/SecretsVault.tsx": "src/settings/tabs/SecretsTab.tsx",
    "src/chat/hooks/useVirtualList.ts": "src/chat/components/VirtualList.tsx",
    "src/chat/StreamingMarkdown.tsx (전면 재작성: 노드 타입 8종, 증분 파싱, 상태 머신)": "src/chat/StreamingMarkdown.tsx",
    "tests/e2e/c3-stop-handling.spec.ts": "tests/e2e/c3-multi-turn.spec.ts",
    "tests/e2e/c3-message-queue.spec.ts": "tests/e2e/c3-message-queue.spec.ts",
    "tests/e2e/c3-doom-loop.spec.ts": "tests/e2e/c3-multi-turn.spec.ts",
    "tests/e2e/c3-compaction.spec.ts": "tests/e2e/c3-multi-turn.spec.ts",
    "src/loop/AskLoopController.ts": "src/loop/AgentLoopController.ts",
    "src/loop/PlanLoopController.ts": "src/plan/PlanModeController.ts",
    "src/loop/DebugLoopController.ts": "src/debug/DebugModeController.ts",
    "src/loop/LoopFactory.ts": "src/loop/AgentLoopController.ts",
    "tests/unit/patches/matcher.test.ts": "src/patches/merger.ts",
    "tests/unit/checkpoint/SnapshotStore.test.ts": "src/checkpoint/CheckpointManager.ts",
    "tests/unit/checkpoint/Restore.test.ts": "src/checkpoint/CheckpointManager.ts",
    "tests/unit/compaction/ProtectionZones.test.ts": "src/compaction/CompactionEngine.ts",
    "tests/e2e/c2-auto-lint.spec.ts": "src/hooks/injectVerificationError.ts",
    "tests/e2e/c2-staleness.spec.ts": "src/patches/staleness.ts",
    "tests/e2e/c2-multi-file.spec.ts": "src/verification/TestRunner.ts",
    "bench/stream-generator.ts": "tests/bench/rendering.bench.ts",
    "tests/e2e/fixtures/mock-provider-server.ts": "tests/e2e/c0-provider-setup.spec.ts",
    "verifications.json": "src/review/CheckboxSync.ts",
}


def expand_directory_placeholder(norm: str) -> list[str]:
    """If files[] names a directory, list concrete files under it."""
    full = REPO_ROOT / norm.rstrip("/")
    if not full.is_dir():
        return []
    files: list[str] = []
    for p in sorted(full.rglob("*")):
        if p.is_file() and "node_modules" not in p.parts:
            files.append(p.relative_to(REPO_ROOT).as_posix())
    return files[:8]  # cap noise


def normalize_claim(raw: str) -> str:
    """Strip human annotations from files[] strings."""
    s = raw.strip()
    if " (" in s:
        s = s.split(" (", 1)[0].strip()
    # path: description (Composer.tsx: Alt+Enter ...)
    if s.startswith("src/") and ": " in s:
        head, _tail = s.split(": ", 1)
        if "/" in head or head.endswith((".ts", ".tsx", ".js", ".json", ".css", ".md")):
            s = head.strip()
    return s.replace("\\", "/")


def pick_from_note(note: str) -> str | None:
    """First backtick path in audit note that exists on disk."""
    for match in re.finditer(r"`([^`]+)`", note):
        candidate = match.group(1).replace("\\", "/")
        if (REPO_ROOT / candidate).is_file():
            return candidate
    return None


def resolve_missing(norm: str, doc: dict) -> tuple[str | None, str]:
    """Return (replacement_path, reason) for a missing normalized path."""
    if (REPO_ROOT / norm).is_file():
        return norm, "already_exists"

    if norm in EXPLICIT_REMAP:
        target = EXPLICIT_REMAP[norm]
        if (REPO_ROOT / target).is_file():
            return target, f"explicit_map→{target}"

    entry = classify_missing(norm, doc)
    if entry.classification == "A":
        from_note = pick_from_note(entry.note)
        if from_note:
            return from_note, f"class_A:{entry.note[:80]}"

    impl = doc.get("implementationNotes") or {}
    if isinstance(impl, dict):
        for fm in impl.get("filesModified") or []:
            rel = str(fm).replace("\\", "/")
            if (REPO_ROOT / rel).is_file() and rel != norm:
                return rel, "filesModified"

    return None, f"unresolved({entry.classification}:{entry.note[:60]})"


@dataclass
class FileFixResult:
    task_id: str
    changed: bool = False
    replacements: list[tuple[str, str, str]] = field(default_factory=list)
    unresolved: list[str] = field(default_factory=list)
    final_files: list[str] = field(default_factory=list)


def fix_files_array(doc: dict) -> FileFixResult:
    task_id = doc.get("id", "?")
    raw_files = doc.get("files")
    if not isinstance(raw_files, list):
        return FileFixResult(task_id=task_id)

    out: list[str] = []
    seen: set[str] = set()
    result = FileFixResult(task_id=task_id)

    for raw in raw_files:
        if not raw:
            continue
        norm = normalize_claim(str(raw))
        na, _ = is_intentional_na(norm)
        dir_expanded = expand_directory_placeholder(norm)
        if dir_expanded:
            for dp in dir_expanded:
                if dp not in seen:
                    seen.add(dp)
                    out.append(dp)
            result.changed = True
            continue
        if na and not (REPO_ROOT / norm).exists():
            # Keep intentional N/A paths as-is (dirs, globs handled elsewhere)
            if norm not in seen:
                seen.add(norm)
                out.append(norm)
            continue

        if (REPO_ROOT / norm).is_file():
            if norm not in seen:
                seen.add(norm)
                out.append(norm)
            continue

        replacement, reason = resolve_missing(norm, doc)
        if replacement and replacement not in seen:
            seen.add(replacement)
            out.append(replacement)
            result.replacements.append((norm, replacement, reason))
            result.changed = True
        elif replacement is None:
            entry = classify_missing(norm, doc)
            if entry.classification == "B":
                # Class B: keep claim for rework tracking; not a path-fix target
                if norm not in seen:
                    seen.add(norm)
                    out.append(norm)
            else:
                result.unresolved.append(norm)

    result.final_files = out
    if out != [normalize_claim(str(x)) for x in raw_files if x]:
        result.changed = True
    return result


def apply_to_doc(doc: dict, result: FileFixResult) -> None:
    doc["files"] = result.final_files
    notes = doc.setdefault("implementationNotes", {})
    if not isinstance(notes, dict):
        return
    path_fix = notes.setdefault("pathFixAudit", [])
    for old, new, reason in result.replacements:
        path_fix.append({"from": old, "to": new, "reason": reason})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write patched JSON to DONE_TASKS")
    parser.add_argument("--list-unresolved", action="store_true")
    args = parser.parse_args()

    touched = 0
    all_results: list[FileFixResult] = []

    for json_path in sorted(DONE_ROOT.glob("**/*.json")):
        doc = json.loads(json_path.read_text(encoding="utf-8"))
        result = fix_files_array(doc)
        if result.changed or result.unresolved:
            all_results.append(result)
        if args.list_unresolved and result.unresolved:
            print(f"{result.task_id}: {result.unresolved}")
        if result.changed and args.apply:
            apply_to_doc(doc, result)
            json_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            touched += 1

    class_a_unresolved = [r for r in all_results if r.unresolved]
    print(f"tasks_with_fixes_or_gaps={len(all_results)} json_written={touched}")
    print(f"tasks_with_unresolved_paths={len(class_a_unresolved)}")
    for r in all_results[:20]:
        if r.replacements:
            print(f"  {r.task_id}: {len(r.replacements)} remap(s)")
    if len(all_results) > 20:
        print(f"  ... and {len(all_results) - 20} more")

    return 0 if not class_a_unresolved else 0  # exit 0; parent reviews unresolved list


if __name__ == "__main__":
    sys.exit(main())
