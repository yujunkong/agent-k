/**
 * WT-001 — parseWorktreePorcelain unit tests (ported from v2.1 chat/worktree).
 */
import { describe, expect, it } from 'vitest';
import { parseWorktreePorcelain } from './WorktreeManager';

describe('parseWorktreePorcelain', () => {
  it('parses a normal branch worktree', () => {
    const output = `worktree /repo\nHEAD abc1234567890\nbranch refs/heads/main\n\n`;
    const result = parseWorktreePorcelain(output);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: '/repo',
      branch: 'main',
      hash: 'abc1234567890',
      detached: false,
    });
  });

  it('parses detached HEAD worktree', () => {
    const output = `worktree /tmp/wt\nHEAD abcdef1\ndetached\n\n`;
    const result = parseWorktreePorcelain(output);
    expect(result).toHaveLength(1);
    expect(result[0].detached).toBe(true);
    expect(result[0].branch).toContain('detached');
  });

  it('parses multiple worktrees', () => {
    const output = [
      'worktree /repo\nHEAD aaa\nbranch refs/heads/main\n',
      'worktree /repo/.agentk/worktrees/t1\nHEAD bbb\nbranch refs/heads/agent-k/t1\n',
      'worktree /repo/.agentk/worktrees/t2\nHEAD ccc\ndetached\n',
    ].join('\n');
    const result = parseWorktreePorcelain(output);
    expect(result).toHaveLength(3);
    expect(result[0].branch).toBe('main');
    expect(result[1].branch).toBe('agent-k/t1');
    expect(result[2].detached).toBe(true);
  });

  it('handles branch with slashes', () => {
    const output = `worktree /w\nHEAD ddd\nbranch refs/heads/feature/my/branch\n\n`;
    expect(parseWorktreePorcelain(output)[0].branch).toBe('feature/my/branch');
  });

  it('returns empty array for empty input', () => {
    expect(parseWorktreePorcelain('')).toEqual([]);
    expect(parseWorktreePorcelain('\n')).toEqual([]);
  });

  it('skips blocks without worktree path', () => {
    const output = `HEAD abc123\nbranch refs/heads/orphan\n\n`;
    expect(parseWorktreePorcelain(output)).toEqual([]);
  });
});
