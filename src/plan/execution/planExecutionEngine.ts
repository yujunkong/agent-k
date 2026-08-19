import {
  getNextRunnableTask,
  markTaskCompleted,
  markTaskFailed,
  markTaskRunning
} from './taskScheduler';
import {
  attachSubagentBinding,
  runPlanTaskViaSubagent,
  type SubagentHostLike,
  type SubagentWorktreeRegistrar
} from './subagentTaskBridge';
import {
  executionIssueToTaskError,
  preflightTaskFiles,
  validateTaskExecutionLaunch,
  type TaskPreflightReport
} from './validateExecutionContext';
import type { ExecutionPlan, ExecutionPlanTask } from './types';

export type MainTaskRunner = (input: {
  plan: ExecutionPlan;
  task: ExecutionPlanTask;
}) => Promise<{ success: boolean; error?: string }>;

export type PlanExecutionHooks = {
  onTaskStarted?: (plan: ExecutionPlan, task: ExecutionPlanTask) => void;
  onTaskCompleted?: (plan: ExecutionPlan, task: ExecutionPlanTask) => void;
  onTaskFailed?: (plan: ExecutionPlan, task: ExecutionPlanTask, error: string) => void;
  onTaskPreflight?: (report: TaskPreflightReport) => void;
};

export type PlanExecutionDeps = {
  parentTurnId: string;
  subagentHost: SubagentHostLike;
  runMainTask: MainTaskRunner;
  repoRoot?: string;
  registerWorktree?: SubagentWorktreeRegistrar;
  hooks?: PlanExecutionHooks;
};

export type PlanExecutionStepResult = {
  plan: ExecutionPlan;
  executed: boolean;
  taskId?: string;
  error?: string;
};

/** Dispatch exactly one ready task (sequential v1). */
export async function executeNextPlanTask(
  plan: ExecutionPlan,
  deps: PlanExecutionDeps
): Promise<PlanExecutionStepResult> {
  const next = getNextRunnableTask(plan);
  if (!next) return { plan, executed: false };

  let current = markTaskRunning(plan, next.id);
  deps.hooks?.onTaskStarted?.(current, next);

  if (next.files.length > 0) {
    const preflightReport = preflightTaskFiles(current, next, deps.repoRoot);
    deps.hooks?.onTaskPreflight?.(preflightReport);

    if (preflightReport.blocked) {
      current = markTaskFailed(current, next.id);
      const error = executionIssueToTaskError(preflightReport.issue!);
      deps.hooks?.onTaskFailed?.(current, next, error);
      return { plan: current, executed: true, taskId: next.id, error };
    }
  }

  const contextIssue = validateTaskExecutionLaunch(current, next, deps.repoRoot);
  if (contextIssue) {
    current = markTaskFailed(current, next.id);
    const error = executionIssueToTaskError(contextIssue);
    deps.hooks?.onTaskFailed?.(current, next, error);
    return { plan: current, executed: true, taskId: next.id, error };
  }

  if (next.execution === 'subagent') {
    const subagentResult = await runPlanTaskViaSubagent(current, next, {
      parentTurnId: deps.parentTurnId,
      subagentHost: deps.subagentHost,
      repoRoot: deps.repoRoot,
      registerWorktree: deps.registerWorktree
    });

    if (subagentResult.subagentId) {
      current = attachSubagentBinding(current, next.id, {
        subagentId: subagentResult.subagentId,
        worktreePath: subagentResult.worktreePath
      });
    }

    if (subagentResult.success) {
      current = markTaskCompleted(current, next.id);
      deps.hooks?.onTaskCompleted?.(current, current.tasks.find((t) => t.id === next.id)!);
      return { plan: current, executed: true, taskId: next.id };
    }

    current = markTaskFailed(current, next.id);
    const error = subagentResult.error ?? 'Subagent task failed';
    deps.hooks?.onTaskFailed?.(current, next, error);
    return { plan: current, executed: true, taskId: next.id, error };
  }

  const mainResult = await deps.runMainTask({ plan: current, task: next });
  if (mainResult.success) {
    current = markTaskCompleted(current, next.id);
    deps.hooks?.onTaskCompleted?.(current, current.tasks.find((t) => t.id === next.id)!);
    return { plan: current, executed: true, taskId: next.id };
  }

  current = markTaskFailed(current, next.id);
  const error = mainResult.error ?? 'Main agent task failed';
  deps.hooks?.onTaskFailed?.(current, next, error);
  return { plan: current, executed: true, taskId: next.id, error };
}

/** Run tasks sequentially until the graph completes, fails, or stalls. */
export async function runPlanExecution(
  plan: ExecutionPlan,
  deps: PlanExecutionDeps
): Promise<ExecutionPlan> {
  if (
    plan.status === 'completed' ||
    plan.status === 'failed' ||
    plan.status === 'cancelled'
  ) {
    return plan;
  }

  let current: ExecutionPlan =
    plan.status === 'executing' ? plan : { ...plan, status: 'executing' };

  for (;;) {
    if (current.status !== 'executing') break;
    const step = await executeNextPlanTask(current, deps);
    current = step.plan;
    if (!step.executed) break;
  }
  return current;
}
