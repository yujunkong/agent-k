/**
 * WT-001 Worktree manager — managed git worktree lifecycle (C7-T07).
 * Ported from v2.1; git via execFile argv (Windows / macOS / Linux).
 */
import * as path from 'path';
import * as fs from 'fs';
import {
  canonicalPath,
  pathsEqual,
  pathIsInside,
  runGit,
  tryGit,
  worktreeDirFromBranch,
} from './gitExec';

export interface WorktreeInfo {
  path: string;
  branch: string;
  hash: string;
  detached: boolean;
  createdAt: number;
  active: boolean;
}

/** Managed worktrees live under repoRoot/.agentk/worktrees (v2.1 path base). */
export const WORKTREE_BASE = '.agentk/worktrees';

/**
 * Parse `git worktree list --porcelain` into structured entries.
 * Records are blank-line separated: worktree / HEAD / branch|detached.
 */
export function parseWorktreePorcelain(output: string): WorktreeInfo[] {
  const results: WorktreeInfo[] = [];
  // Normalize CRLF before splitting porcelain records.
  const normalized = output.replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n\n+/).filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    let wtPath = '';
    let hash = '';
    let branch = '';
    let detached = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        wtPath = line.slice('worktree '.length);
      } else if (line.startsWith('HEAD ')) {
        hash = line.slice('HEAD '.length);
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length);
        branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
      } else if (line === 'detached') {
        detached = true;
      }
    }

    if (wtPath) {
      results.push({
        path: wtPath,
        branch: branch || (detached ? `(detached at ${hash.slice(0, 7)})` : ''),
        hash,
        detached,
        createdAt: Date.now(),
        active: true,
      });
    }
  }

  return results;
}

