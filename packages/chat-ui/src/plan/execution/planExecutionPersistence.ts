/**
 * Persist ExecutionPlan snapshots and task-level audit events on PlanSession.
 */
import type { PlanSession } from '../v2/PlanSession';
import type { ExecutionPlan, ExecutionPlanTask, TaskExecutionDelegate } from './types';

export function getPersistedExecutionPlan(session: PlanSession): ExecutionPlan | null {
  return session.getState().executionPlan;
}

export function startPlanExecution(
  session: PlanSession,
  executionPlan: ExecutionPlan,
  timestamp = Date.now()
): void {
  session.recordEvent({
    type: 'plan.execution.started',
    executionPlan: cloneExecutionPlan(executionPlan),
    timestamp
  });
}

export function updatePlanExecutionSnapshot(
  session: PlanSession,
  executionPlan: ExecutionPlan,
  timestamp = Date.now()
): void {
  session.recordEvent({
    type: 'plan.execution.updated',
    executionPlan: cloneExecutionPlan(executionPlan),
    timestamp
  });
}

export function recordTaskExecutionStarted(
  session: PlanSession,
  taskId: string,
  delegate: TaskExecutionDelegate,
  subagentId?: string,
  timestamp = Date.now()
): void {
  session.recordEvent({
    type: 'task.execution.started',
    taskId,
    delegate,
    subagentId,
    timestamp
  });
}

export function recordTaskExecutionCompleted(
  session: PlanSession,
  task: ExecutionPlanTask,
  timestamp = Date.now()
): void {
  session.recordEvent({
    type: 'task.execution.completed',
    taskId: task.id,
    subagentId: task.subagentId,
    worktreePath: task.worktreePath,
    timestamp
  });
}

export function recordTaskExecutionFailed(
  session: PlanSession,
  task: ExecutionPlanTask,
  error: string,
  timestamp = Date.now()
): void {
  session.recordEvent({
    type: 'task.execution.failed',
    taskId: task.id,
    error,
    subagentId: task.subagentId,
    timestamp
  });
}

export function cancelPlanExecution(
  session: PlanSession,
  reason?: string,
  timestamp = Date.now()
): void {
  session.recordEvent({ type: 'plan.execution.cancelled', reason, timestamp });
}

export function finalizePlanExecution(
  session: PlanSession,
  executionPlan: ExecutionPlan,
  timestamp = Date.now()
): void {
  updatePlanExecutionSnapshot(session, executionPlan, timestamp);
  if (executionPlan.status === 'completed') {
    session.recordEvent({ type: 'plan.completed', timestamp });
    return;
  }
  if (executionPlan.status === 'failed') {
    const reason =
      session.getState().executionError ??
      executionPlan.tasks.find((task) => task.status === 'failed')?.title ??
      'Plan execution failed';
    session.recordEvent({ type: 'plan.failed', reason, timestamp });
    return;
  }
  if (executionPlan.status === 'cancelled') {
    session.recordEvent({
      type: 'plan.failed',
      reason: session.getState().executionError ?? 'Plan execution cancelled',
      timestamp
    });
  }
}

function cloneExecutionPlan(plan: ExecutionPlan): ExecutionPlan {
  return JSON.parse(JSON.stringify(plan)) as ExecutionPlan;
}
