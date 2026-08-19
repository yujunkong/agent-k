import * as assert from 'assert';
import {
  listUnresolvedPlanFileTargets,
  resolvePlanFileTargets
} from '../../../../src/plan/v2/resolvePlanFileTargets';
import type { PlanLLMOutput } from '../../../../src/plan/v2/schema';

const existing = new Set(['src/auth.ts']);
const fileExists = (path: string) => existing.has(path);

function samplePlan(): PlanLLMOutput {
  return {
    summary: 'Auth work',
    risks: [],
    tasks: [
      {
        id: 'task-1',
        title: 'Analyze',
        description: 'Read auth',
        files: [{ path: 'src/auth.ts', intent: 'read' }],
        dependencies: [],
        verification: []
      },
      {
        id: 'task-2',
        title: 'Edit main',
        description: 'Modify main.rs',
        files: [{ path: 'src/main.rs', intent: 'modify' }],
        dependencies: ['task-1'],
        verification: []
      },
      {
        id: 'task-3',
        title: 'Create module',
        description: 'Add jwt module',
        files: [{ path: 'src/jwt.ts', intent: 'create' }],
        dependencies: ['task-2'],
        verification: []
      }
    ]
  };
}

suite('Plan V2 — resolvePlanFileTargets', () => {
  test('marks existing read/modify targets resolved and missing modify unresolved', async () => {
    const tasks = await resolvePlanFileTargets(samplePlan(), fileExists);
    assert.strictEqual(tasks[0].files[0].resolution, 'resolved');
    assert.strictEqual(tasks[0].files[0].exists, true);
    assert.strictEqual(tasks[1].files[0].resolution, 'unresolved');
    assert.strictEqual(tasks[1].files[0].exists, false);
    assert.strictEqual(tasks[1].files[0].intent, 'modify');
    assert.strictEqual(tasks[2].files[0].resolution, 'resolved');
    assert.strictEqual(tasks[2].files[0].intent, 'create');
  });

  test('listUnresolvedPlanFileTargets returns only unresolved entries', async () => {
    const tasks = await resolvePlanFileTargets(samplePlan(), fileExists);
    const unresolved = listUnresolvedPlanFileTargets(tasks);
    assert.strictEqual(unresolved.length, 1);
    assert.strictEqual(unresolved[0].path, 'src/main.rs');
  });
});
