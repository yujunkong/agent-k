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
  createdAt: number;
  active: boolean;
}

const WORKTREE_BASE = '.agentk/worktrees';

export class WorktreeManager {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
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
   * List all worktrees
   */
  list(): WorktreeInfo[] {
    try {
      const output = execSync('git worktree list', { cwd: this.repoRoot, stdio: 'pipe' }).toString();
      const lines = output.trim().split('\n').filter(Boolean);

      return lines.map(line => {
        const parts = line.split(/\s+/);
        return {
          path: parts[0],
          branch: (parts[1] || '').replace(/^\(|\)$/g, ''),
          hash: parts[2] || '',
          createdAt: Date.now(),
          active: true
        };
      });
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
}
