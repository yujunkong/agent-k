import * as assert from 'assert';
import { buildExecutionPlan } from '../../../../src/plan/execution/buildExecutionPlan.ts';
import {
  getNextRunnableTask,
  getReadyTasks,
  markTaskCompleted,
  markTaskFailed,
  markTaskRunning
} from '../../../../src/plan/execution/taskScheduler.ts';
import type { PlanDocument } from '../../../../src/plan/v2/schema';

function diamondPlan(): PlanDocument {
  return {
    id: 'plan_dag',
    goal: 'DAG test',
    summary: 'DAG test',
    createdAt: 1,
    risks: [],
    tasks: [
      { id: 'A', title: 'A', description: 'root', files: [], dependencies: [], verification: [] },
      { id: 'B', title: 'B', description: 'left', files: [], dependencies: ['A'], verification: [] },
      { id: 'C', title: 'C', description: 'right', files: [], dependencies: ['A'], verification: [] },
      { id: 'D', title: 'D', description: 'join', files: [], dependencies: ['B', 'C'], verification: [] }
    ]
  };
}

function linearPlan(): PlanDocument {
  return {
    id: 'plan_linear',
    goal: 'Linear',
    summary: 'Linear',
    createdAt: 1,
    risks: [],
    tasks: [
      { id: 't1', title: '1', description: 'a', files: [], dependencies: [], verification: [] },
      { id: 't2', title: '2', description: 'b', files: [], dependencies: ['t1'], verification: [] },
      { id: 't3', title: '3', description: 'c', files: [], dependencies: ['t2'], verification: [] }
    ]
  };
}

suite('Plan execution — taskScheduler', () => {
  test('getReadyTasks returns root tasks initially', () => {
    const plan = buildExecutionPlan(diamondPlan(), { status: 'executing' });
    assert.deepStrictEqual(getReadyTasks(plan).map((task) => task.id), ['A']);
  });

  test('diamond DAG unlocks B and C after A completes', () => {
    let plan = buildExecutionPlan(diamondPlan(), { status: 'executing' });
    plan = markTaskRunning(plan, 'A');
    plan = markTaskCompleted(plan, 'A');
    const readyIds = getReadyTasks(plan).map((task) => task.id).sort();
    assert.deepStrictEqual(readyIds, ['B', 'C']);
    assert.strictEqual(plan.status, 'executing');
  });

  test('D becomes ready only after both B and C complete', () => {
    let plan = buildExecutionPlan(diamondPlan(), { status: 'executing' });
    plan = markTaskRunning(plan, 'A');
    plan = markTaskCompleted(plan, 'A');

    plan = markTaskRunning(plan, 'B');
    plan = markTaskCompleted(plan, 'B');
    assert.deepStrictEqual(getReadyTasks(plan).map((task) => task.id), ['C']);

    plan = markTaskRunning(plan, 'C');
    plan = markTaskCompleted(plan, 'C');
    assert.deepStrictEqual(getReadyTasks(plan).map((task) => task.id), ['D']);
  });

  test('linear sequential flow completes the plan', () => {
    let plan = buildExecutionPlan(linearPlan(), { status: 'executing' });

    for (const id of ['t1', 't2', 't3']) {
      assert.strictEqual(getNextRunnableTask(plan)?.id, id);
      plan = markTaskRunning(plan, id);
      plan = markTaskCompleted(plan, id);
    }

    assert.strictEqual(plan.status, 'completed');
    assert.strictEqual(getReadyTasks(plan).length, 0);
  });

  test('markTaskFailed blocks transitive dependents', () => {
    let plan = buildExecutionPlan(diamondPlan(), { status: 'executing' });
    plan = markTaskRunning(plan, 'A');
    plan = markTaskCompleted(plan, 'A');
    plan = markTaskRunning(plan, 'B');
    plan = markTaskFailed(plan, 'B');

    const byId = Object.fromEntries(plan.tasks.map((task) => [task.id, task.status]));
    assert.strictEqual(byId.B, 'failed');
    assert.strictEqual(byId.D, 'blocked');
    assert.strictEqual(byId.C, 'ready');
    assert.strictEqual(plan.status, 'failed');
  });

  test('markTaskRunning rejects non-ready tasks', () => {
    const plan = buildExecutionPlan(linearPlan(), { status: 'executing' });
    assert.throws(() => markTaskRunning(plan, 't2'), /not ready/);
  });
});
