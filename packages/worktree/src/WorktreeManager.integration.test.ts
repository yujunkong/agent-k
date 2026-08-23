/**
 * WT-001/002/010 smoke — real git in os.tmpdir (create → edit → review → apply → cleanup).
 * Uses execFile argv only (no shell) for Windows/macOS/Linux.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorktreeManager } from './WorktreeManager';
import { bindWorktreeManager } from './subagentWorktree';
import {
  applySubagentWorktree,
  rejectSubagentWorktree,
  reviewSubagentWorktree,
} from './subagentWorktreeReview';
import { tryGit, runGit, worktreeDirFromBranch } from './gitExec';

function hasGit(): boolean {
  return tryGit(['--version'], { cwd: os.tmpdir() }) !== null;
}

const describeGit = hasGit() ? describe : describe.skip;

function initRepo(root: string): void {
  runGit(['init'], { cwd: root });
  runGit(['config', 'user.email', 'wt@test'], { cwd: root });
  runGit(['config', 'user.name', 'wt'], { cwd: root });
  // Avoid depending on init.defaultBranch (main vs master).
  runGit(['checkout', '-b', 'main'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitignore'), '.agentk/\n');
}

describeGit('WorktreeManager git smoke (WT-001…010)', () => {
  let root = '';

  afterEach(async () => {
    if (!root || !fs.existsSync(root)) return;
    const mgr = new WorktreeManager(root);
    try {
      await mgr.removeAll();
    } catch {
      /* ignore */
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('create isolated worktree, review diff, apply into clean parent, remove', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-k-wt-'));
    initRepo(root);
    fs.writeFileSync(path.join(root, 'README.md'), 'base\n');
    runGit(['add', '-A'], { cwd: root });
    runGit(['commit', '-m', 'init'], { cwd: root });

    const manager = new WorktreeManager(root);
    const bindings = bindWorktreeManager(manager, root);
    const wt = await bindings.create('smoke1');

    expect(wt.path.includes(path.join('.agentk', 'worktrees'))).toBe(true);
    expect(path.basename(wt.path)).toBe(worktreeDirFromBranch('subagent/smoke1'));
    expect(manager.exists(wt.path)).toBe(true);

    fs.writeFileSync(path.join(wt.path, 'README.md'), 'base\nfrom-worktree\n');
    fs.writeFileSync(path.join(wt.path, 'new-untracked.txt'), 'u\n');

    const review = reviewSubagentWorktree(root, wt, manager);
    expect(review.diff.length).toBeGreaterThan(0);
    expect(review.untrackedFiles).toContain('new-untracked.txt');

    const result = await applySubagentWorktree(root, wt, manager);
    expect(result.error).toBeUndefined();
    expect(result.applied).toBe(true);
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf-8')).toContain('from-worktree');
    expect(fs.existsSync(path.join(root, 'new-untracked.txt'))).toBe(true);
    expect(manager.exists(wt.path)).toBe(false);
  });

  it('reject removes worktree without touching parent files', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-k-wt-rej-'));
    initRepo(root);
    fs.writeFileSync(path.join(root, 'keep.md'), 'keep\n');
    runGit(['add', '-A'], { cwd: root });
    runGit(['commit', '-m', 'init'], { cwd: root });

    const manager = new WorktreeManager(root);
    const bindings = bindWorktreeManager(manager, root);
    const wt = await bindings.create('rej1');
    fs.writeFileSync(path.join(wt.path, 'keep.md'), 'changed\n');

    await rejectSubagentWorktree(root, wt, manager);
    expect(manager.exists(wt.path)).toBe(false);
    expect(fs.readFileSync(path.join(root, 'keep.md'), 'utf-8')).toBe('keep\n');
  });
});
