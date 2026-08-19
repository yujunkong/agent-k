/**
 * Structured subagent task lifecycle.
 *
 * This is deliberately transport-agnostic: the host/agent loop can attach a
 * runner later without coupling UI state to a specific model provider.
 */

import type {
  SubagentWorktree,
  SubagentWorktreeSnapshot
} from './subagentWorktree';

export type SubagentStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SubagentRole =
  | 'research'
  | 'coding'
  | 'review'
  | 'debug'
  | 'general';

export interface SubagentTask {
  id: string;
  parentTurnId: string;
  role: SubagentRole;
  prompt: string;
  status: SubagentStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;
  worktree?: SubagentWorktree;
  worktreeSnapshot?: SubagentWorktreeSnapshot;
}

export interface SubagentTaskPatch {
  status?: SubagentStatus;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;
  worktree?: SubagentWorktree;
  worktreeSnapshot?: SubagentWorktreeSnapshot;
}

export function createSubagentTask(
  parentTurnId: string,
  prompt: string,
  role: SubagentRole = 'general',
  now = Date.now()
): SubagentTask {
  return {
    id: `subagent-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    parentTurnId,
    role,
    prompt: prompt.trim(),
    status: 'queued',
    createdAt: now
  };
}

/** Apply one lifecycle transition without mutating the original task. */
export function patchSubagentTask(
  task: SubagentTask,
  patch: SubagentTaskPatch
): SubagentTask {
  const next: SubagentTask = { ...task, ...patch };

  if (patch.status === 'running' && next.startedAt == null) {
    next.startedAt = Date.now();
  }

  if (
    patch.status === 'completed' ||
    patch.status === 'failed' ||
    patch.status === 'cancelled'
  ) {
    if (next.completedAt == null) next.completedAt = Date.now();
  }

  return next;
}

export function isTerminalSubagentStatus(status: SubagentStatus): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}

/** Guard lifecycle updates so a completed task cannot be resurrected. */
export function applySubagentPatch(
  task: SubagentTask,
  patch: SubagentTaskPatch
): SubagentTask {
  if (isTerminalSubagentStatus(task.status) && patch.status === 'running') {
    return task;
  }
  return patchSubagentTask(task, patch);
}
