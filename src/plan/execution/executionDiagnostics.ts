/**
 * Structured execution diagnostics for Plan V2.
 *
 * Extends the Turn event pipeline — not a separate logger.
 * Every plan/task lifecycle change becomes a typed event with
 * consistent identifiers (turnId, planId, executionId, taskId).
 */

// ── Failure categories ──────────────────────────────────────────────

export type PlanFailureCategory =
  | 'validation'
  | 'preflight'
  | 'dependency'
  | 'model'
  | 'tool'
  | 'subagent'
  | 'worktree'
  | 'git'
  | 'filesystem'
  | 'timeout'
  | 'cancelled'
  | 'protocol'
  | 'scheduler'
  | 'internal'
  | 'unknown';

// ── Structured error ────────────────────────────────────────────────

export interface PlanExecutionError {
  name: string;
  message: string;
  code?: string;
  category: PlanFailureCategory;
  stack?: string;
  cause?: PlanExecutionError;
  retryable?: boolean;
}

export function normalizeExecutionError(
  error: unknown,
  category: PlanFailureCategory = 'unknown'
): PlanExecutionError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      category,
      stack: error.stack,
      cause: error.cause ? normalizeExecutionError(error.cause, category) : undefined
    };
  }
  return {
    name: 'UnknownError',
    message: String(error),
    category
  };
}

export function categorizePlanError(error: unknown): PlanFailureCategory {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const lower = msg.toLowerCase();
  if (lower.includes('file_not_found') || lower.includes('enoent') || lower.includes('not found at execution time')) return 'filesystem';
  if (lower.includes('preflight') || lower.includes('missing_target')) return 'preflight';
  if (lower.includes('repo') && lower.includes('mismatch')) return 'validation';
  if (lower.includes('worktree')) return 'worktree';
  if (lower.includes('subagent')) return 'subagent';
  if (lower.includes('timeout') || lower.includes('timed out')) return 'timeout';
  if (lower.includes('cancel')) return 'cancelled';
  if (lower.includes('git')) return 'git';
  if (lower.includes('dependency') || lower.includes('blocked')) return 'dependency';
  if (lower.includes('tool')) return 'tool';
  if (lower.includes('provider') || lower.includes('model') || lower.includes('llm')) return 'model';
  return 'unknown';
}

// ── Execution context ───────────────────────────────────────────────

export interface PlanExecutionContext {
  turnId: string;
  planId: string;
  executionId: string;
  taskId?: string;
  taskIndex?: number;
  taskCount?: number;
  parentTaskId?: string;
  subagentId?: string;
}

