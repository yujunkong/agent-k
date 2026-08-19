/**
 * Safe integration boundary for Subagent worktree changes.
 *
 * Review never mutates either checkout. Apply only targets a clean parent
 * workspace and rejects stale/conflicting changes before touching it.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { WorktreeManager } from '../worktree/WorktreeManager';
import type { SubagentWorktree, SubagentWorktreeSnapshot } from './subagentWorktree';

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

function run(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, stdio: 'pipe', maxBuffer: 8 * 1024 * 1024 }).toString();
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertManagedWorktree(repoRoot: string, worktreePath: string): void {
  const base = path.join(repoRoot, '.agentk', 'worktrees');
  if (!isInside(base, worktreePath)) {
    throw new Error('Refused: worktree is outside the Agent-K worktree root');
  }
}

function untrackedFiles(worktreePath: string): string[] {
  try {
    return run(worktreePath, ['ls-files', '--others', '--exclude-standard'])
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function reviewSubagentWorktree(
  repoRoot: string,
  worktree: SubagentWorktree,
  manager = new WorktreeManager(repoRoot)
): WorktreeReview {
  assertManagedWorktree(repoRoot, worktree.path);
  if (!manager.exists(worktree.path)) {
    throw new Error('Subagent worktree no longer exists');
  }

  const status = manager.status(worktree.path);
  return {
    worktree,
    snapshot: { filesChanged: status.files.length, files: status.files },
    diff: manager.diff(worktree.path),
    untrackedFiles: untrackedFiles(worktree.path)
  };
}

export async function applySubagentWorktree(
  repoRoot: string,
  worktree: SubagentWorktree,
  manager = new WorktreeManager(repoRoot)
): Promise<WorktreeApplyResult> {
  assertManagedWorktree(repoRoot, worktree.path);
  if (!manager.exists(worktree.path)) {
    return { applied: false, removed: false, filesChanged: 0, error: 'Subagent worktree no longer exists' };
  }

  const parentStatus = run(repoRoot, ['status', '--porcelain']).trim();
  if (parentStatus) {
    return {
      applied: false,
      removed: false,
      filesChanged: 0,
      error: 'Apply blocked: current workspace has uncommitted changes'
    };
  }

  const review = reviewSubagentWorktree(repoRoot, worktree, manager);
  const trackedPatch = review.diff;

  // Validate the complete tracked patch before changing the parent checkout.
  if (trackedPatch.trim()) {
    try {
      execFileSync('git', ['apply', '--check', '--binary', '-'], {
        cwd: repoRoot,
        input: trackedPatch,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { applied: false, removed: false, filesChanged: 0, error: `Apply conflict: ${detail}` };
    }
  }

  // Untracked files are not part of git diff. Preflight them explicitly.
  for (const relative of review.untrackedFiles) {
    const source = path.resolve(worktree.path, relative);
    const target = path.resolve(repoRoot, relative);
    if (!isInside(worktree.path, source) || !isInside(repoRoot, target)) {
      return { applied: false, removed: false, filesChanged: 0, error: `Apply blocked: invalid path ${relative}` };
    }
    if (fs.existsSync(target)) {
      return { applied: false, removed: false, filesChanged: 0, error: `Apply conflict: ${relative} already exists` };
    }
  }

  const createdFiles: string[] = [];
  let patchApplied = false;

  try {
    if (trackedPatch.trim()) {
      execFileSync('git', ['apply', '--binary', '-'], {
        cwd: repoRoot,
        input: trackedPatch,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      patchApplied = true;
    }

    for (const relative of review.untrackedFiles) {
      const source = path.resolve(worktree.path, relative);
      const target = path.resolve(repoRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      createdFiles.push(target);
    }

    const finalStatus = run(repoRoot, ['status', '--porcelain']).trim();
    if (!finalStatus) {
      return { applied: true, removed: false, filesChanged: 0 };
    }

    await manager.remove(worktree.path);
    return {
      applied: true,
      removed: true,
      filesChanged: review.snapshot.filesChanged + review.untrackedFiles.length
    };
  } catch (error) {
    // Rollback: remove untracked files created during this operation
    for (const filePath of createdFiles) {
      try { fs.unlinkSync(filePath); } catch { /* best effort */ }
    }
    // Rollback: reverse the tracked patch if it was applied
    if (patchApplied && trackedPatch.trim()) {
      try {
        execFileSync('git', ['apply', '--binary', '--reverse', '-'], {
          cwd: repoRoot,
          input: trackedPatch,
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch { /* best-effort rollback */ }
    }

    return {
      applied: false,
      removed: false,
      filesChanged: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function rejectSubagentWorktree(
  repoRoot: string,
  worktree: SubagentWorktree,
  manager = new WorktreeManager(repoRoot)
): Promise<void> {
  assertManagedWorktree(repoRoot, worktree.path);
  if (!manager.exists(worktree.path)) return;
  await manager.remove(worktree.path);

  // Agent-K owns subagent/* branches, so rejection may safely remove the
  // ephemeral branch after the worktree has been detached.
  if (worktree.branch.startsWith('subagent/')) {
    try {
      run(repoRoot, ['branch', '-D', worktree.branch]);
    } catch {
      // Keep rejection idempotent if the branch was already removed.
    }
  }
}
