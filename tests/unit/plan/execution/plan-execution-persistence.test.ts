import * as assert from 'assert';
import { buildExecutionPlan } from '../../../../src/plan/execution/buildExecutionPlan.ts';
import {
  finalizePlanExecution,
  getPersistedExecutionPlan,
  startPlanExecution,
  updatePlanExecutionSnapshot
} from '../../../../src/plan/execution/planExecutionPersistence.ts';
import { markTaskCompleted, markTaskRunning } from '../../../../src/plan/execution/taskScheduler.ts';
import { PlanModeControllerAdapter } from '../../../../src/plan/v2/PlanModeControllerAdapter.ts';
import { PlanSession } from '../../../../src/plan/v2/PlanSession.ts';
import type { PlanDocument } from '../../../../src/plan/v2/schema';

function linearPlan(): PlanDocument {
  return {
    id: 'plan_persist',
    goal: 'Persist execution',
    summary: 'Persist',
    createdAt: 1,
    risks: [],
    tasks: [
      { id: 't1', title: 'One', description: 'a', files: [], dependencies: [], verification: [] },
      { id: 't2', title: 'Two', description: 'b', files: [], dependencies: ['t1'], verification: [] }
    ]
  };
}

function approveSession(session: PlanSession, plan: PlanDocument): void {
  session.recordEvent({ type: 'plan.started', goal: plan.goal, timestamp: 1 });
  session.recordEvent({ type: 'research.completed', findings: 'x', timestamp: 2 });
  session.recordEvent({ type: 'plan.generated', plan, attempt: 1, timestamp: 3 });
  session.recordEvent({ type: 'plan.approved', timestamp: 4 });
}

suite('Plan execution — persistence', () => {
  test('execution snapshot round-trips through PlanSession.toJSON', () => {
    const session = new PlanSession('s1');
    approveSession(session, linearPlan());
    const executionPlan = buildExecutionPlan(linearPlan(), { status: 'executing' });
    startPlanExecution(session, executionPlan);

    let running = markTaskRunning(executionPlan, 't1');
    running = markTaskCompleted(running, 't1');
    updatePlanExecutionSnapshot(session, running);

    const restored = PlanSession.fromJSON(session.toJSON());
    const persisted = getPersistedExecutionPlan(restored);
    assert.ok(persisted);
    assert.strictEqual(persisted?.tasks.find((task) => task.id === 't1')?.status, 'completed');
    assert.strictEqual(persisted?.tasks.find((task) => task.id === 't2')?.status, 'ready');
  });

  test('finalizePlanExecution moves session to completed', () => {
    const session = new PlanSession('s1');
    approveSession(session, linearPlan());
    const done = buildExecutionPlan(linearPlan(), { status: 'completed' });
    finalizePlanExecution(session, done, 99);
    assert.strictEqual(session.getPhase(), 'completed');
    assert.strictEqual(session.getExecutionPlan()?.status, 'completed');
  });

  test('finalizePlanExecution records plan.failed on execution failure', () => {
    const session = new PlanSession('s1');
    approveSession(session, linearPlan());
    const failedPlan = buildExecutionPlan(linearPlan(), { status: 'executing' });
    failedPlan.tasks[0].status = 'failed';
    failedPlan.status = 'failed';
    session.recordEvent({
      type: 'task.execution.failed',
      taskId: 't1',
      error: 'boom',
      timestamp: 5
    });
    finalizePlanExecution(session, { ...failedPlan, status: 'failed' }, 6);
    assert.strictEqual(session.getPhase(), 'failed');
    assert.strictEqual(session.getExecutionError(), 'boom');
  });

  test('adapter resumes from persisted executionPlan', async () => {
    const adapter = new PlanModeControllerAdapter('s1');
    const plan = linearPlan();
    approveSession(adapter.session, plan);

    let runs = 0;
    const finalPlan = await adapter.runApprovedPlanExecution({
      parentTurnId: 'turn-1',
      subagentHost: {
        create: () => {
          throw new Error('unused');
        },
        run: async () => {
          throw new Error('unused');
        }
      },
      runMainTask: async () => {
        runs += 1;
        return { success: true };
      }
    });

    assert.strictEqual(finalPlan.status, 'completed');
    assert.strictEqual(runs, 2);
    assert.strictEqual(adapter.session.getPhase(), 'completed');

    const resumedRuns = await adapter.runApprovedPlanExecution({
      parentTurnId: 'turn-2',
      subagentHost: {
        create: () => {
          throw new Error('unused');
        },
        run: async () => {
          throw new Error('unused');
        }
      },
      runMainTask: async () => ({ success: true })
    });
    assert.strictEqual(resumedRuns.status, 'completed');
    assert.strictEqual(runs, 2);
  });
});
