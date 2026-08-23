/**
 * WT-011 — untracked file transfer preflight + copy (with path confinement).
 * Relative paths from git use `/`; path.resolve normalizes on Windows.
 */
import * as fs from 'fs';
import * as path from 'path';
import { pathIsInside } from './gitExec';

export type UntrackedTransferError = { ok: false; error: string };
export type UntrackedTransferOk = { ok: true };

function resolveUnder(root: string, relative: string): string {
  const segments = relative.replace(/\\/g, '/').split('/').filter(Boolean);
  return path.resolve(root, ...segments);
}

/** Preflight: sources exist under worktree, targets absent under repoRoot. */
export function preflightUntrackedTransfer(
  worktreePath: string,
  repoRoot: string,
  relativePaths: string[]
): UntrackedTransferOk | UntrackedTransferError {
  for (const relative of relativePaths) {
    const source = resolveUnder(worktreePath, relative);
    const target = resolveUnder(repoRoot, relative);
    if (!pathIsInside(worktreePath, source) || !pathIsInside(repoRoot, target)) {
      return { ok: false, error: `Apply blocked: invalid path ${relative}` };
    }
    if (fs.existsSync(target)) {
      return { ok: false, error: `Apply conflict: ${relative} already exists` };
    }
  }
  return { ok: true };
}

/** Copy untracked files; returns absolute paths created (for rollback). */
export function copyUntrackedFiles(
  worktreePath: string,
  repoRoot: string,
  relativePaths: string[]
): string[] {
  const created: string[] = [];
  for (const relative of relativePaths) {
    const source = resolveUnder(worktreePath, relative);
    const target = resolveUnder(repoRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    created.push(target);
  }
  return created;
}

export function rollbackCreatedFiles(filePaths: string[]): void {
  for (const filePath of filePaths) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* best effort */
    }
  }
}