export class WorktreeManager {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = path.resolve(repoRoot);
  }

  private git(args: string[], cwd = this.repoRoot, maxBuffer?: number): string {
    return runGit(args, { cwd, maxBuffer });
  }

  /**
   * Ensure repoRoot is a usable git repo with ≥1 commit.
   * Auto-inits scratch workspaces so plan/subagent dispatch is not blocked.
   * Ensures `.agentk/` is in `.git/info/exclude` (no working-tree dirty).
   */
  ensureRepo(): { initialized: boolean; reason?: 'no_git' | 'no_commits' } {
    const isRepo = () =>
      tryGit(['rev-parse', '--is-inside-work-tree'], { cwd: this.repoRoot }) !== null;
    const hasCommit = () => tryGit(['rev-parse', 'HEAD'], { cwd: this.repoRoot }) !== null;

    const ensureAgentkExclude = () => {
      const exclude = path.join(this.repoRoot, '.git', 'info', 'exclude');
      const marker = '.agentk/';
      try {
        fs.mkdirSync(path.dirname(exclude), { recursive: true });
        let body = '';
        try {
          body = fs.readFileSync(exclude, 'utf-8');
        } catch {
          body = '';
        }
        if (body.split(/\r?\n/).some((l) => l.trim() === marker || l.trim() === '.agentk')) {
          return;
        }
        const next =
          body.length && !body.endsWith('\n') ? `${body}\n${marker}\n` : `${body}${marker}\n`;
        fs.writeFileSync(exclude, next, 'utf-8');
      } catch {
        /* non-fatal */
      }
    };

    if (!isRepo()) {
      this.git(['init']);
      // Default branch name varies (master/main); leave git default.
      ensureAgentkExclude();
      try {
        this.git(['add', '-A']);
      } catch {
        /* nothing to stage */
      }
      this.git(['commit', '--allow-empty', '-m', 'agent-k: auto-initialized repository']);
      return { initialized: true, reason: 'no_git' };
    }

    ensureAgentkExclude();

    if (!hasCommit()) {
      try {
        this.git(['add', '-A']);
      } catch {
        /* nothing to stage */
      }
      this.git(['commit', '--allow-empty', '-m', 'agent-k: auto-initialized repository']);
      return { initialized: true, reason: 'no_commits' };
    }

    return { initialized: false };
  }

  /** Create a new worktree checkout for the given branch name. */
  async create(branchName: string, baseCommit?: string): Promise<WorktreeInfo> {
    this.ensureRepo();
    const branch = branchName.replace(/[^a-zA-Z0-9_\-/]/g, '_');
    const dirName = worktreeDirFromBranch(branch);
    const worktreePath = path.join(this.repoRoot, WORKTREE_BASE, dirName);
    const base = (baseCommit || 'HEAD').trim() || 'HEAD';

    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

    try {
      this.git(['branch', '-f', branch, base]);
    } catch {
      /* branch may exist */
    }

    this.git(['worktree', 'add', worktreePath, branch]);

    const hash = this.git(['rev-parse', 'HEAD'], worktreePath).trim();

    return {
      path: worktreePath,
      branch,
      hash,
      detached: false,
      createdAt: Date.now(),
      active: true,
    };
  }

  /** List all worktrees via --porcelain. */
  list(): WorktreeInfo[] {
    const output = tryGit(['worktree', 'list', '--porcelain'], { cwd: this.repoRoot });
    if (output === null) return [];
    return parseWorktreePorcelain(output);
  }

  /** Managed worktrees only (under .agentk/worktrees). */
  listManaged(): WorktreeInfo[] {
    const base = path.join(this.repoRoot, WORKTREE_BASE);
    return this.list().filter((w) => pathIsInside(base, w.path));
  }

  async remove(worktreePath: string): Promise<void> {
    try {
      this.git(['worktree', 'remove', worktreePath, '--force']);
    } catch {
      /* fall through to fs cleanup */
    }

    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  /** Remove all agent-managed worktrees (from porcelain list, not shallow readdir). */
  async removeAll(): Promise<void> {
    for (const wt of this.listManaged()) {
      try {
        await this.remove(wt.path);
      } catch {
        /* skip */
      }
    }
  }

  exists(worktreePath: string): boolean {
    return this.list().some((w) => pathsEqual(w.path, worktreePath));
  }

  /** Porcelain status of a worktree checkout (changed files only). */
  status(worktreePath: string): { dirty: boolean; files: string[] } {
    const output = tryGit(['status', '--porcelain'], { cwd: worktreePath });
    if (output === null) return { dirty: false, files: [] };
    const files = output
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.slice(3).trim().replace(/ -> .*$/, ''))
      .filter(Boolean);
    return { dirty: files.length > 0, files };
  }

  /** Diff against HEAD for a worktree checkout. */
  diff(worktreePath: string): string {
    return (
      tryGit(['diff', 'HEAD'], {
        cwd: worktreePath,
        maxBuffer: 2 * 1024 * 1024,
      }) ?? ''
    );
  }

  prune(): void {
    tryGit(['worktree', 'prune'], { cwd: this.repoRoot });
  }

  /**
   * Startup reconcile: prune + drop managed worktrees not in preserveIds.
   * preserveIds = flat dir names under WORKTREE_BASE (see worktreeDirFromBranch).
   */
  reconcile(preserveIds?: Set<string>): { pruned: string[]; kept: string[] } {
    this.prune();
    const pruned: string[] = [];
    const kept: string[] = [];

    for (const wt of this.listManaged()) {
      const id = path.basename(wt.path);
      if (preserveIds?.has(id)) {
        kept.push(wt.path);
        continue;
      }
      try {
        // sync remove path used by reconcile
        try {
          this.git(['worktree', 'remove', wt.path, '--force']);
        } catch {
          /* ignore */
        }
        if (fs.existsSync(wt.path)) {
          try {
            fs.rmSync(wt.path, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
        pruned.push(wt.path);
      } catch {
        pruned.push(wt.path);
      }
    }

    return { pruned, kept };
  }
}

/** @deprecated use pathsEqual — kept for callers expecting realpath compare */
export { canonicalPath, pathsEqual };
