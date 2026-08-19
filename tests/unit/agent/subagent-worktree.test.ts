/**
 * Subagent worktree isolation — create worktree before execute, never
 * fall back to the parent workspace.
 */
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { SubagentRunner } from '../../../src/agent/subagentRunner';
import { createSubagentAgentLoopExecutor } from '../../../src/agent/subagentAgentLoopExecutor';
import { createSubagentTask } from '../../../src/agent/subagents';
import {
  getWorkspaceRoot,
  resolveWorkspacePath,
  runWithWorkspaceRoot
} from '../../../src/tools/writeExecutors';

suite('subagent worktree isolation', () => {
  test('runner creates worktree before execute and captures status/diff into the task', async () => {
    const seen: string[] = [];
    const runner = new SubagentRunner({
      execute: async (context) => {
        seen.push(context.worktree?.path || '');
        return 'done';
      },
      worktrees: {
        create: async (taskId) => ({
          path: `/tmp/wt-${taskId}`,
          branch: `subagent/${taskId}`,
          base: 'abc123'
        }),
        capture: async () => {
          return { filesChanged: 2, files: ['src/a.ts', 'src/b.ts'] };
        }
      }
    });

    const task = runner.create('turn-1', 'edit in isolation');
    const finished = await runner.run(task);
    assert.strictEqual(finished.status, 'completed');
    assert.strictEqual(seen[0], `/tmp/wt-${task.id}`);
    assert.strictEqual(finished.worktree?.path, `/tmp/wt-${task.id}`);
    assert.strictEqual(finished.worktree?.base, 'abc123');
    assert.strictEqual(finished.worktreeSnapshot?.filesChanged, 2);
  });

  test('runner does not execute in the parent workspace if worktree create fails', async () => {
    let executed = false;
    const runner = new SubagentRunner({
      execute: async () => {
        executed = true;
        return 'should-not-run';
      },
      worktrees: {
        create: async () => {
          throw new Error('git worktree add failed');
        },
        capture: async () => ({ filesChanged: 0, files: [] })
      }
    });

    const task = runner.create('turn-1', 'do not touch parent');
    const finished = await runner.run(task);
    assert.strictEqual(executed, false);
    assert.strictEqual(finished.status, 'failed');
    assert.ok(String(finished.error).includes('worktree'));
  });

  test('adapter refuses to start AgentLoop without a worktree cwd', async () => {
    let created = false;
    const execute = createSubagentAgentLoopExecutor({
      systemPrompt: 'x',
      createLoop: () => {
        created = true;
        return {
          continue: async () => undefined,
          stop: () => undefined,
          getMessages: () => []
        } as any;
      }
    });
    const task = createSubagentTask('turn-1', 'prompt');
    await assert.rejects(
      () => execute({ task, signal: new AbortController().signal }),
      /isolated worktree path is required/
    );
    assert.strictEqual(created, false);
  });

  test('adapter runs AgentLoop continue() with cwd = worktree.path', async () => {
    let seenRoot = '';
    const isolated = path.join(os.tmpdir(), 'agent-k-subagent-wt');
    const execute = createSubagentAgentLoopExecutor({
      systemPrompt: 'x',
      createLoop: (context) => {
        assert.strictEqual(context.worktree?.path, isolated);
        return {
          continue: async () => {
            seenRoot = getWorkspaceRoot();
          },
          stop: () => undefined,
          getMessages: () => []
        } as any;
      }
    });
    const task = createSubagentTask('turn-1', 'prompt');
    const answer = await execute({
      task,
      signal: new AbortController().signal,
      worktree: { path: isolated, branch: 'subagent/x', base: 'HEAD' }
    });
    assert.strictEqual(path.resolve(seenRoot), path.resolve(isolated));
    assert.strictEqual(answer, '');
  });

  test('edit_file path resolution stays inside the isolated worktree', () => {
    const isolated = path.join(os.tmpdir(), 'agent-k-isolated-root');
    runWithWorkspaceRoot(isolated, () => {
      assert.strictEqual(path.resolve(getWorkspaceRoot()), path.resolve(isolated));
      const resolved = resolveWorkspacePath('src/auth.ts');
      assert.ok('abs' in resolved);
      if ('abs' in resolved) {
        assert.ok(resolved.abs.startsWith(path.resolve(isolated)));
        assert.ok(!resolved.abs.includes(`${path.sep}src${path.sep}host${path.sep}`));
      }
    });
  });
});
