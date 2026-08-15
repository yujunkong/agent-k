import * as assert from 'assert';
import { PlanSession } from '../../../../src/plan/v2/PlanSession';
import type { PlanDocument } from '../../../../src/plan/v2/schema';

function makePlan(): PlanDocument {
  return {
    id: 'plan_1',
    goal: 'Add JWT auth',
    summary: 'Add JWT auth',
    tasks: [
      {
        id: 'task-1',
        title: 'AuthService',
        description: 'd',
        files: [{ path: 'src/auth.ts', intent: 'create' }],
        dependencies: [],
        verification: ['npm test -- auth']
      },
      {
        id: 'task-2',
        title: 'Wire routes',
        description: 'd',
        files: [{ path: 'src/routes.ts', intent: 'modify' }],
        dependencies: ['task-1'],
        verification: []
      }
    ],
    risks: [],
    createdAt: Date.now()
  };
}

suite('Plan V2 — PlanSession', () => {
  test('plan.started moves phase to research and resets plan', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'do X', timestamp: 1 });
    assert.strictEqual(session.getPhase(), 'research');
    assert.strictEqual(session.getState().goal, 'do X');
  });


  test('starting a new plan clears prior rejection feedback and research', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'first', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'old research', timestamp: 2 });
    session.recordEvent({ type: 'plan.rejected', feedback: 'old feedback', timestamp: 3 });
    session.recordEvent({ type: 'plan.started', goal: 'second', timestamp: 4 });
    assert.strictEqual(session.getState().researchFindings, '');
    assert.strictEqual(session.getState().rejectionFeedback.length, 0);
    assert.strictEqual(session.getState().goal, 'second');
  });

  test('plan.generated seeds task status to pending and moves to review', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    assert.strictEqual(session.getPhase(), 'review');
    assert.strictEqual(session.getTaskStatus('task-1'), 'pending');
    assert.strictEqual(session.getTaskStatus('task-2'), 'pending');
  });

  test('plan.approved moves to executing', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    session.recordEvent({ type: 'plan.approved', timestamp: 3 });
    assert.strictEqual(session.getPhase(), 'executing');
  });

  test('plan.rejected stores feedback and returns to planning', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    session.recordEvent({ type: 'plan.rejected', feedback: 'DB 구조는 변경하면 안 돼', timestamp: 3 });
    assert.strictEqual(session.getPhase(), 'planning');
    assert.ok(session.getRejectionContextPrompt().includes('DB 구조는 변경하면 안 돼'));
  });

  test('valid task transition pending -> in_progress -> satisfied -> verified', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });

    session.recordEvent({ type: 'task.status.changed', taskId: 'task-1', from: 'pending', to: 'in_progress', timestamp: 3 });
    assert.strictEqual(session.getTaskStatus('task-1'), 'in_progress');

    session.recordEvent({ type: 'task.status.changed', taskId: 'task-1', from: 'in_progress', to: 'satisfied', timestamp: 4 });
    assert.strictEqual(session.getTaskStatus('task-1'), 'satisfied');

    session.recordEvent({ type: 'task.status.changed', taskId: 'task-1', from: 'satisfied', to: 'verified', timestamp: 5 });
    assert.strictEqual(session.getTaskStatus('task-1'), 'verified');
  });

  test('agent working out of order is recorded as evidence, not rejected', () => {
    // in_progress is observation — allowed even if deps are unmet.
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });

    assert.doesNotThrow(() => {
      session.recordEvent({ type: 'task.status.changed', taskId: 'task-2', from: 'pending', to: 'in_progress', timestamp: 3 });
    });
    assert.strictEqual(session.getTaskStatus('task-2'), 'in_progress');
  });

  test('completion-like status with unmet dependencies becomes blocked', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });

    session.recordEvent({
      type: 'task.status.changed',
      taskId: 'task-2',
      from: 'pending',
      to: 'satisfied',
      timestamp: 4
    });
    assert.strictEqual(session.getTaskStatus('task-2'), 'blocked');

    session.recordEvent({
      type: 'task.status.changed',
      taskId: 'task-2',
      from: 'blocked',
      to: 'awaiting_verification',
      timestamp: 5
    });
    assert.strictEqual(session.getTaskStatus('task-2'), 'blocked');

    session.recordEvent({
      type: 'task.status.changed',
      taskId: 'task-2',
      from: 'blocked',
      to: 'verified',
      timestamp: 6
    });
    assert.strictEqual(session.getTaskStatus('task-2'), 'blocked');
  });

  test('verifying a dependency unblocks a previously blocked dependent', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });

    session.recordEvent({
      type: 'task.status.changed',
      taskId: 'task-2',
      from: 'pending',
      to: 'satisfied',
      timestamp: 4
    });
    assert.strictEqual(session.getTaskStatus('task-2'), 'blocked');

    session.recordEvent({
      type: 'task.status.changed',
      taskId: 'task-1',
      from: 'pending',
      to: 'verified',
      timestamp: 5
    });
    assert.strictEqual(session.getTaskStatus('task-2'), 'pending');
  });

  test('a failed task remains eligible for retry once its dependencies are verified', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'f', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    session.recordEvent({ type: 'task.status.changed', taskId: 'task-1', from: 'pending', to: 'failed', timestamp: 4 });
    assert.strictEqual(session.getNextSuggestedTask()?.id, 'task-1');
  });

  test('getNextSuggestedTask respects dependency-on-verified, not just order', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });

    // task-2 depends on task-1; task-1 not verified yet -> suggest task-1
    assert.strictEqual(session.getNextSuggestedTask()?.id, 'task-1');

    session.recordEvent({ type: 'task.status.changed', taskId: 'task-1', from: 'pending', to: 'verified', timestamp: 3 });
    assert.strictEqual(session.getNextSuggestedTask()?.id, 'task-2');
  });

  test('isAllTasksVerified is true only once every task is verified', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    assert.strictEqual(session.isAllTasksVerified(), false);

    session.recordEvent({ type: 'task.status.changed', taskId: 'task-1', from: 'pending', to: 'verified', timestamp: 3 });
    session.recordEvent({ type: 'task.status.changed', taskId: 'task-2', from: 'pending', to: 'verified', timestamp: 4 });
    assert.strictEqual(session.isAllTasksVerified(), true);
  });

  test('manual verification completes a task without an automatic verification rule', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'f', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    session.recordEvent({ type: 'plan.approved', taskIds: ['task-2'], timestamp: 4 });
    session.recordEvent({ type: 'task.status.changed', taskId: 'task-1', from: 'pending', to: 'verified', timestamp: 5 });
    session.recordEvent({ type: 'task.status.changed', taskId: 'task-2', from: 'pending', to: 'awaiting_verification', timestamp: 6 });
    session.verifyTaskManually('task-2');
    assert.strictEqual(session.getTaskStatus('task-2'), 'verified');
    assert.strictEqual(session.isAllTasksVerified(), true);
  });

  test('serialization round-trips via toJSON/fromJSON', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    const restored = PlanSession.fromJSON(session.toJSON());
    assert.strictEqual(restored.getPhase(), session.getPhase());
    assert.deepStrictEqual(restored.getPlan(), session.getPlan());
  });

  // ─── Merged from the other Plan V2 implementation ─────────────────

  test('research.completed during executing updates findings and stays executing', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'found stuff', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    session.recordEvent({ type: 'plan.approved', timestamp: 4 });
    assert.strictEqual(session.getPhase(), 'executing');
    assert.doesNotThrow(() => {
      session.recordEvent({
        type: 'research.completed',
        findings: 'late clarifying answers',
        timestamp: 5
      });
      session.recordEvent({ type: 'plan.generation.attempt', attempt: 2, timestamp: 6 });
    });
    assert.strictEqual(session.getPhase(), 'executing');
    assert.strictEqual(session.getState().researchFindings, 'late clarifying answers');
  });

  test('illegal phase jump (idle -> executing) throws instead of silently applying', () => {
    const session = new PlanSession('s1');
    assert.throws(() => {
      session.recordEvent({ type: 'plan.approved', timestamp: 1 });
    }, /Illegal PlanSession phase transition/);
  });

  test('illegal phase jump (research -> executing, skipping review) throws', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    assert.throws(() => {
      session.recordEvent({ type: 'plan.approved', timestamp: 2 });
    }, /Illegal PlanSession phase transition/);
  });

  test('planning -> failed is legal (generation exhausted all retries)', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'f', timestamp: 2 });
    assert.doesNotThrow(() => {
      session.recordEvent({ type: 'plan.failed', reason: 'exhausted retries', timestamp: 3 });
    });
    assert.strictEqual(session.getPhase(), 'failed');
  });

  test('task.status.changed is exempt from the phase guard even with no plan', () => {
    const session = new PlanSession('s1');
    // no plan.started at all — still must not throw, just no-ops (task unknown)
    assert.doesNotThrow(() => {
      session.recordEvent({ type: 'task.status.changed', taskId: 'ghost', from: 'pending', to: 'verified', timestamp: 1 });
    });
  });

  test('onEvent listener receives every recorded event and can unsubscribe', () => {
    const session = new PlanSession('s1');
    const seen: string[] = [];
    const unsubscribe = session.onEvent((e) => seen.push(e.type));

    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'f', timestamp: 2 });
    assert.deepStrictEqual(seen, ['plan.started', 'research.completed']);

    unsubscribe();
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    assert.deepStrictEqual(seen, ['plan.started', 'research.completed']); // unchanged after unsubscribe
  });

  test('a listener throwing does not break session state changes', () => {
    const session = new PlanSession('s1');
    session.onEvent(() => {
      throw new Error('boom');
    });
    assert.doesNotThrow(() => {
      session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    });
    assert.strictEqual(session.getPhase(), 'research');
  });

  test('partial approval scopes isAllTasksVerified to only the approved tasks', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'f', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    // Approving task-1 keeps task-2 out of scope.
    session.recordEvent({ type: 'plan.approved', taskIds: ['task-1'], timestamp: 4 });

    assert.strictEqual(session.isAllTasksVerified(), false);
    session.recordEvent({ type: 'task.status.changed', taskId: 'task-1', from: 'pending', to: 'verified', timestamp: 5 });
    // task-2 was never approved, so the scoped set (task-1 only) is fully verified
    assert.strictEqual(session.isAllTasksVerified(), true);
  });


  test('partial approval automatically includes transitive prerequisites', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'f', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    session.recordEvent({ type: 'plan.approved', taskIds: ['task-2'], timestamp: 4 });
    assert.deepStrictEqual(session.getState().approvedTaskIds, ['task-1', 'task-2']);
  });

  test('empty taskIds on plan.approved means "all tasks" (default all-or-nothing)', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'f', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    session.recordEvent({ type: 'plan.approved', timestamp: 4 });

    session.recordEvent({ type: 'task.status.changed', taskId: 'task-1', from: 'pending', to: 'verified', timestamp: 5 });
    assert.strictEqual(session.isAllTasksVerified(), false); // task-2 still pending
    session.recordEvent({ type: 'task.status.changed', taskId: 'task-2', from: 'pending', to: 'verified', timestamp: 6 });
    assert.strictEqual(session.isAllTasksVerified(), true);
  });

  test('verifyTaskManually moves an awaiting_verification task to verified and can complete the plan', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'f', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    session.recordEvent({ type: 'plan.approved', timestamp: 4 });

    // task-2 depends on task-1 and has no automatic verification.
    session.recordEvent({ type: 'task.status.changed', taskId: 'task-1', from: 'pending', to: 'verified', timestamp: 5 });
    session.recordEvent({
      type: 'task.status.changed',
      taskId: 'task-2',
      from: 'pending',
      to: 'awaiting_verification',
      timestamp: 6
    });
    assert.strictEqual(session.getTaskStatus('task-2'), 'awaiting_verification');

    session.verifyTaskManually('task-2');
    assert.strictEqual(session.getTaskStatus('task-2'), 'verified');
    assert.strictEqual(session.isAllTasksVerified(), true);
  });

  test('verifyTaskManually throws for a task that is not awaiting verification', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'f', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });
    session.recordEvent({ type: 'plan.approved', timestamp: 4 });

    assert.throws(() => session.verifyTaskManually('task-1'), /not awaiting verification/);
  });

  test('verifyTaskManually throws for an unknown task id', () => {
    const session = new PlanSession('s1');
    session.recordEvent({ type: 'plan.started', goal: 'x', timestamp: 1 });
    session.recordEvent({ type: 'research.completed', findings: 'f', timestamp: 2 });
    session.recordEvent({ type: 'plan.generated', plan: makePlan(), attempt: 1, timestamp: 3 });

    assert.throws(() => session.verifyTaskManually('does-not-exist'), /Unknown task/);
  });
});