export function makeExecutionId(): string {
  return `exec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Event types ─────────────────────────────────────────────────────

export type PlanExecutionEventType =
  | 'plan.execution.started'
  | 'plan.execution.completed'
  | 'plan.execution.failed'
  | 'plan.task.ready'
  | 'plan.task.started'
  | 'plan.task.preflight'
  | 'plan.task.dispatched'
  | 'plan.task.progress'
  | 'plan.task.completed'
  | 'plan.task.failed'
  | 'plan.task.blocked'
  | 'plan.task.cancelled';

export type PlanEventStatus = 'ok' | 'error' | 'blocked' | 'cancelled' | 'running' | 'pending';

export interface PreflightTargetEntry {
  path: string;
  intent: string;
  planExists: boolean | undefined;
  executionExists: boolean;
  verdict: 'passed' | 'missing' | 'create' | 'blocked' | 'error';
}

export interface TaskFailureDetail {
  category: PlanFailureCategory;
  code?: string;
  name?: string;
  message: string;
  retryable?: boolean;
}

export interface PlanExecutionDiagnosticEvent {
  type: PlanExecutionEventType;
  turnId: string;
  planId: string;
  executionId: string;
  taskId?: string;
  taskIndex?: number;
  taskCount?: number;
  timestamp: number;
  status?: PlanEventStatus;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

// ── Concrete event shapes ───────────────────────────────────────────

export interface PlanExecutionStartedEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.execution.started';
  metadata: {
    taskCount: number;
    rootTaskIds: string[];
    repoRoot?: string;
  };
}

export interface PlanExecutionCompletedEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.execution.completed';
  metadata: {
    completed: number;
    failed: number;
    blocked: number;
    cancelled: number;
  };
}

export interface PlanExecutionFailedEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.execution.failed';
  metadata: {
    failedTaskIds: string[];
    completed: number;
    failed: number;
    blocked: number;
    reason: string;
  };
}

export interface TaskReadyEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.task.ready';
  metadata: {
    dependencies: string[];
    execution: string;
  };
}

export interface TaskStartedEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.task.started';
  metadata: {
    execution: string;
    title: string;
  };
}

export interface TaskPreflightEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.task.preflight';
  metadata: {
    repoRoot?: string;
    worktreePath?: string;
    effectiveRoot: string;
    targets: PreflightTargetEntry[];
    blocked: boolean;
  };
}

export interface TaskDispatchedEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.task.dispatched';
  metadata: {
    execution: string;
    subagentId?: string;
    repoRoot?: string;
    worktreePath?: string;
  };
}

export interface TaskProgressEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.task.progress';
  metadata: {
    phase: string;
    message?: string;
    progress?: number;
  };
}

export interface TaskCompletedEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.task.completed';
}

export interface TaskFailedEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.task.failed';
  metadata: {
    failure: TaskFailureDetail;
  };
}

export interface TaskBlockedEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.task.blocked';
  metadata: {
    blockedBy: string[];
    reason: string;
  };
}

export interface TaskCancelledEvent extends PlanExecutionDiagnosticEvent {
  type: 'plan.task.cancelled';
  metadata: {
    reason: string;
  };
}

export type AnyPlanDiagnosticEvent =
  | PlanExecutionStartedEvent
  | PlanExecutionCompletedEvent
  | PlanExecutionFailedEvent
  | TaskReadyEvent
  | TaskStartedEvent
  | TaskPreflightEvent
  | TaskDispatchedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskBlockedEvent
  | TaskCancelledEvent;

// ── Emitter interface ───────────────────────────────────────────────

export type PlanDiagnosticEmitter = (event: AnyPlanDiagnosticEvent) => void;

// ── Helpers ─────────────────────────────────────────────────────────

export function taskCountSummary(plan: {
  tasks: Array<{ status: string }>;
}): { completed: number; failed: number; blocked: number; cancelled: number } {
  let completed = 0;
  let failed = 0;
  let blocked = 0;
  let cancelled = 0;
  for (const t of plan.tasks) {
    if (t.status === 'completed') completed++;
    else if (t.status === 'failed') failed++;
    else if (t.status === 'blocked') blocked++;
    else if (t.status === 'cancelled') cancelled++;
  }
  return { completed, failed, blocked, cancelled };
}

export function formatDiagnosticEventLog(event: AnyPlanDiagnosticEvent): string {
  const parts: string[] = [event.type];
  if (event.taskId) {
    const idx = event.taskIndex != null ? `${event.taskIndex + 1}/${event.taskCount}` : '';
    parts.push(`${event.taskId}${idx ? ` (${idx})` : ''}`);
  }
  if (event.durationMs != null) parts.push(`${(event.durationMs / 1000).toFixed(1)}s`);
  if (event.status && event.status !== 'ok') parts.push(`status=${event.status}`);
  const meta = event.metadata;
  if (meta) {
    if ('execution' in meta) parts.push(`exec=${meta.execution}`);
    if ('category' in meta && typeof meta.category === 'string') parts.push(`category=${meta.category}`);
    if ('failure' in meta && typeof meta.failure === 'object' && meta.failure !== null) {
      const f = meta.failure as TaskFailureDetail;
      parts.push(`[${f.category}] ${f.message.slice(0, 120)}`);
    }
    if ('blocked' in meta && meta.blocked === true) parts.push('BLOCKED');
    if ('blockedBy' in meta && Array.isArray(meta.blockedBy)) parts.push(`blockedBy=${(meta.blockedBy as string[]).join(',')}`);
    if ('reason' in meta && typeof meta.reason === 'string') parts.push(meta.reason.slice(0, 80));
  }
  return parts.join(' | ');
}
