import * as assert from 'assert';
import {
  validateExecutionPlanContext,
  validateTaskExecutionLaunch
} from '../../../../src/plan/execution/validateExecutionContext';
import type { ExecutionPlan, ExecutionPlanTask } from '../../../../src/plan/execution/types';

function basePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    id: 'plan_ctx',
    goal: 'Test',
    status: 'executing',
    approvedTaskIds: ['t1'],
    createdAt: 1,
    repoRoot: '/workspace/agent-k',
    tasks: [
      {
        id: 't1',
        title: 'Task',
        description: 'Do work',
        dependencies: [],
        files: [],
        verification: [],
        execution: 'main',
        status: 'ready'
      }
    ],
    ...overrides
  };
}

function taskWithFiles(
  files: ExecutionPlanTask['files']
): ExecutionPlanTask {
  return {
    id: 't1',
    title: 'Task',
    description: 'Do work',
    dependencies: [],
    files,
    verification: [],
    execution: 'subagent',
    status: 'ready'
  };
}

suite('Plan execution — validateExecutionContext', () => {
  test('validateExecutionPlanContext detects repoRoot mismatch', () => {
    const issue = validateExecutionPlanContext(basePlan(), '/other/repo');
    assert.strictEqual(issue?.code, 'REPO_ROOT_MISMATCH');
    assert.ok(issue?.message.includes('/workspace/agent-k'));
    assert.strictEqual(validateExecutionPlanContext(basePlan(), '/workspace/agent-k'), null);
  });

  test('validateTaskExecutionLaunch fails on unresolved modify/read targets', () => {
    const plan = basePlan();
    const task = taskWithFiles([
      {
        path: 'src/main.rs',
        intent: 'modify',
        resolution: 'unresolved',
        exists: false
      },
      {
        path: 'src/editor/buffer.rs',
        intent: 'modify',
        resolution: 'unresolved',
        exists: false
      }
    ]);
    const issue = validateTaskExecutionLaunch(plan, task, '/workspace/agent-k');
    assert.strictEqual(issue?.code, 'UNRESOLVED_TASK_TARGETS');
    assert.ok(issue?.message.includes('src/main.rs'));
    assert.ok(issue?.message.includes('different project structure'));
  });

  test('validateTaskExecutionLaunch allows resolved targets', () => {
    const plan = basePlan();
    const task = taskWithFiles([
      { path: 'src/chat/ChatApp.tsx', intent: 'modify', resolution: 'resolved', exists: true }
    ]);
    assert.strictEqual(validateTaskExecutionLaunch(plan, task, '/workspace/agent-k'), null);
  });
});
