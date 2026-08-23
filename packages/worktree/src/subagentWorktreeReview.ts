/**
 * WT-012 / WT-009 / WT-010 / WT-011 / WT-014(reject) — subagent worktree review & apply.
 * Ported from v2.1 `src/agent/subagentWorktreeReview.ts` (R-003 rollback on partial failure).
 */
import { WorktreeManager } from './WorktreeManager';
import type { SubagentWorktree, SubagentWorktreeSnapshot } from './subagentWorktree';
import { assertIsolatedWorktree, captureWorktreeSnapshot } from './isolation';
import { assertManagedWorktree } from './pathValidation';
import { applyGitPatch, checkGitPatch, reverseGitPatch } from './gitPatch';
import { runGit, tryGit } from './gitExec';
import {
  copyUntrackedFiles,
  preflightUntrackedTransfer,
  rollbackCreatedFiles,
} from './untrackedTransfer';

export type WorktreeReview = {
  worktree: SubagentWorktree;
  snapshot: SubagentWorktreeSnapshot;
  diff: string;
  untrackedFiles: string[];
};

export type WorktreeApplyResult = {
  applied: boolean;
  removed: boolean;
  filesChanged: number;
  error?: string;
};

function listUntrackedFiles(worktreePath: string): string[] {
  const out = tryGit(['ls-files', '--others', '--exclude-standard'], { cwd: worktreePath });
  if (out === null) return [];
  return out
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/** WT-012 — review never mutates parent or worktree. */
export function reviewSubagentWorktree(
  repoRoot: string,
  worktree: SubagentWorktree,
  manager = new WorktreeManager(repoRoot)
): WorktreeReview {
  assertIsolatedWorktree(repoRoot, worktree, manager);
  const snapshot = captureWorktreeSnapshot(manager, worktree);
  return {
    worktree,
    snapshot,
    diff: manager.diff(worktree.path),
    untrackedFiles: listUntrackedFiles(worktree.path),
  };
}

/**
 * WT-010 apply with R-003: parent clean → check patch → untracked preflight →
 * apply → copy → verify → remove worktree; rollback on failure.
 */
export async function applySubagentWorktree(
  repoRoot: string,
  worktree: SubagentWorktree,
  manager = new WorktreeManager(repoRoot)
): Promise<WorktreeApplyResult> {
  try {
    assertIsolatedWorktree(repoRoot, worktree, manager);
  } catch (error) {
    return {
      applied: false,
      removed: false,
      filesChanged: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const parentStatus = runGit(['status', '--porcelain'], { cwd: repoRoot }).trim();
  if (parentStatus) {
    return {
      applied: false,
      removed: false,
      filesChanged: 0,
      error: 'Apply blocked: current workspace has uncommitted changes',
    };
  }

  const review = reviewSubagentWorktree(repoRoot, worktree, manager);
  const trackedPatch = review.diff;

  const check = checkGitPatch(repoRoot, trackedPatch);
  if (!check.ok) {
    return {
      applied: false,
      removed: false,
      filesChanged: 0,
      error: `Apply conflict: ${check.error}`,
    };
  }

  const preflight = preflightUntrackedTransfer(
    worktree.path,
    repoRoot,
    review.untrackedFiles
  );
  if (!preflight.ok) {
    return { applied: false, removed: false, filesChanged: 0, error: preflight.error };
  }

  const createdFiles: string[] = [];
  let patchApplied = false;

  try {
    if (trackedPatch.trim()) {
      applyGitPatch(repoRoot, trackedPatch);
      patchApplied = true;
    }

    createdFiles.push(
      ...copyUntrackedFiles(worktree.path, repoRoot, review.untrackedFiles)
    );

    const finalStatus = runGit(['status', '--porcelain'], { cwd: repoRoot }).trim();
    if (!finalStatus) {
      return { applied: true, removed: false, filesChanged: 0 };
    }

    await manager.remove(worktree.path);
    return {
      applied: true,
      removed: true,
      filesChanged: review.snapshot.filesChanged + review.untrackedFiles.length,
    };
  } catch (error) {
    rollbackCreatedFiles(createdFiles);
    if (patchApplied && trackedPatch.trim()) {
      try {
        reverseGitPatch(repoRoot, trackedPatch);
      } catch {
        /* best-effort rollback */
      }
    }

    return {
      applied: false,
      removed: false,
      filesChanged: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** WT-014 reject — drop worktree (+ owned subagent/* branch). */
export async function rejectSubagentWorktree(
  repoRoot: string,
  worktree: SubagentWorktree,
  manager = new WorktreeManager(repoRoot)
): Promise<void> {
  assertManagedWorktree(repoRoot, worktree.path);
  if (!manager.exists(worktree.path)) return;
  await manager.remove(worktree.path);

  if (worktree.branch.startsWith('subagent/')) {
    try {
      runGit(['branch', '-D', worktree.branch], { cwd: repoRoot });
    } catch {
      /* idempotent */
    }
  }
}
