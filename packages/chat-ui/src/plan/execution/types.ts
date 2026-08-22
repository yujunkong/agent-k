/**
 * Execution layer — PlanDocument → runnable task graph.
 *
 * Plan V2 keeps `PlanDocument` / `PlanTask` as the approval-time source of
 * truth (LLM output + evidence semantics). This module adds a separate
 * execution view with scheduler-friendly statuses and delegate hints
 * (`main` vs `subagent`) without changing the LLM schema.
 *
 * Plan lifecycle (`PlanExecutionStatus`) and task lifecycle
 * (`ExecutionTaskStatus`) are intentionally separate from EvidenceEngine's
 * `TaskStatus` (pending / satisfied / verified / …).
 */

/** Who runs a task once it becomes ready. */
export type TaskExecutionDelegate = 'main' | 'subagent';

/** Plan-level lifecycle — distinct from PlanSession.phase and TaskStatus. */
export type PlanExecutionStatus =
  | 'draft'
  | 'reviewing'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Scheduler task lifecycle — distinct from evidence `TaskStatus`. */
export type ExecutionTaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked';

import type { PlanFileTarget } from '../v2/schema';

/** One runnable unit derived from an approved PlanTask. */
export interface ExecutionPlanTask {
  id: string;
  title: string;
  description: string;
  dependencies: string[];
  files: PlanFileTarget[];
  verification: string[];
  execution: TaskExecutionDelegate;
  status: ExecutionTaskStatus;
  /** Populated when execution starts (commit 3+). */
  subagentId?: string;
  /** Populated when a subagent worktree is allocated (commit 3+). */
  worktreePath?: string;
}

/** Approved plan materialized as a dependency-aware execution graph. */
export interface ExecutionPlan {
  id: string;
  goal: string;
  status: PlanExecutionStatus;
  tasks: ExecutionPlanTask[];
  /** Subset of task ids in execution scope (empty = all tasks). */
  approvedTaskIds: string[];
  createdAt: number;
  approvedAt?: number;
  /** Workspace root captured at plan generation — validated at execution. */
  repoRoot?: string;
}
