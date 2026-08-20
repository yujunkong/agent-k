import * as assert from 'assert';
import * as os from 'os';
import { buildExecutionPlan } from '../../../../src/plan/execution/buildExecutionPlan.ts';
import { runPlanExecution } from '../../../../src/plan/execution/planExecutionEngine.ts';
import type { SubagentHostLike } from '../../../../src/plan/execution/subagentTaskBridge.ts';
import type { SubagentTask } from '../../../../src/agent/subagents';
import { createSubagentTask, patchSubagentTask } from '../../../../src/agent/subagents';
import type { PlanDocument } from '../../../../src/plan/v2/schema';
import {
  normalizeExecutionError,
  categorizePlanError,
  formatDiagnosticEventLog,
  makeExecutionId,
  type AnyPlanDiagnosticEvent,
  type PlanExecutionEventType
} from '../../../../src/plan/execution/executionDiagnostics.ts';
import { diagnosticToWorkEvent } from '../../../../src/plan/execution/diagnosticToWorkEvent.ts';

function simplePlan(): PlanDocument {
  return {
    id: 'plan_diag',
    goal: 'Diagnostics test',
    summary: 'Test',
    createdAt: 1,
    risks: [],
    repoRoot: os.tmpdir(),
    tasks: [
      {
        id: 't1',
        title: 'First task',
        description: 'Do first',
        files: [],
        dependencies: [],
        verification: []
      },
      {
        id: 't2',
        title: 'Second task',
        description: 'Do second',
        files: [{ path: 'new.ts', intent: 'create' }],
        dependencies: ['t1'],
        verification: []
      }
    ]
  };
}

function mockSubagentHost(): SubagentHostLike {
  const tasks = new Map<string, SubagentTask>();
  return {
    create(parentTurnId, prompt, role = 'general') {
      const task = createSubagentTask(parentTurnId, prompt, role);
      tasks.set(task.id, task);
      return task;
    },
    async run(task) {
      const finished = patchSubagentTask(tasks.get(task.id) ?? task, {
        status: 'completed',
        result: 'ok',
        worktree: { path: `/tmp/wt/${task.id}`, branch: `plan/${task.id}`, baseRef: 'HEAD' }
      });
      tasks.set(task.id, finished);
      return finished;
    }
  };
}

