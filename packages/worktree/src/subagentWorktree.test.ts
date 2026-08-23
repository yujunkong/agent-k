/**
 * WT-002 — bindWorktreeManager create/capture (no SubagentRunner; SUB-* later).
 */
import { describe, expect, it, vi } from 'vitest';
import type { WorktreeInfo, WorktreeManager } from './WorktreeManager';
import { bindWorktreeManager } from './subagentWorktree';

function fakeManager(
  overrides: Partial<WorktreeManager> = {}
): WorktreeManager {
  const info: WorktreeInfo = {
    path: '/repo/.agentk/worktrees/subagent__t1',
    branch: 'subagent/t1',
    hash: 'abc123',
    detached: false,
    createdAt: 1,
    active: true,
  };
  return {
    create: vi.fn(async () => info),
    status: vi.fn(() => ({ dirty: true, files: ['src/a.ts', 'src/b.ts'] })),
    diff: vi.fn(() => 'diff --git a/src/a.ts'),
    ...overrides,
  } as unknown as WorktreeManager;
}

describe('bindWorktreeManager (WT-002)', () => {
  it('create() asks manager for subagent/<taskId> and returns SubagentWorktree', async () => {
    const manager = fakeManager();
    const bindings = bindWorktreeManager(manager, '/repo');
    const wt = await bindings.create('t1');

    expect(manager.create).toHaveBeenCalledWith('subagent/t1', expect.any(String));
    expect(wt).toEqual({
      path: '/repo/.agentk/worktrees/subagent__t1',
      branch: 'subagent/t1',
      base: 'abc123',
    });
  });

  it('capture() returns porcelain file list and warms diff()', async () => {
    const manager = fakeManager();
    const bindings = bindWorktreeManager(manager, '/repo');
    const snap = await bindings.capture({
      path: '/repo/.agentk/worktrees/subagent__t1',
      branch: 'subagent/t1',
      base: 'abc123',
    });

    expect(manager.status).toHaveBeenCalledWith('/repo/.agentk/worktrees/subagent__t1');
    expect(manager.diff).toHaveBeenCalledWith('/repo/.agentk/worktrees/subagent__t1');
    expect(snap).toEqual({
      filesChanged: 2,
      files: ['src/a.ts', 'src/b.ts'],
    });
  });

  it('create() still proceeds when rev-parse HEAD fails (base stays HEAD)', async () => {
    const create = vi.fn(async (_branch: string, base?: string) => ({
      path: '/r/.agentk/worktrees/subagent__x',
      branch: 'subagent/x',
      hash: '',
      detached: false,
      createdAt: 1,
      active: true,
    }));
    const manager = fakeManager({ create } as Partial<WorktreeManager>);
    // Non-git cwd → rev-parse fails; binding must pass 'HEAD' through.
    const bindings = bindWorktreeManager(manager, '/tmp/agent-k-no-git-root-xyz');
    const wt = await bindings.create('x');
    expect(create).toHaveBeenCalledWith('subagent/x', 'HEAD');
    expect(wt.base).toBe('HEAD');
  });
});
