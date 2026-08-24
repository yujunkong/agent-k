import {
  getNextRunnableTask,
  getReadyTasks,
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
import {
  categorizePlanError,
  makeExecutionId,
  taskCountSummary,
  type AnyPlanDiagnosticEvent,
  type BlockedByEntry,
  type PlanDiagnosticEmitter,
  type PlanExecutionContext,
  type PlanRootCause,
  type PreflightTargetEntry,
  type TaskFailureDetail,
  type TaskFailureCause,
  type CommandFailureContext
} from './executionDiagnostics';

export type MainTaskRunner = (input: {
  plan: ExecutionPlan;
  task: ExecutionPlanTask;
}) => Promise<{ success: boolean; error?: string }>;

export type PlanExecutionHooks = {
  onTaskStarted?: (plan: ExecutionPlan, task: ExecutionPlanTask) => void;
  onTaskCompleted?: (plan: ExecutionPlan, task: ExecutionPlanTask) => void;
  onTaskFailed?: (plan: ExecutionPlan, task: ExecutionPlanTask, error: string) => void;
  onTaskPreflight?: (report: TaskPreflightReport) => void;
  onDiagnostic?: PlanDiagnosticEmitter;
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
  failure?: TaskFailureDetail;
};

/** Dispatch exactly one ready task (sequential v1). */
export async function executeNextPlanTask(
  plan: ExecutionPlan,
  deps: PlanExecutionDeps,
  ctx?: PlanExecutionContext
): Promise<PlanExecutionStepResult> {
  const next = getNextRunnableTask(plan);
  if (!next) return { plan, executed: false };

  const emitDiag = deps.hooks?.onDiagnostic;
  const tIdx = taskIndex(plan, next.id);
  const tCount = plan.tasks.length;
  const baseCtx = ctx ?? {
    turnId: deps.parentTurnId,
    planId: plan.id,
    executionId: ''
  };

  // task.started
  let current = markTaskRunning(plan, next.id);
  deps.hooks?.onTaskStarted?.(current, next);
  emitDiag?.({
    type: 'plan.task.started',
    ...baseCtx,
    taskId: next.id,
    taskIndex: tIdx,
    taskCount: tCount,
    timestamp: Date.now(),
    status: 'running',
    metadata: {
      execution: next.execution,
      title: next.title
    }
  });

  // preflight (only for tasks with file targets)
  if (next.files.length > 0) {
    const preflightReport = preflightTaskFiles(current, next, deps.repoRoot);
    deps.hooks?.onTaskPreflight?.(preflightReport);

    const targets: PreflightTargetEntry[] = preflightReport.entries.map((e) => ({
      path: e.path,
      intent: e.intent,
      planExists: e.planTimeExists,
      executionExists: e.executionTimeExists,
      verdict: e.verdict === 'ok'
        ? 'passed'
        : e.verdict === 'create_ok'
          ? 'create'
          : 'missing'
    }));

    emitDiag?.({
      type: 'plan.task.preflight',
      ...baseCtx,
      taskId: next.id,
      taskIndex: tIdx,
      taskCount: tCount,
      timestamp: Date.now(),
      status: preflightReport.blocked ? 'error' : 'ok',
      metadata: {
        repoRoot: preflightReport.repoRoot,
        worktreePath: preflightReport.worktreePath,
        effectiveRoot: preflightReport.effectiveRoot,
        targets,
        blocked: preflightReport.blocked
      }
    });

    if (preflightReport.blocked) {
      current = markTaskFailed(current, next.id);
      const error = executionIssueToTaskError(preflightReport.issue!);
      const failure = failureFromError(error, 'preflight');
      emitDiag?.({
        type: 'plan.task.failed',
        ...baseCtx,
        taskId: next.id,
        taskIndex: tIdx,
        taskCount: tCount,
        timestamp: Date.now(),
        status: 'error',
        metadata: { failure }
      });
      deps.hooks?.onTaskFailed?.(current, next, error);
      emitBlockedDependents(current, next.id, emitDiag, baseCtx, failure.code);
      return { plan: current, executed: true, taskId: next.id, error, failure };
    }
  }

  const contextIssue = validateTaskExecutionLaunch(current, next, deps.repoRoot);
  if (contextIssue) {
    current = markTaskFailed(current, next.id);
    const error = executionIssueToTaskError(contextIssue);
    const failure = failureFromError(error, 'validation');
    emitDiag?.({
      type: 'plan.task.failed',
      ...baseCtx,
      taskId: next.id,
      taskIndex: tIdx,
      taskCount: tCount,
      timestamp: Date.now(),
      status: 'error',
      metadata: { failure }
    });
    deps.hooks?.onTaskFailed?.(current, next, error);
    emitBlockedDependents(current, next.id, emitDiag, baseCtx, failure.code);
    return { plan: current, executed: true, taskId: next.id, error, failure };
  }

  // task.dispatched
  const dispatchTs = Date.now();
  emitDiag?.({
    type: 'plan.task.dispatched',
    ...baseCtx,
    taskId: next.id,
    taskIndex: tIdx,
    taskCount: tCount,
    timestamp: dispatchTs,
    status: 'running',
    metadata: {
      execution: next.execution,
      repoRoot: deps.repoRoot,
      worktreePath: next.worktreePath
    }
  });

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

    const durationMs = Date.now() - dispatchTs;

    if (subagentResult.success) {
      current = markTaskCompleted(current, next.id);
      emitDiag?.({
        type: 'plan.task.completed',
        ...baseCtx,
        taskId: next.id,
        taskIndex: tIdx,
        taskCount: tCount,
        timestamp: Date.now(),
        status: 'ok',
        durationMs,
        metadata: {}
      });
      deps.hooks?.onTaskCompleted?.(current, current.tasks.find((t) => t.id === next.id)!);
      return { plan: current, executed: true, taskId: next.id };
    }

    current = markTaskFailed(current, next.id);
    const error = subagentResult.error ?? 'Subagent task failed';
    const subagentCause = buildSubagentCause(subagentResult);
    const failure = failureFromError(error, 'subagent', subagentCause);
    emitDiag?.({
      type: 'plan.task.failed',
      ...baseCtx,
      taskId: next.id,
      taskIndex: tIdx,
      taskCount: tCount,
      timestamp: Date.now(),
      status: 'error',
      durationMs,
      metadata: { failure }
    });
    deps.hooks?.onTaskFailed?.(current, next, error);
    emitBlockedDependents(current, next.id, emitDiag, baseCtx, failure.code);
    return { plan: current, executed: true, taskId: next.id, error, failure };
  }

  // main task
  const mainResult = await deps.runMainTask({ plan: current, task: next });
  const durationMs = Date.now() - dispatchTs;

  if (mainResult.success) {
    current = markTaskCompleted(current, next.id);
    emitDiag?.({
      type: 'plan.task.completed',
      ...baseCtx,
      taskId: next.id,
      taskIndex: tIdx,
      taskCount: tCount,
      timestamp: Date.now(),
      status: 'ok',
      durationMs,
      metadata: {}
    });
    deps.hooks?.onTaskCompleted?.(current, current.tasks.find((t) => t.id === next.id)!);
    return { plan: current, executed: true, taskId: next.id };
  }

  current = markTaskFailed(current, next.id);
  const error = mainResult.error ?? 'Main agent task failed';
  const failure = failureFromError(error, categorizePlanError(error));
  emitDiag?.({
    type: 'plan.task.failed',
    ...baseCtx,
    taskId: next.id,
    taskIndex: tIdx,
    taskCount: tCount,
    timestamp: Date.now(),
    status: 'error',
    durationMs,
    metadata: { failure }
  });
  deps.hooks?.onTaskFailed?.(current, next, error);
  emitBlockedDependents(current, next.id, emitDiag, baseCtx, failure.code);
  return { plan: current, executed: true, taskId: next.id, error, failure };
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

  const emitDiag = deps.hooks?.onDiagnostic;
  const executionId = makeExecutionId();
  const ctx: PlanExecutionContext = {
    turnId: deps.parentTurnId,
    planId: plan.id,
    executionId
  };

  const startTs = Date.now();
  const rootTaskIds = getReadyTasks(plan).map((t) => t.id);
  emitDiag?.({
    type: 'plan.execution.started',
    ...ctx,
    timestamp: startTs,
    taskCount: plan.tasks.length,
    status: 'running',
    metadata: {
      taskCount: plan.tasks.length,
      rootTaskIds,
      repoRoot: plan.repoRoot
    }
  });

  // Emit initial ready events
  for (const readyTask of rootTaskIds) {
    const t = plan.tasks.find((task) => task.id === readyTask);
    if (t) {
      emitDiag?.({
        type: 'plan.task.ready',
        ...ctx,
        taskId: t.id,
        taskIndex: taskIndex(plan, t.id),
        taskCount: plan.tasks.length,
        timestamp: Date.now(),
        status: 'pending',
        metadata: {
          dependencies: t.dependencies,
          execution: t.execution
        }
      });
    }
  }

  let current: ExecutionPlan =
    plan.status === 'executing' ? plan : { ...plan, status: 'executing' };

  const taskFailures = new Map<string, TaskFailureDetail>();

  for (;;) {
    if (current.status !== 'executing') break;

    // Emit ready events for newly unlocked tasks
    const ready = getReadyTasks(current);
    for (const readyTask of ready) {
      if (readyTask.status === 'ready') {
        emitDiag?.({
          type: 'plan.task.ready',
          ...ctx,
          taskId: readyTask.id,
          taskIndex: taskIndex(current, readyTask.id),
          taskCount: current.tasks.length,
          timestamp: Date.now(),
          status: 'pending',
          metadata: {
            dependencies: readyTask.dependencies,
            execution: readyTask.execution
          }
        });
      }
    }

    const step = await executeNextPlanTask(current, deps, ctx);
    current = step.plan;
    if (step.failure && step.taskId) {
      taskFailures.set(step.taskId, step.failure);
    }
    if (!step.executed) break;
  }

  const durationMs = Date.now() - startTs;
  const summary = taskCountSummary(current);

  if (current.status === 'completed') {
    emitDiag?.({
      type: 'plan.execution.completed',
      ...ctx,
      timestamp: Date.now(),
      status: 'ok',
      durationMs,
      metadata: summary
    });
  } else if (current.status === 'failed') {
    const failedIds = current.tasks.filter((t) => t.status === 'failed').map((t) => t.id);
    const primaryTaskId = failedIds[0];
    const primaryFailure = primaryTaskId ? taskFailures.get(primaryTaskId) : undefined;
    const rootCause: PlanRootCause | undefined = primaryTaskId && primaryFailure
      ? {
          taskId: primaryTaskId,
          category: primaryFailure.category,
          code: primaryFailure.code,
          message: primaryFailure.message,
          cause: primaryFailure.cause
        }
      : undefined;
    emitDiag?.({
      type: 'plan.execution.failed',
      ...ctx,
      timestamp: Date.now(),
      status: 'error',
      durationMs,
      metadata: {
        failedTaskIds: failedIds,
        ...summary,
        reason: `${failedIds.length} task(s) failed: ${failedIds.join(', ')}`,
        rootCause
      }
    });
  }

  return current;
}