suite('Plan execution — diagnostics', () => {
  test('normalizeExecutionError preserves Error properties', () => {
    const err = new Error('test error');
    err.name = 'TestError';
    const normalized = normalizeExecutionError(err, 'filesystem');
    assert.strictEqual(normalized.name, 'TestError');
    assert.strictEqual(normalized.message, 'test error');
    assert.strictEqual(normalized.category, 'filesystem');
    assert.ok(normalized.stack);
  });

  test('normalizeExecutionError handles non-Error', () => {
    const normalized = normalizeExecutionError('string error');
    assert.strictEqual(normalized.name, 'UnknownError');
    assert.strictEqual(normalized.message, 'string error');
    assert.strictEqual(normalized.category, 'unknown');
  });

  test('categorizePlanError classifies known patterns', () => {
    assert.strictEqual(categorizePlanError('FILE_NOT_FOUND: src/a.ts'), 'filesystem');
    assert.strictEqual(categorizePlanError('Subagent failed'), 'subagent');
    assert.strictEqual(categorizePlanError('timeout after 60s'), 'timeout');
    assert.strictEqual(categorizePlanError('git merge conflict'), 'git');
    assert.strictEqual(categorizePlanError('worktree allocation failed'), 'worktree');
    assert.strictEqual(categorizePlanError('something unknown'), 'unknown');
  });

  test('makeExecutionId produces unique ids', () => {
    const a = makeExecutionId();
    const b = makeExecutionId();
    assert.ok(a.startsWith('exec-'));
    assert.notStrictEqual(a, b);
  });

  test('runPlanExecution emits diagnostic events for full lifecycle', async () => {
    const plan = buildExecutionPlan(simplePlan(), { status: 'executing' });
    const events: AnyPlanDiagnosticEvent[] = [];

    await runPlanExecution(plan, {
      parentTurnId: 'turn-diag',
      subagentHost: mockSubagentHost(),
      repoRoot: os.tmpdir(),
      runMainTask: async () => ({ success: true }),
      hooks: {
        onDiagnostic: (event) => events.push(event)
      }
    });

    const types = events.map((e) => e.type);
    assert.ok(types.includes('plan.execution.started'), `Missing started, got: ${types.join(', ')}`);
    assert.ok(types.includes('plan.task.started'), `Missing task.started, got: ${types.join(', ')}`);
    assert.ok(types.includes('plan.task.dispatched'), `Missing task.dispatched, got: ${types.join(', ')}`);
    assert.ok(types.includes('plan.task.completed'), `Missing task.completed, got: ${types.join(', ')}`);
    assert.ok(types.includes('plan.execution.completed'), `Missing execution.completed, got: ${types.join(', ')}`);

    // All events share same executionId
    const execIds = new Set(events.map((e) => e.executionId));
    assert.strictEqual(execIds.size, 1);
    assert.ok([...execIds][0]!.startsWith('exec-'));

    // All events have planId
    assert.ok(events.every((e) => e.planId === 'plan_diag'));

    // Check task indexing
    const t1Started = events.find((e) => e.type === 'plan.task.started' && e.taskId === 't1');
    assert.strictEqual(t1Started?.taskIndex, 0);
    assert.strictEqual(t1Started?.taskCount, 2);

    const t2Started = events.find((e) => e.type === 'plan.task.started' && e.taskId === 't2');
    assert.strictEqual(t2Started?.taskIndex, 1);

    // Check execution.completed summary
    const completed = events.find((e) => e.type === 'plan.execution.completed') as any;
    assert.strictEqual(completed?.metadata.completed, 2);
    assert.strictEqual(completed?.metadata.failed, 0);
  });

  test('failed task emits task.failed + task.blocked for dependents', async () => {
    const doc = simplePlan();
    const plan = buildExecutionPlan(doc, { status: 'executing' });
    const events: AnyPlanDiagnosticEvent[] = [];

    await runPlanExecution(plan, {
      parentTurnId: 'turn-fail',
      subagentHost: mockSubagentHost(),
      repoRoot: os.tmpdir(),
      runMainTask: async () => ({ success: false, error: 'main task error' }),
      hooks: {
        onDiagnostic: (event) => events.push(event)
      }
    });

    const types = events.map((e) => e.type);
    assert.ok(types.includes('plan.task.failed'));
    assert.ok(types.includes('plan.task.blocked'));
    assert.ok(types.includes('plan.execution.failed'));

    const failed = events.find((e) => e.type === 'plan.task.failed') as any;
    assert.strictEqual(failed?.taskId, 't1');
    assert.strictEqual(failed?.metadata.failure.message, 'main task error');

    const blocked = events.find((e) => e.type === 'plan.task.blocked') as any;
    assert.strictEqual(blocked?.taskId, 't2');
    assert.deepStrictEqual(blocked?.metadata.blockedBy, ['t1']);
    assert.strictEqual(blocked?.metadata.reason, 'dependency_failed');

    const execFailed = events.find((e) => e.type === 'plan.execution.failed') as any;
    assert.ok(execFailed?.metadata.failedTaskIds.includes('t1'));

    // rootCause should be present and point to T1
    assert.ok(execFailed?.metadata.rootCause, 'rootCause should be present');
    assert.strictEqual(execFailed.metadata.rootCause.taskId, 't1');
    assert.strictEqual(execFailed.metadata.rootCause.message, 'main task error');

    // summary counts should include total and pending
    assert.strictEqual(execFailed.metadata.total, 2);
    assert.strictEqual(execFailed.metadata.failed, 1);
    assert.strictEqual(execFailed.metadata.blocked, 1);
    assert.strictEqual(execFailed.metadata.pending, 0);

    // blocked event should include blockedByDetails
    const blockedEvt = events.find((e) => e.type === 'plan.task.blocked') as any;
    assert.ok(blockedEvt?.metadata.blockedByDetails, 'blockedByDetails should be present');
    assert.strictEqual(blockedEvt.metadata.blockedByDetails[0].taskId, 't1');
    assert.strictEqual(blockedEvt.metadata.blockedByDetails[0].status, 'failed');
  });

  test('formatDiagnosticEventLog produces readable single-line output', () => {
    const event: AnyPlanDiagnosticEvent = {
      type: 'plan.task.failed',
      turnId: 'turn-1',
      planId: 'plan-1',
      executionId: 'exec-1',
      taskId: 't2',
      taskIndex: 1,
      taskCount: 5,
      timestamp: Date.now(),
      status: 'error',
      durationMs: 3400,
      metadata: {
        failure: {
          category: 'filesystem',
          message: 'FILE_NOT_FOUND: src/main.rs not present under /workspace/agent-k',
          retryable: false
        }
      }
    };
    const line = formatDiagnosticEventLog(event);
    assert.ok(line.includes('plan.task.failed'));
    assert.ok(line.includes('t2'));
    assert.ok(line.includes('3.4s'));
    assert.ok(line.includes('filesystem'));
    assert.ok(line.includes('FILE_NOT_FOUND'));
  });

  test('diagnosticToWorkEvent skips progress rows — WorkTimeline owns tools', () => {
    const started: AnyPlanDiagnosticEvent = {
      type: 'plan.task.started',
      turnId: 'turn-1',
      planId: 'plan-1',
      executionId: 'exec-1',
      taskId: 't1',
      taskIndex: 0,
      taskCount: 3,
      timestamp: Date.now(),
      status: 'running',
      metadata: { execution: 'subagent', title: 'Implement auth' }
    };
    assert.strictEqual(diagnosticToWorkEvent(started), null);
  });

  test('diagnosticToWorkEvent keeps task.failed for the timeline', () => {
    const event: AnyPlanDiagnosticEvent = {
      type: 'plan.task.failed',
      turnId: 'turn-1',
      planId: 'plan-1',
      executionId: 'exec-1',
      taskId: 't1',
      taskIndex: 0,
      taskCount: 3,
      timestamp: Date.now(),
      status: 'error',
      metadata: {
        failure: { category: 'subagent', code: 'X', message: 'boom', retryable: false }
      }
    };
    const workEvent = diagnosticToWorkEvent(event);
    assert.ok(workEvent);
    assert.strictEqual(workEvent.type, 'plan');
    assert.strictEqual(workEvent.status, 'error');
    assert.strictEqual(workEvent.executionId, 'exec-1');
    assert.strictEqual(workEvent.taskId, 't1');
  });

  test('task.failed event carries cause chain with code', async () => {
    const doc = simplePlan();
    const plan = buildExecutionPlan(doc, { status: 'executing' });
    const events: AnyPlanDiagnosticEvent[] = [];

    await runPlanExecution(plan, {
      parentTurnId: 'turn-cause',
      subagentHost: mockSubagentHost(),
      repoRoot: os.tmpdir(),
      runMainTask: async () => ({ success: false, error: 'worktree allocation failed' }),
      hooks: {
        onDiagnostic: (event) => events.push(event)
      }
    });

    const failed = events.find((e) => e.type === 'plan.task.failed') as any;
    assert.ok(failed?.metadata.failure.code, 'failure should have a code');
    assert.strictEqual(failed.metadata.failure.code, 'WORKTREE_CREATE_FAILED');
    assert.strictEqual(failed.metadata.failure.category, 'worktree');
  });

  test('plan.execution.failed rootCause includes category and code', async () => {
    const doc = simplePlan();
    const plan = buildExecutionPlan(doc, { status: 'executing' });
    const events: AnyPlanDiagnosticEvent[] = [];

    await runPlanExecution(plan, {
      parentTurnId: 'turn-rc',
      subagentHost: mockSubagentHost(),
      repoRoot: os.tmpdir(),
      runMainTask: async () => ({ success: false, error: 'git merge conflict detected' }),
      hooks: {
        onDiagnostic: (event) => events.push(event)
      }
    });

    const execFailed = events.find((e) => e.type === 'plan.execution.failed') as any;
    const rc = execFailed?.metadata.rootCause;
    assert.ok(rc, 'rootCause should exist');
    assert.strictEqual(rc.taskId, 't1');
    assert.strictEqual(rc.category, 'git');
    assert.strictEqual(rc.code, 'GIT_MERGE_FAILED');
  });

  test('formatDiagnosticEventLog includes cause chain info', () => {
    const event: AnyPlanDiagnosticEvent = {
      type: 'plan.task.failed',
      turnId: 'turn-1',
      planId: 'plan-1',
      executionId: 'exec-1',
      taskId: 't1',
      taskIndex: 0,
      taskCount: 3,
      timestamp: Date.now(),
      status: 'error',
      metadata: {
        failure: {
          category: 'subagent' as const,
          code: 'WORKTREE_CREATE_FAILED',
          message: 'Command failed: git worktree add ...',
          retryable: false,
          cause: {
            category: 'git' as const,
            code: 'GIT_WORKTREE_ADD_FAILED',
            command: {
              command: 'git worktree add /tmp/wt branch',
              cwd: '/workspace',
              exitCode: 1,
              stderr: 'fatal: not a git repository'
            }
          }
        }
      }
    };
    const line = formatDiagnosticEventLog(event);
    assert.ok(line.includes('WORKTREE_CREATE_FAILED'), `should contain failure code, got: ${line}`);
    assert.ok(line.includes('GIT_WORKTREE_ADD_FAILED'), `should contain cause code, got: ${line}`);
    assert.ok(line.includes('exit=1'), `should contain exit code, got: ${line}`);
    assert.ok(line.includes('cwd=/workspace'), `should contain cwd, got: ${line}`);
  });

  test('diagnosticToWorkEvent returns null for task.ready', () => {
    const event: AnyPlanDiagnosticEvent = {
      type: 'plan.task.ready',
      turnId: 'turn-1',
      planId: 'plan-1',
      executionId: 'exec-1',
      taskId: 't1',
      taskIndex: 0,
      taskCount: 3,
      timestamp: Date.now(),
      status: 'pending',
      metadata: { dependencies: [], execution: 'main' }
    };
    assert.strictEqual(diagnosticToWorkEvent(event), null);
  });
});
