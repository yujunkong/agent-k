/**
 * WT-009 — `git apply --check` validation (+ optional apply) for unified diffs.
 * R-003: validate before mutating parent checkout. Cross-platform execFile.
 */
import { runGit } from './gitExec';

export type GitPatchCheckResult =
  | { ok: true }
  | { ok: false; error: string };

/** Dry-run apply against repoRoot. Empty patch is ok. */
export function checkGitPatch(repoRoot: string, patch: string): GitPatchCheckResult {
  if (!patch.trim()) return { ok: true };
  try {
    runGit(['apply', '--check', '--binary', '-'], { cwd: repoRoot, input: patch });
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: detail };
  }
}

/** Apply unified patch to repoRoot (caller owns rollback). */
export function applyGitPatch(repoRoot: string, patch: string): void {
  if (!patch.trim()) return;
  runGit(['apply', '--binary', '-'], { cwd: repoRoot, input: patch });
}

export function reverseGitPatch(repoRoot: string, patch: string): void {
  if (!patch.trim()) return;
  runGit(['apply', '--binary', '--reverse', '-'], { cwd: repoRoot, input: patch });
}