// ── Internal helpers ────────────────────────────────────────────────

function failureFromError(
  error: string | Error,
  category: import('./executionDiagnostics').PlanFailureCategory,
  causeOverride?: TaskFailureCause
): TaskFailureDetail {
  const message = typeof error === 'string' ? error : error.message;
  const code = inferFailureCode(message, category);

  let cause = causeOverride;
  if (!cause && typeof error !== 'string' && error.cause) {
    cause = extractCauseFromError(error.cause);
  }

  return {
    category,
    code,
    name: typeof error !== 'string' ? error.name : undefined,
    message,
    retryable: false,
    cause
  };
}

function inferFailureCode(message: string, category: import('./executionDiagnostics').PlanFailureCategory): string | undefined {
  const lower = message.toLowerCase();
  if (category === 'subagent' || category === 'worktree') {
    if (lower.includes('worktree')) return 'WORKTREE_CREATE_FAILED';
    if (lower.includes('spawn')) return 'SUBAGENT_SPAWN_FAILED';
  }
  if (category === 'git') {
    if (lower.includes('worktree add')) return 'GIT_WORKTREE_ADD_FAILED';
    if (lower.includes('merge')) return 'GIT_MERGE_FAILED';
    if (lower.includes('checkout')) return 'GIT_CHECKOUT_FAILED';
  }
  if (category === 'filesystem') return 'FILE_NOT_FOUND';
  if (category === 'timeout') return 'EXECUTION_TIMEOUT';
  if (category === 'preflight') return 'PREFLIGHT_BLOCKED';
  if (category === 'validation') return 'VALIDATION_FAILED';
  return undefined;
}

