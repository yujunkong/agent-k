import type { PlanDocument, PlanTask } from '../session/schema';
import { inferTaskExecution } from './inferTaskExecution';
import type {
  ExecutionPlan,
  ExecutionPlanTask,
  ExecutionTaskStatus,
  PlanExecutionStatus
} from './types';
import { assertValidExecutionPlan } from './validateExecutionPlan';

export interface BuildExecutionPlanOptions {
  /** Defaults to `approved`. Pass `executing` once the scheduler starts. */
  status?: PlanExecutionStatus;
  /** Subset approval — empty means all tasks in the plan document. */
  approvedTaskIds?: string[];
  approvedAt?: number;
  /** Override delegate inference per task id. */
  executionOverrides?: Record<string, ExecutionPlanTask['execution']>;
}

function expandApprovalScope(tasks: PlanTask[], taskIds: string[]): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const scope = new Set<string>();
  const visit = (id: string) => {
    if (scope.has(id)) return;
    const task = byId.get(id);
    if (!task) return;
    scope.add(id);
    task.dependencies.forEach(visit);
  };
  taskIds.forEach(visit);
  return tasks.map((task) => task.id).filter((id) => scope.has(id));
}

function initialTaskStatus(
  task: PlanTask,
  scopedIds: Set<string>
): ExecutionTaskStatus {
  if (!scopedIds.has(task.id)) return 'blocked';
  const depsInScope = task.dependencies.filter((dep) => scopedIds.has(dep));
  const depsReady = depsInScope.length === 0;
  return depsReady ? 'ready' : 'pending';
}

function toExecutionTask(
  task: PlanTask,
  scopedIds: Set<string>,
  overrides?: Record<string, ExecutionPlanTask['execution']>
): ExecutionPlanTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dependencies: [...task.dependencies],
    files: task.files.map((file) => ({ ...file })),
    verification: [...task.verification],
    execution: overrides?.[task.id] ?? inferTaskExecution(task),
    status: initialTaskStatus(task, scopedIds)
  };
}

/**
 * Materialize an approved PlanDocument as an ExecutionPlan task graph.
 * Does not mutate PlanSession — pure conversion used after approve.
 */
export function buildExecutionPlan(
  plan: PlanDocument,
  options: BuildExecutionPlanOptions = {}
): ExecutionPlan {
  const approvedIds =
    options.approvedTaskIds && options.approvedTaskIds.length > 0
      ? expandApprovalScope(plan.tasks, options.approvedTaskIds)
      : plan.tasks.map((task) => task.id);
  const scopedIds = new Set(approvedIds);

  const tasks = plan.tasks
    .filter((task) => scopedIds.has(task.id))
    .map((task) => toExecutionTask(task, scopedIds, options.executionOverrides));

  const executionPlan: ExecutionPlan = {
    id: plan.id,
    goal: plan.goal,
    status: options.status ?? 'approved',
    tasks,
    approvedTaskIds: approvedIds,
    createdAt: plan.createdAt,
    approvedAt: options.approvedAt,
    repoRoot: plan.repoRoot
  };

  assertValidExecutionPlan(executionPlan);
  return executionPlan;
}
