import type { ExecutionPlan, ExecutionPlanTask, ExecutionTaskStatus, PlanExecutionStatus } from './types';

const TERMINAL_TASK_STATUSES: ExecutionTaskStatus[] = ['completed', 'failed'];

function clonePlan(plan: ExecutionPlan): ExecutionPlan {
  return {
    ...plan,
    tasks: plan.tasks.map((task) => ({ ...task }))
  };
}

function taskById(plan: ExecutionPlan): Map<string, ExecutionPlanTask> {
  return new Map(plan.tasks.map((task) => [task.id, task]));
}

function dependenciesMet(
  task: ExecutionPlanTask,
  tasks: Map<string, ExecutionPlanTask>
): boolean {
  return task.dependencies.every((depId) => {
    const dep = tasks.get(depId);
    return dep?.status === 'completed';
  });
}

function recomputePendingToReady(plan: ExecutionPlan): ExecutionPlan {
  const tasks = taskById(plan);
  let changed = false;

  for (const task of plan.tasks) {
    if (task.status !== 'pending') continue;
    if (!dependenciesMet(task, tasks)) continue;
    task.status = 'ready';
    changed = true;
  }

  return changed ? { ...plan, tasks: [...plan.tasks] } : plan;
}

function collectTransitiveDependents(
  plan: ExecutionPlan,
  rootTaskId: string
): Set<string> {
  const dependents = new Set<string>();
  const visit = (taskId: string) => {
    for (const task of plan.tasks) {
      if (!task.dependencies.includes(taskId)) continue;
      if (dependents.has(task.id)) continue;
      dependents.add(task.id);
      visit(task.id);
    }
  };
  visit(rootTaskId);
  return dependents;
}

function recomputePlanStatus(plan: ExecutionPlan): PlanExecutionStatus {
  const scoped = plan.tasks;
  if (scoped.length === 0) return plan.status;

  const allCompleted = scoped.every((task) => task.status === 'completed');
  if (allCompleted) return 'completed';

  const anyFailed = scoped.some((task) => task.status === 'failed');
  if (anyFailed) return 'failed';

  const anyActive = scoped.some(
    (task) => task.status === 'running' || task.status === 'ready'
  );
  const anyPending = scoped.some((task) => task.status === 'pending');
  if (anyActive || anyPending) return 'executing';

  return plan.status;
}

/** Tasks whose dependencies are satisfied and that may be dispatched. */
export function getReadyTasks(plan: ExecutionPlan): ExecutionPlanTask[] {
  return plan.tasks.filter((task) => task.status === 'ready');
}

/** Mark a ready task as running before dispatch (commit 3 entry point). */
export function markTaskRunning(plan: ExecutionPlan, taskId: string): ExecutionPlan {
  const next = clonePlan(plan);
  const task = next.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  if (task.status !== 'ready') {
    throw new Error(`Task ${taskId} is not ready (current: ${task.status}).`);
  }
  task.status = 'running';
  return { ...next, status: 'executing' };
}

/** Complete a running task and unlock dependents. */
export function markTaskCompleted(plan: ExecutionPlan, taskId: string): ExecutionPlan {
  const next = clonePlan(plan);
  const task = next.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  if (task.status !== 'running' && task.status !== 'ready') {
    throw new Error(`Task ${taskId} cannot complete from status ${task.status}.`);
  }

  task.status = 'completed';
  const unlocked = recomputePendingToReady(next);
  return { ...unlocked, status: recomputePlanStatus(unlocked) };
}

/** Fail a task and block transitive dependents. */
export function markTaskFailed(plan: ExecutionPlan, taskId: string): ExecutionPlan {
  const next = clonePlan(plan);
  const task = next.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  if (TERMINAL_TASK_STATUSES.includes(task.status)) {
    throw new Error(`Task ${taskId} is already terminal (${task.status}).`);
  }

  task.status = 'failed';
  const blockedIds = collectTransitiveDependents(next, taskId);
  for (const blocked of next.tasks) {
    if (!blockedIds.has(blocked.id)) continue;
    if (TERMINAL_TASK_STATUSES.includes(blocked.status)) continue;
    if (blocked.status === 'running') continue;
    blocked.status = 'blocked';
  }

  return { ...next, status: recomputePlanStatus(next) };
}

/** First ready task in plan order — sequential dispatch helper (commit 3). */
export function getNextRunnableTask(plan: ExecutionPlan): ExecutionPlanTask | null {
  const ready = getReadyTasks(plan);
  if (ready.length === 0) return null;
  const order = new Map(plan.tasks.map((task, index) => [task.id, index]));
  return ready.sort((a, b) => (order.get(a.id)! - order.get(b.id)!))[0];
}
