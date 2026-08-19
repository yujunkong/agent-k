/**
 * Session registry for finished subagent worktrees.
 */
import * as assert from 'assert';
import {
  applyRegisteredSubagentWorktree,
  clearSubagentWorktreeRegistry,
  getRegisteredSubagentWorktree,
  registerSubagentWorktree,
  rejectRegisteredSubagentWorktree,
  reviewRegisteredSubagentWorktree,
  unregisterSubagentWorktree
} from '../../../src/host/subagentWorktreeRegistry';

suite('subagentWorktreeRegistry', () => {
  teardown(() => {
    clearSubagentWorktreeRegistry();
  });

  test('register and lookup finished subagent worktree', () => {
    registerSubagentWorktree('subagent-a', '/repo', {
      path: '/repo/.agentk/worktrees/subagent-a',
      branch: 'subagent/a',
      base: 'abc123'
    });
    const entry = getRegisteredSubagentWorktree('subagent-a');
    assert.ok(entry);
    assert.strictEqual(entry.subagentId, 'subagent-a');
    assert.strictEqual(entry.repoRoot, '/repo');
    assert.strictEqual(entry.worktree.path, '/repo/.agentk/worktrees/subagent-a');
  });

  test('unregister removes entry', () => {
    registerSubagentWorktree('subagent-b', '/repo', {
      path: '/repo/.agentk/worktrees/subagent-b',
      branch: 'subagent/b',
      base: 'abc123'
    });
    unregisterSubagentWorktree('subagent-b');
    assert.strictEqual(getRegisteredSubagentWorktree('subagent-b'), undefined);
  });

  test('review throws for unknown subagent id', () => {
    assert.throws(
      () => reviewRegisteredSubagentWorktree('missing'),
      /Unknown subagent task/
    );
  });

  test('apply returns error for unknown subagent id', async () => {
    const result = await applyRegisteredSubagentWorktree('missing');
    assert.strictEqual(result.applied, false);
    assert.ok(String(result.error).includes('Unknown subagent task'));
  });

  test('reject throws for unknown subagent id', async () => {
    await assert.rejects(
      rejectRegisteredSubagentWorktree('missing'),
      /Unknown subagent task/
    );
  });
});
