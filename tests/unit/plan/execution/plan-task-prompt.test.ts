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
  repoRoot: '/workspace/agent-k',
  tasks: [
    {
      id: 't1',
      title: 'Analyze auth',
      description: 'Review src/auth.ts',
      dependencies: [],
      files: [{ path: 'src/auth.ts', intent: 'read', resolution: 'resolved', exists: true }],
      verification: ['npm test -- auth'],
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
    assert.ok(prompt.includes('Workspace root: /workspace/agent-k'));
    assert.ok(prompt.includes('src/auth.ts (read, exists)'));
    assert.ok(prompt.includes('Verification: npm test -- auth'));
  });
});
