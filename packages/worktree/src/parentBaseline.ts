/**
 * V31-SUB-01 — Parent baseline transfer (ISSUE-11).
 *
 * A subagent worktree is created from a committed base (`HEAD`). Without this
 * step the subagent cannot see the parent's *uncommitted* work, so it reviews
 * and edits a stale tree. This module copies the parent's working state into
 * the fresh worktree:
 *   1. tracked modifications (staged + unstaged) as a patch against HEAD
 *   2. untracked, non-ignored files (excluding `.agentk/`)
 *
 * It is opt-in so the default worktree isolation contract is unchanged.
 * No vscode import — pure git/fs with explicit IO.
 */
import * as fs from 'fs';
import * as path from 'path';
import { pathIsInside, tryGit } from './gitExec';

export interface ParentBaselineOptions {
  /** Refuse to touch paths outside these prefixes (defaults to repo root). */
  excludePrefixes?: string[];
}

export interface ParentBaselineResult {
  /** Flags describing what was carried over (for logging / UI warning). */
  applied: string[];
  warnings: string[];
}

const DEFAULT_EXCLUDES = ['.agentk/'];
const MAX_PATCH_BYTES = 4 * 1024 * 1024;

function isExcluded(relative: string, excludes: string[]): boolean {
  const normalized = relative.replace(/\\/g, '/');
  return excludes.some(
    (prefix) => normalized === prefix.replace(/\/$/, '') || normalized.startsWith(prefix),
  );
}

/**
 * Build the parent tracked-change patch (staged + unstaged) against HEAD.
 * Returns '' when the parent has no tracked modifications, and null when git
 * fails (not a repo, no HEAD).
 */
export function parentTrackedPatch(repoRoot: string, excludes: string[]): string | null {
  const spec = ['diff', 'HEAD', '--', '.', ...excludes.map((p) => `:(exclude)${p}`)];
  return tryGit(spec, { cwd: repoRoot, maxBuffer: MAX_PATCH_BYTES });
}

/** Parent untracked, non-ignored files (relative paths, `/` separated). */
export function parentUntrackedFiles(repoRoot: string, excludes: string[]): string[] {
  const output = tryGit(['ls-files', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    maxBuffer: MAX_PATCH_BYTES,
  });
  if (output === null) return [];
  return output
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((relative) => !isExcluded(relative, excludes));
}

/** Apply a unified patch inside the worktree. Returns true on success. */
export function applyPatchInWorktree(worktreePath: string, patch: string): boolean {
  if (!patch.trim()) return true;
  const applied = tryGit(['apply', '--whitespace=nowarn', '-'], {
    cwd: worktreePath,
    input: patch,
  });
  return applied !== null;
}

/** Copy one untracked parent file into the worktree (confined to worktree). */
function copyUntracked(
  repoRoot: string,
  worktreePath: string,
  relative: string,
): boolean {
  const source = path.resolve(repoRoot, relative);
  const target = path.resolve(worktreePath, relative);
  if (!pathIsInside(repoRoot, source) || !pathIsInside(worktreePath, target)) {
    return false;
  }
  if (!fs.existsSync(source) || fs.existsSync(target)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

/**
 * Carry the parent's uncommitted changes into a freshly created subagent
 * worktree. Never throws: failures surface as `warnings` so the run continues
 * and the UI can tell the user the subagent may not see local edits.
 */
export function applyParentBaseline(
  repoRoot: string,
  worktreePath: string,
  options: ParentBaselineOptions = {},
): ParentBaselineResult {
  const excludes = [...DEFAULT_EXCLUDES, ...(options.excludePrefixes ?? [])];
  const applied: string[] = [];
  const warnings: string[] = [];

  const patch = parentTrackedPatch(repoRoot, excludes);
  if (patch === null) {
    warnings.push('Parent baseline: could not read tracked changes from git.');
  } else if (patch.trim()) {
    if (applyPatchInWorktree(worktreePath, patch)) {
      applied.push('tracked');
    } else {
      warnings.push(
        'Parent baseline: tracked changes could not be applied to the subagent worktree.',
      );
    }
  }

  const untracked = parentUntrackedFiles(repoRoot, excludes);
  let copied = 0;
  for (const relative of untracked) {
    if (copyUntracked(repoRoot, worktreePath, relative)) copied += 1;
  }
  if (copied > 0) {
    applied.push(`untracked:${copied}`);
  } else if (untracked.length > 0) {
    warnings.push(
      'Parent baseline: some untracked files were skipped (already present or unsafe).',
    );
  }

  return { applied, warnings };
}
