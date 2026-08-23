/**
 * Cross-platform path / branch helpers (WT worktree).
 */
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  pathIsInside,
  pathsEqual,
  worktreeDirFromBranch,
} from './gitExec';

describe('gitExec cross-platform helpers', () => {
  it('flattens branch slashes for worktree directories', () => {
    expect(worktreeDirFromBranch('subagent/t1')).toBe('subagent__t1');
    expect(worktreeDirFromBranch('bon/1/2')).toBe('bon__1__2');
  });

  it('pathIsInside rejects escape', () => {
    const root = path.resolve('/repo/.agentk/worktrees');
    expect(pathIsInside(root, path.join(root, 'subagent__t1'))).toBe(true);
    expect(pathIsInside(root, path.resolve('/repo/src'))).toBe(false);
  });

  it('pathsEqual normalizes separators', () => {
    const a = path.join('a', 'b', 'c');
    const b = ['a', 'b', 'c'].join(path.sep);
    expect(pathsEqual(path.resolve(a), path.resolve(b))).toBe(true);
  });
});
