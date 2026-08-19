/**
 * WorktreeManager — git worktree 생성/삭제/리스트 (C7-T07)
 */
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface WorktreeInfo {
  path: string;
  branch: string;
  hash: string;
  detached: boolean;
  createdAt: number;
  active: boolean;
}

const WORKTREE_BASE = '.agentk/worktrees';

/**
 * Parse `git worktree list --porcelain` output into structured entries.
 * Records are separated by blank lines. Each record has:
 *   worktree <path>
 *   HEAD <sha>
 *   branch refs/heads/<name>  OR  detached
 */
export function parseWorktreePorcelain(output: string): WorktreeInfo[] {
  const results: WorktreeInfo[] = [];
  const blocks = output.split(/\n\n+/).filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
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
        active: true
      });
    }
  }

  return results;
}

export class WorktreeManager {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Ensure repoRoot is a usable git repository with at least one commit.
   * Auto-initializes when missing so scratch/first-run workspaces don't
   * block plan execution on a manual `git init`. Idempotent — safe to call
   * before every subagent dispatch.
   */
  ensureRepo(): { initialized: boolean; reason?: 'no_git' | 'no_commits' } {
    const isRepo = () => {
      try {
        execSync('git rev-parse --is-inside-work-tree', {
          cwd: this.repoRoot, stdio: 'pipe'
        });
        return true;
      } catch {
        return false;
      }
    };
    const hasCommit = () => {
      try {
        execSync('git rev-parse HEAD', { cwd: this.repoRoot, stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    };

    if (!isRepo()) {
      execSync('git init', { cwd: this.repoRoot, stdio: 'pipe' });
      try {
        execSync('git add -A', { cwd: this.repoRoot, stdio: 'pipe' });
      } catch { /* nothing to stage */ }
      execSync('git commit --allow-empty -m "agent-k: auto-initialized repository"', {
        cwd: this.repoRoot, stdio: 'pipe'
      });
      return { initialized: true, reason: 'no_git' };
    }

    if (!hasCommit()) {
      try {
        execSync('git add -A', { cwd: this.repoRoot, stdio: 'pipe' });
      } catch { /* nothing to stage */ }
      execSync('git commit --allow-empty -m "agent-k: auto-initialized repository"', {
        cwd: this.repoRoot, stdio: 'pipe'
      });
      return { initialized: true, reason: 'no_commits' };
    }

    return { initialized: false };
  }

  /**
   * Create a new worktree at the given branch
   */
  async create(branchName: string, baseCommit?: string): Promise<WorktreeInfo> {
    const sanitized = branchName.replace(/[^a-zA-Z0-9_\-/]/g, '_');
    const worktreePath = path.join(this.repoRoot, WORKTREE_BASE, sanitized);

    // Ensure directory exists
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

    // Create branch if needed
    try {
      execSync(`git branch -f ${sanitized} ${baseCommit || 'HEAD'} 2>/dev/null`, {
        cwd: this.repoRoot, stdio: 'pipe'
      });
    } catch { /* branch may exist */ }

    // Create worktree
    execSync(`git worktree add ${worktreePath} ${sanitized} 2>/dev/null`, {
      cwd: this.repoRoot, stdio: 'pipe'
    });

    const info: WorktreeInfo = {
      path: worktreePath,
      branch: sanitized,
      hash: execSync(`git rev-parse HEAD`, { cwd: worktreePath, stdio: 'pipe' }).toString().trim(),
      createdAt: Date.now(),
      active: true
    };

    return info;
  }

  /**
   * List all worktrees via --porcelain for reliable parsing.
   */
  list(): WorktreeInfo[] {
    try {
      const output = execSync('git worktree list --porcelain', { cwd: this.repoRoot, stdio: 'pipe' }).toString();
      return parseWorktreePorcelain(output);
    } catch {
      return [];
    }
  }

  /**
   * Remove a worktree
   */
  async remove(worktreePath: string): Promise<void> {
    execSync(`git worktree remove ${worktreePath} --force 2>/dev/null`, {
      cwd: this.repoRoot, stdio: 'pipe'
    });

    // Clean up directory if remains
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  /**
   * Remove all agent-managed worktrees
   */
  async removeAll(): Promise<void> {
    const base = path.join(this.repoRoot, WORKTREE_BASE);
    if (!fs.existsSync(base)) return;

    const dirs = fs.readdirSync(base);
    for (const dir of dirs) {
      const fullPath = path.join(base, dir);
      try {
        await this.remove(fullPath);
      } catch { /* skip */ }
    }
  }

  /**
   * Check if a worktree exists
   */
  exists(worktreePath: string): boolean {
    const list = this.list();
    return list.some(w => w.path === worktreePath);
  }

  /**
   * Porcelain status of a worktree checkout (changed files only).
   */
  status(worktreePath: string): { dirty: boolean; files: string[] } {
    try {
      const output = execSync('git status --porcelain', {
        cwd: worktreePath,
        stdio: 'pipe'
      }).toString();
      const files = output
        .split('\n')
        .map((line) => line.slice(3).trim().replace(/ -> .*$/, ''))
        .filter(Boolean);
      return { dirty: files.length > 0, files };
    } catch {
      return { dirty: false, files: [] };
    }
  }

  /**
   * Diff against HEAD for a worktree checkout.
   */
  diff(worktreePath: string): string {
    try {
      return execSync('git diff HEAD', {
        cwd: worktreePath,
        stdio: 'pipe',
        maxBuffer: 2 * 1024 * 1024
      }).toString();
    } catch {
      return '';
    }
  }

  /**
   * Drop stale worktree registrations.
   */
  prune(): void {
    try {
      execSync('git worktree prune', { cwd: this.repoRoot, stdio: 'pipe' });
    } catch {
      /* ignore */
    }
  }

  /**
   * Reconcile agent-managed worktrees on startup.
   * Removes stale worktrees whose directories no longer exist on disk,
   * while preserving worktrees registered for user review.
   */
  reconcile(preserveIds?: Set<string>): { pruned: string[]; kept: string[] } {
    this.prune();
    const base = path.join(this.repoRoot, WORKTREE_BASE);
    const pruned: string[] = [];
    const kept: string[] = [];

    if (!fs.existsSync(base)) return { pruned, kept };

    let dirs: string[];
    try {
      dirs = fs.readdirSync(base);
    } catch {
      return { pruned, kept };
    }

    for (const dir of dirs) {
      const fullPath = path.join(base, dir);
      if (preserveIds?.has(dir)) {
        kept.push(fullPath);
        continue;
      }
      try {
        execSync(`git worktree remove ${fullPath} --force 2>/dev/null`, {
          cwd: this.repoRoot, stdio: 'pipe'
        });
      } catch { /* ignore */ }
      if (fs.existsSync(fullPath)) {
        try { fs.rmSync(fullPath, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      pruned.push(fullPath);
    }

    return { pruned, kept };
  }
}
