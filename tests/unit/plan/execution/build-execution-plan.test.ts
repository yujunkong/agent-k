import * as assert from 'assert';
import {
  buildExecutionPlan,
  inferTaskExecution,
  mapPlanPhaseToExecutionStatus,
  validateExecutionPlanStructure
} from '../../../../src/plan/execution/index.ts';
import type { PlanDocument } from '../../../../src/plan/v2/schema';

function samplePlan(): PlanDocument {
  return {
    id: 'plan_jwt',
    goal: 'Switch auth to JWT and add tests',
    summary: 'JWT migration',
    createdAt: 1_700_000_000_000,
    risks: [],
    tasks: [
      {
        id: 'task-1',
        title: 'Analyze authentication',
        description: 'Review current auth flow',
        files: [{ path: 'src/auth.ts', intent: 'read' }],
        dependencies: [],
        verification: []
      },
      {
        id: 'task-2',
        title: 'Implement JWT middleware',
        description: 'Replace session auth with JWT',
        files: [{ path: 'src/middleware/jwt.ts', intent: 'create' }],
        dependencies: ['task-1'],
        verification: []
      },
      {
        id: 'task-3',
        title: 'Update authentication tests',
        description: 'Add JWT test coverage',
        files: [{ path: 'tests/auth.test.ts', intent: 'modify' }],
        dependencies: ['task-2'],
        verification: []
      },
      {
        id: 'task-4',
        title: 'Run verification',
        description: 'Run test suite',
        files: [],
        dependencies: ['task-2', 'task-3'],
        verification: ['npm test']
      }
    ]
  };
}

suite('Plan execution — buildExecutionPlan', () => {
  test('materializes tasks with dependency-aware initial status', () => {
    const plan = buildExecutionPlan(samplePlan(), { approvedAt: 100 });
    assert.strictEqual(plan.id, 'plan_jwt');
    assert.strictEqual(plan.status, 'approved');
    assert.strictEqual(plan.approvedAt, 100);
    assert.strictEqual(plan.tasks.length, 4);

    const byId = Object.fromEntries(plan.tasks.map((task) => [task.id, task]));
    assert.strictEqual(byId['task-1'].status, 'ready');
    assert.strictEqual(byId['task-2'].status, 'pending');
    assert.strictEqual(byId['task-3'].status, 'pending');
    assert.strictEqual(byId['task-4'].status, 'pending');
  });

  test('infers subagent for write tasks and main for analysis/verification', () => {
    const plan = buildExecutionPlan(samplePlan());
    const byId = Object.fromEntries(plan.tasks.map((task) => [task.id, task]));
    assert.strictEqual(byId['task-1'].execution, 'main');
    assert.strictEqual(byId['task-2'].execution, 'subagent');
    assert.strictEqual(byId['task-3'].execution, 'subagent');
    assert.strictEqual(byId['task-4'].execution, 'main');
  });

  test('partial approval expands transitive dependencies into scope', () => {
    const plan = buildExecutionPlan(samplePlan(), { approvedTaskIds: ['task-3'] });
    assert.deepStrictEqual(plan.approvedTaskIds, ['task-1', 'task-2', 'task-3']);
    assert.strictEqual(plan.tasks.length, 3);
    assert.ok(plan.tasks.every((task) => task.id !== 'task-4'));
  });

  test('execution overrides win over inference', () => {
    const plan = buildExecutionPlan(samplePlan(), {
      executionOverrides: { 'task-2': 'main' }
    });
    const task2 = plan.tasks.find((task) => task.id === 'task-2');
    assert.strictEqual(task2?.execution, 'main');
  });

  test('rejects unknown dependencies and cycles', () => {
    const issues = validateExecutionPlanStructure([
      { id: 'a', dependencies: ['missing'] },
      { id: 'b', dependencies: ['c'] },
      { id: 'c', dependencies: ['b'] }
    ]);
    assert.ok(issues.some((issue) => issue.code === 'unknown_dependency'));
    assert.ok(issues.some((issue) => issue.code === 'cycle'));
  });

  test('mapPlanPhaseToExecutionStatus mirrors session phases', () => {
    assert.strictEqual(mapPlanPhaseToExecutionStatus('review'), 'reviewing');
    assert.strictEqual(mapPlanPhaseToExecutionStatus('executing'), 'executing');
    assert.strictEqual(mapPlanPhaseToExecutionStatus('planning'), 'draft');
  });
});

suite('Plan execution — inferTaskExecution', () => {
  test('modify/create files delegate to subagent', () => {
    assert.strictEqual(
      inferTaskExecution({
        id: 't',
        title: 'Edit',
        description: 'd',
        files: [{ path: 'a.ts', intent: 'modify' }],
        dependencies: [],
        verification: []
      }),
      'subagent'
    );
  });
});
