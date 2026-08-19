/**
 * Subagent Host Bridge — create/run/cancel + parent tool result
 */
import * as assert from 'assert';
import {
  createSubagentHost,
  modeForSubagentRole,
  parentResultFromTask,
  promptFromTaskArgs,
  roleFromTaskArgs
} from '../../../src/host/subagentHost';
import type { SubagentEvent } from '../../../src/agent/subagentRunner';

suite('subagentHost', () => {
  test('promptFromTaskArgs prefers prompt and keeps description fallback', () => {
    assert.strictEqual(promptFromTaskArgs({ description: 'scan repo' }), 'scan repo');
    assert.strictEqual(
      promptFromTaskArgs({ prompt: 'find callers of foo', description: 'scan' }),
      'find callers of foo'
    );
    assert.ok(
      promptFromTaskArgs({
        description: 'scan',
        subtasks: ['grep foo', 'read hits']
      }).includes('- grep foo')
    );
  });

  test('roleFromTaskArgs maps search/ask to research', () => {
    assert.strictEqual(roleFromTaskArgs({ type: 'search' }), 'research');
    assert.strictEqual(roleFromTaskArgs({ mode: 'ask' }), 'research');
    assert.strictEqual(roleFromTaskArgs({ subagent_type: 'debug' }), 'debug');
    assert.strictEqual(roleFromTaskArgs({}), 'general');
  });

  test('modeForSubagentRole maps research to ask', () => {
    assert.strictEqual(modeForSubagentRole('research'), 'ask');
    assert.strictEqual(modeForSubagentRole('debug'), 'debug');
    assert.strictEqual(modeForSubagentRole('coding'), 'agent');
    assert.strictEqual(modeForSubagentRole('review'), 'agent');
    assert.strictEqual(modeForSubagentRole('general'), 'agent');
  });

  test('create → run → parent turn result (mock executor)', async () => {
    const events: SubagentEvent['type'][] = [];
    const host = createSubagentHost({
      systemPrompt: 'parent system',
      createLoop: () => {
        throw new Error('createLoop should not run when execute is injected');
      },
      execute: async ({ task }) => `done:${task.id}:${task.parentTurnId}`,
      onLifecycle: (event) => events.push(event.type)
    });

    const out = await host.runFromToolArgs(
      { prompt: 'explore src/host', description: 'explore' },
      'turn-3'
    );
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.data.parentTurnId, 'turn-3');
    assert.ok(String(out.data.taskId).startsWith('subagent-'));
    assert.strictEqual(out.data.status, 'completed');
    assert.ok(String(out.data.result).includes('turn-3'));
    assert.deepStrictEqual(events, [
      'subagent.created',
      'subagent.started',
      'subagent.completed'
    ]);
  });

  test('cancel aborts an in-flight child and returns cancelled to parent', async () => {
    let childTaskId = '';
    const host = createSubagentHost({
      systemPrompt: 'parent system',
      createLoop: () => {
        throw new Error('unused');
      },
      execute: async ({ task, signal }) => {
        childTaskId = task.id;
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 800);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            },
            { once: true }
          );
        });
        return 'should-not-complete';
      }
    });

    const running = host.runFromToolArgs({ prompt: 'slow job' }, 'turn-1');
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(host.cancel(childTaskId));
    const out = await running;
    assert.strictEqual(out.success, false);
    assert.strictEqual(out.data.status, 'cancelled');
    assert.strictEqual(out.data.parentTurnId, 'turn-1');
    assert.strictEqual(out.data.taskId, childTaskId);
  });

  test('parentResultFromTask keeps child id and parent turn', () => {
    const out = parentResultFromTask({
      id: 'subagent-x',
      parentTurnId: 'turn-9',
      role: 'research',
      prompt: 'find x',
      status: 'completed',
      createdAt: 1,
      startedAt: 1,
      completedAt: 5,
      result: 'found x in src/foo.ts'
    });
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.data.taskId, 'subagent-x');
    assert.strictEqual(out.data.parentTurnId, 'turn-9');
  });

  test('rejects empty prompt', async () => {
    const host = createSubagentHost({
      systemPrompt: 'x',
      createLoop: () => {
        throw new Error('unused');
      },
      execute: async () => 'nope'
    });
    const out = await host.runFromToolArgs({}, 'turn-1');
    assert.strictEqual(out.success, false);
    assert.ok(String(out.error).includes('prompt'));
  });

  test('caps concurrent children', async () => {
    const host = createSubagentHost({
      maxConcurrent: 1,
      systemPrompt: 'x',
      createLoop: () => {
        throw new Error('unused');
      },
      execute: async ({ signal }) => {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 200);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            },
            { once: true }
          );
        });
        return 'ok';
      }
    });
    const first = host.runFromToolArgs({ prompt: 'a' }, 't1');
    await new Promise((r) => setTimeout(r, 20));
    const second = await host.runFromToolArgs({ prompt: 'b' }, 't1');
    assert.strictEqual(second.success, false);
    assert.ok(String(second.error).includes('concurrent'));
    host.cancelAll();
    await first;
  });
});
