/**
 * SUB-001 / 007 — task model + lifecycle guard tests.
 */
import { describe, expect, it } from 'vitest';
import {
  applySubagentPatch,
  createSubagentTask,
  isTerminalSubagentStatus,
  SubagentRunner,
} from './index';

describe('SUB-001 createSubagentTask', () => {
  it('creates queued task with role and description', () => {
    const t = createSubagentTask('turn1', 'do thing', 'research', 1000, 'Explore API');
    expect(t.status).toBe('queued');
    expect(t.role).toBe('research');
    expect(t.description).toBe('Explore API');
    expect(t.parentTurnId).toBe('turn1');
    expect(t.id).toMatch(/^subagent-/);
  });
});

describe('SUB-007 applySubagentPatch', () => {
  it('blocks resurrecting terminal tasks to running', () => {
    const t = createSubagentTask('t', 'x', 'general', 1);
    const done = applySubagentPatch(t, {
      status: 'completed',
      result: 'ok',
      completedAt: 2,
    });
    expect(isTerminalSubagentStatus(done.status)).toBe(true);
    const blocked = applySubagentPatch(done, { status: 'running' });
    expect(blocked.status).toBe('completed');
    expect(blocked).toBe(done);
  });
});

describe('SUB-003 SubagentRunner', () => {
  it('runs to completed and emits lifecycle events', async () => {
    const events: string[] = [];
    const runner = new SubagentRunner({
      now: () => 42,
      execute: async () => 'answer',
      onEvent: (e) => events.push(e.type),
    });
    const task = runner.create('p', 'prompt', 'coding', 'Fix bug');
    expect(task.description).toBe('Fix bug');
    const done = await runner.run(task);
    expect(done.status).toBe('completed');
    expect(done.result).toBe('answer');
    expect(events).toEqual([
      'subagent.created',
      'subagent.started',
      'subagent.completed',
    ]);
  });

  it('cancels in-flight run (SUB-006)', async () => {
    const runner = new SubagentRunner({
      execute: async ({ signal }) => {
        await new Promise<void>((resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
        return '';
      },
    });
    const task = runner.create('p', 'prompt');
    const pending = runner.run(task);
    // Comment: allow run() to reach execute before cancel
    await Promise.resolve();
    expect(runner.cancel(task.id)).toBe(true);
    const done = await pending;
    expect(done.status).toBe('cancelled');
  });

  it('requires worktree path when bindings are set (SUB-014 gate)', async () => {
    const runner = new SubagentRunner({
      execute: async () => 'x',
      worktrees: {
        create: async () => ({ path: '', branch: 'b', base: 'HEAD' }),
        capture: async () => ({ filesChanged: 0, files: [] }),
      },
    });
    const done = await runner.run(runner.create('p', 'prompt'));
    expect(done.status).toBe('failed');
    expect(done.error).toMatch(/isolated worktree/i);
  });
});
