/**
 * HOST-015 — Host-side git worktree manager (node only; no vscode).
 * Temporary home until packages/worktree owns the richer porcelain API (WT-*).
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type WorktreeStatus = 'created' | 'dirty' | 'clean' | 'removed';

export type AgentWorktree = {
  id: string;
  root: string;
  path: string;
  branch: string;
  base: string;
  status: WorktreeStatus;
  createdAt: number;
};

type GitResult = { stdout: string; stderr: string };

async function git(cwd: string, args: string[]): Promise<GitResult> {
  return execFileAsync('git', args, {
    cwd,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function safeId(value: string): string {
  const id = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  if (!id) throw new Error('worktree id is required');
  return id.slice(0, 80);
}

function worktreePath(root: string, id: string): string {
  return path.join(root, '.agent-k', 'worktrees', safeId(id));
}

export class WorktreeManager {
  constructor(private readonly root: string) {}

  private async ensureRepository(): Promise<void> {
    try {
      await git(this.root, ['rev-parse', '--show-toplevel']);
    } catch {
      throw new Error(`Not a git repository: ${this.root}`);
    }
  }

  async create(input: {
    id: string;
    base?: string;
    branch?: string;
  }): Promise<AgentWorktree> {
    await this.ensureRepository();
    const id = safeId(input.id);
    const base = String(input.base || 'HEAD').trim() || 'HEAD';
    const branch = String(input.branch || `agent-k/${id}`).trim();
    if (!/^[-A-Za-z0-9._/]+$/.test(branch)) {
      throw new Error(`Invalid worktree branch: ${branch}`);
    }

    const target = worktreePath(this.root, id);
    await fs.mkdir(path.dirname(target), { recursive: true });

    try {
      await git(this.root, ['worktree', 'add', '-b', branch, target, base]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create worktree '${id}': ${message}`);
    }

    return {
      id,
      root: this.root,
      path: target,
      branch,
      base,
      status: 'clean',
      createdAt: Date.now(),
    };
  }

  async status(worktree: AgentWorktree): Promise<AgentWorktree> {
    const result = await git(worktree.path, ['status', '--porcelain']);
    return {
      ...worktree,
      status: result.stdout.trim() ? 'dirty' : 'clean',
    };
  }

  async diff(worktree: AgentWorktree): Promise<string> {
    const result = await git(worktree.path, ['diff', '--no-ext-diff']);
    return result.stdout;
  }

  async remove(worktree: AgentWorktree, force = false): Promise<void> {
    await this.ensureRepository();
    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push(worktree.path);
    await git(this.root, args);
  }

  async prune(): Promise<void> {
    await this.ensureRepository();
    await git(this.root, ['worktree', 'prune']);
  }
}

export function createWorktreeManager(root: string): WorktreeManager {
  return new WorktreeManager(path.resolve(root));
}
