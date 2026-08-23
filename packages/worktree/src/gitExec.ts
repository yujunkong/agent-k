/**
 * Cross-platform git invocation — always execFile (no shell).
 * Avoids cmd.exe quoting / POSIX redirects on Windows.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type GitRunOptions = {
  cwd: string;
  input?: string | Buffer;
  maxBuffer?: number;
};

/** Run `git <args>` with argv array (Windows/macOS/Linux safe). */
export function runGit(args: string[], options: GitRunOptions): string {
  const { cwd, input, maxBuffer = 8 * 1024 * 1024 } = options;
  return execFileSync('git', args, {
    cwd,
    input,
    stdio: input !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    maxBuffer,
    encoding: 'utf-8',
    windowsHide: true,
  }).toString();
}

/** Same as runGit but returns null on failure instead of throwing. */
export function tryGit(args: string[], options: GitRunOptions): string | null {
  try {
    return runGit(args, options);
  } catch {
    return null;
  }
}

/**
 * Canonical path for equality checks across platforms:
 * - realpath existing ancestors (macOS /var → /private/var even if leaf missing)
 * - normalize + resolve
 * - case-insensitive on win32
 */
export function canonicalPath(p: string): string {
  const absolute = path.resolve(p);
  let resolved = absolute;
  try {
    resolved = fs.realpathSync(absolute);
  } catch {
    // Walk up until an existing path can be realpath'd (untracked targets, etc.).
    let cur = absolute;
    let suffix: string[] = [];
    while (true) {
      const parent = path.dirname(cur);
      if (parent === cur) break;
      suffix.unshift(path.basename(cur));
      try {
        resolved = path.join(fs.realpathSync(parent), ...suffix);
        break;
      } catch {
        cur = parent;
      }
    }
  }
  resolved = path.normalize(resolved);
  if (process.platform === 'win32') {
    return resolved.toLowerCase();
  }
  return resolved;
}

export function pathsEqual(a: string, b: string): boolean {
  return canonicalPath(a) === canonicalPath(b);
}

/** True if candidate is inside root (or equal), using platform path rules. */
export function pathIsInside(root: string, candidate: string): boolean {
  const rootCanon = canonicalPath(root);
  const candCanon = canonicalPath(candidate);
  if (candCanon === rootCanon) return true;
  const rel = path.relative(rootCanon, candCanon);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Flat worktree directory segment — nested `a/b` → `a__b` (Windows + removeAll safe). */
export function worktreeDirFromBranch(branch: string): string {
  const sanitized = branch.replace(/[^a-zA-Z0-9_\-/]/g, '_');
  return sanitized.replace(/\//g, '__');
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function platformLabel(): string {
  return `${process.platform}/${os.arch()}`;
}
