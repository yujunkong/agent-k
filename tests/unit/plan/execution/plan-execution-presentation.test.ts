import * as assert from 'assert';
import { buildExecutionPlan } from '../../../../src/plan/execution/buildExecutionPlan.ts';
import {
  buildPlanExecutionSteps,
  formatPlanExecutionProgress,
  shouldShowPlanExecutionBar
} from '../../../../src/plan/execution/planExecutionPresentation.ts';
import {
  markTaskCompleted,
  markTaskRunning
} from '../../../../src/plan/execution/taskScheduler.ts';
import type { PlanDocument } from '../../../../src/plan/v2/schema';

function samplePlan(): PlanDocument {
  return {
    id: 'plan_ui',
    goal: 'JWT',
    summary: 'JWT',
    createdAt: 1,
    risks: [],
    tasks: [
      { id: 't1', title: 'Analyze authentication', description: 'd', files: [], dependencies: [], verification: [] },
      { id: 't2', title: 'Implement JWT middleware', description: 'd', files: [{ path: 'jwt.ts', intent: 'create' }], dependencies: ['t1'], verification: [] },
      { id: 't3', title: 'Add tests', description: 'd', files: [], dependencies: ['t2'], verification: [] },
      { id: 't4', title: 'Run verification', description: 'd', files: [], dependencies: ['t3'], verification: ['npm test'] }
    ]
  };
}

suite('planExecutionPresentation', () => {
  test('formatPlanExecutionProgress shows Executing N/total with active title', () => {
    let plan = buildExecutionPlan(samplePlan(), { status: 'executing' });
    plan = markTaskRunning(plan, 't1');
    const progress = formatPlanExecutionProgress(plan);
    assert.strictEqual(progress.current, 1);
    assert.strictEqual(progress.total, 4);
    assert.ok(progress.summary.includes('Executing 1/4'));
    assert.ok(progress.summary.includes('Analyze authentication'));
  });

  test('formatPlanExecutionProgress advances after first task completes', () => {
    let plan = buildExecutionPlan(samplePlan(), { status: 'executing' });
    plan = markTaskRunning(plan, 't1');
    plan = markTaskCompleted(plan, 't1');
    plan = markTaskRunning(plan, 't2');
    const progress = formatPlanExecutionProgress(plan);
    assert.ok(progress.summary.includes('Executing 2/4'));
    assert.ok(progress.summary.includes('Implement JWT middleware'));
  });

  test('buildPlanExecutionSteps marks running task as current', () => {
    let plan = buildExecutionPlan(samplePlan(), { status: 'executing' });
    plan = markTaskRunning(plan, 't1');
    const steps = buildPlanExecutionSteps(plan);
    assert.strictEqual(steps.find((step) => step.id === 't1')?.status, 'current');
    assert.strictEqual(steps.find((step) => step.id === 't2')?.status, 'pending');
  });

  test('shouldShowPlanExecutionBar hides draft plans', () => {
    const plan = buildExecutionPlan(samplePlan(), { status: 'approved' });
    assert.strictEqual(shouldShowPlanExecutionBar(plan), false);
    assert.strictEqual(shouldShowPlanExecutionBar({ ...plan, status: 'executing' }), true);
  });
});
