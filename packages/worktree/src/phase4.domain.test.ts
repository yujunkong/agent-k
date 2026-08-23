/**
 * WT-003 / WT-004 / WT-008 / WT-013 domain unit tests.
 */
import { describe, expect, it, afterEach } from 'vitest';
import {
  assertManagedWorktree,
  isManagedWorktreePath,
  managedWorktreeBase,
} from './pathValidation';
import { parseStatusPorcelain } from './statusPorcelain';
import { parseWorktreeUnifiedDiff, worktreeDiffTotals } from './worktreeDiff';
import {
  clearSubagentWorktreeRegistry,
  getRegisteredSubagentWorktree,
  registerSubagentWorktree,
  unregisterSubagentWorktree,
  reviewRegisteredSubagentWorktree,
  applyRegisteredSubagentWorktree,
  rejectRegisteredSubagentWorktree,
} from './registry';
import { handleWorktreeReviewMessage, handleWorktreeApplyMessage } from './bridge';

describe('pathValidation (WT-004)', () => {
  it('accepts paths under .agentk/worktrees', () => {
    const root = '/repo';
    const wt = `${managedWorktreeBase(root)}/subagent/t1`;
    expect(isManagedWorktreePath(root, wt)).toBe(true);
    expect(() => assertManagedWorktree(root, wt)).not.toThrow();
  });

  it('rejects escape outside managed base', () => {
    expect(isManagedWorktreePath('/repo', '/repo/src/foo')).toBe(false);
    expect(() => assertManagedWorktree('/repo', '/tmp/evil')).toThrow(/Refused/);
  });
});

describe('statusPorcelain (WT-008)', () => {
  it('parses modified and rename rows', () => {
    const out = [' M src/a.ts', 'R  old.ts -> new.ts', '?? untracked.md'].join('\n');
    const entries = parseStatusPorcelain(out);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ code: ' M', path: 'src/a.ts' });
    expect(entries[1]).toMatchObject({
      code: 'R ',
      path: 'old.ts',
      renameTo: 'new.ts',
    });
    expect(entries[2].path).toBe('untracked.md');
  });
});

describe('worktreeDiff (WT-007/013)', () => {
  it('parses unified diff into file rows', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');
    const files = parseWorktreeUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/a.ts');
    expect(files[0].additions).toBe(1);
    expect(files[0].deletions).toBe(1);
    expect(worktreeDiffTotals({ diff, files: ['src/a.ts'] }).fileCount).toBe(1);
  });
});

describe('registry (WT-003)', () => {
  afterEach(() => clearSubagentWorktreeRegistry());

  it('register / lookup / unregister', () => {
    registerSubagentWorktree('subagent-a', '/repo', {
      path: '/repo/.agentk/worktrees/subagent-a',
      branch: 'subagent/a',
      base: 'abc123',
    });
    expect(getRegisteredSubagentWorktree('subagent-a')?.repoRoot).toBe('/repo');
    unregisterSubagentWorktree('subagent-a');
    expect(getRegisteredSubagentWorktree('subagent-a')).toBeUndefined();
  });

  it('review throws for unknown id', () => {
    expect(() => reviewRegisteredSubagentWorktree('missing')).toThrow(/Unknown subagent/);
  });

  it('apply returns error for unknown id', async () => {
    const result = await applyRegisteredSubagentWorktree('missing');
    expect(result.applied).toBe(false);
    expect(result.error).toMatch(/Unknown subagent/);
  });

  it('reject throws for unknown id', async () => {
    await expect(rejectRegisteredSubagentWorktree('missing')).rejects.toThrow(/Unknown/);
  });
});

describe('bridge (WT-015)', () => {
  afterEach(() => clearSubagentWorktreeRegistry());

  it('review requires subagentId', async () => {
    const posted: Record<string, unknown>[] = [];
    await handleWorktreeReviewMessage((p) => posted.push(p), { requestId: 'r1' });
    expect(posted[0]).toMatchObject({
      type: 'worktree.review.result',
      success: false,
    });
    expect(String(posted[0].error)).toMatch(/subagentId/);
  });

  it('apply returns structured failure for unknown task', async () => {
    const posted: Record<string, unknown>[] = [];
    await handleWorktreeApplyMessage((p) => posted.push(p), {
      subagentId: 'missing',
      requestId: 'r3',
    });
    expect(posted[0]).toMatchObject({
      type: 'worktree.apply.result',
      success: false,
      applied: false,
    });
  });
});