function extractCauseFromError(cause: unknown): TaskFailureCause | undefined {
  if (!cause) return undefined;
  if (cause instanceof Error) {
    const cat = categorizePlanError(cause);
    const result: TaskFailureCause = {
      category: cat,
      code: inferFailureCode(cause.message, cat),
      message: cause.message
    };
    if (cause.cause) {
      result.cause = extractCauseFromError(cause.cause);
    }
    return result;
  }
  if (typeof cause === 'object' && cause !== null) {
    const obj = cause as Record<string, unknown>;
    if (typeof obj.message === 'string' || typeof obj.command === 'string') {
      return buildCauseFromCommandResult(obj);
    }
  }
  return undefined;
}

function buildCauseFromCommandResult(obj: Record<string, unknown>): TaskFailureCause {
  const cat = typeof obj.command === 'string' && (obj.command as string).toLowerCase().includes('git') ? 'git' : 'internal';
  const cause: TaskFailureCause = {
    category: cat,
    code: inferFailureCode(String(obj.message ?? obj.command ?? ''), cat),
    message: typeof obj.message === 'string' ? obj.message : undefined
  };
  if (typeof obj.command === 'string') {
    cause.command = {
      command: obj.command as string,
      cwd: typeof obj.cwd === 'string' ? obj.cwd : undefined,
      exitCode: typeof obj.exitCode === 'number' ? obj.exitCode : (obj.exitCode === null ? null : undefined),
      signal: typeof obj.signal === 'string' ? obj.signal : (obj.signal === null ? null : undefined),
      stdout: typeof obj.stdout === 'string' ? (obj.stdout as string).slice(0, 2000) : undefined,
      stderr: typeof obj.stderr === 'string' ? (obj.stderr as string).slice(0, 2000) : undefined
    };
  }
  return cause;
}

