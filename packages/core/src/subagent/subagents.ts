/**
 * SUB-001 / 007 / 008 / 009 — Subagent task model + lifecycle guard.
 * Transport-agnostic; host attaches runner/executor later.
 *
 * Worktree shapes match `@agent-k/worktree` structurally (no package dep).
 */

/** Isolated checkout for a subagent (SUB-014 binding). */
export type SubagentWorktree = {
  path: string;
  branch: string;
  base: string;
};

export type SubagentWorktreeSnapshot = {
  filesChanged: number;
  files: string[];
};

export type SubagentWorktreeBindings = {
  create: (taskId: string) => Promise<SubagentWorktree>;
  capture: (worktree: SubagentWorktree) => Promise<SubagentWorktreeSnapshot>;
};

export type SubagentStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** SUB-008 */
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
  /** Short UI label from task_run.description (3–5 words), Cursor-style. */
  description?: string;
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
  description?: string;
  worktree?: SubagentWorktree;
  worktreeSnapshot?: SubagentWorktreeSnapshot;
}

/** SUB-002 — create queued task (optionally with SUB-009 description). */
export function createSubagentTask(
  parentTurnId: string,
  prompt: string,
  role: SubagentRole = 'general',
  now = Date.now(),
  description?: string
): SubagentTask {
  const desc = String(description || '').trim();
  return {
    id: `subagent-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    parentTurnId,
    role,
    prompt: prompt.trim(),
    ...(desc ? { description: desc } : {}),
    status: 'queued',
    createdAt: now,
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
    status === 'completed' || status === 'failed' || status === 'cancelled'
  );
}

/**
 * SUB-007 — Guard lifecycle updates so a completed task cannot be resurrected.
 */
export function applySubagentPatch(
  task: SubagentTask,
  patch: SubagentTaskPatch
): SubagentTask {
  if (isTerminalSubagentStatus(task.status) && patch.status === 'running') {
    return task;
  }
  return patchSubagentTask(task, patch);
}
