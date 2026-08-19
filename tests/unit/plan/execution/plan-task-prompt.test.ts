import * as assert from 'assert';
import {
  buildMainPlanTaskPrompt,
  buildPlanTaskSubagentPrompt
} from '../../../../src/plan/execution/planTaskPrompt.ts';
import type { ExecutionPlan } from '../../../../src/plan/execution/types.ts';

const plan: ExecutionPlan = {
  id: 'p1',
  goal: 'JWT auth',
  status: 'executing',
  approvedTaskIds: ['t1'],
  createdAt: 1,
  tasks: [
    {
      id: 't1',
      title: 'Analyze auth',
      description: 'Review src/auth.ts',
      dependencies: [],
      execution: 'main',
      status: 'ready'
    }
  ]
};

suite('planTaskPrompt', () => {
  test('buildMainPlanTaskPrompt scopes to a single task', () => {
    const prompt = buildMainPlanTaskPrompt(plan, plan.tasks[0]);
    assert.ok(prompt.includes('Execute ONLY this approved plan task'));
    assert.ok(prompt.includes('Analyze auth'));
    assert.ok(prompt.includes('JWT auth'));
  });

  test('buildPlanTaskSubagentPrompt includes task id and goal', () => {
    const prompt = buildPlanTaskSubagentPrompt(plan, plan.tasks[0]);
    assert.ok(prompt.includes('# Plan task: t1'));
    assert.ok(prompt.includes('JWT auth'));
  });
});