function emitBlockedDependents(
  plan: ExecutionPlan,
  failedTaskId: string,
  emitDiag: PlanDiagnosticEmitter | undefined,
  ctx: PlanExecutionContext,
  failureCode?: string
): void {
  if (!emitDiag) return;
  for (const task of plan.tasks) {
    if (task.status === 'blocked' && task.dependencies.includes(failedTaskId)) {
      const blockedByDetails: BlockedByEntry[] = [{
        taskId: failedTaskId,
        status: 'failed',
        failureCode
      }];
      emitDiag({
        type: 'plan.task.blocked',
        ...ctx,
        taskId: task.id,
        taskIndex: taskIndex(plan, task.id),
        taskCount: plan.tasks.length,
        timestamp: Date.now(),
        status: 'blocked',
        metadata: {
          blockedBy: [failedTaskId],
          blockedByDetails,
          reason: 'dependency_failed'
        }
      });
    }
  }
}

function buildSubagentCause(result: import('./subagentTaskBridge').PlanSubagentRunResult): TaskFailureCause | undefined {
  if (!result.errorDetail && !result.error) return undefined;
  const detail = result.errorDetail;
  if (detail?.command) {
    return {
      category: detail.command.toLowerCase().includes('git') ? 'git' : 'internal',
      code: inferFailureCode(detail.command, detail.command.toLowerCase().includes('git') ? 'git' : 'internal'),
      message: result.error,
      command: {
        command: detail.command,
        cwd: detail.cwd,
        exitCode: detail.exitCode,
        signal: detail.signal,
        stdout: detail.stdout?.slice(0, 2000),
        stderr: detail.stderr?.slice(0, 2000),
        worktreePath: detail.worktreePath,
        branch: detail.branch
      }
    };
  }
  return undefined;
}

function taskIndex(plan: ExecutionPlan, taskId: string): number {
  return plan.tasks.findIndex((t) => t.id === taskId);
}
