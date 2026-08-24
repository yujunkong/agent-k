/**
 * EXEC-012 — Subagent task bridge (deps injected; no worktree apply here).
 * Uses structural types so @agent-k/plan does not depend on core/worktree packages.
 */

import type { ExecutionPlan, ExecutionPlanTask } from './types';
import { buildPlanTaskSubagentPrompt } from './planTaskPrompt';

/** Mirrors core SubagentRole for plan scheduling. */
export type PlanSubagentRole = 'coding' | 'explore' | 'verify' | string;

export type PlanSubagentWorktree = {
  path: string;
  branch?: string;
};

export type PlanSubagentTask = {
  id: string;
  status: string;
  error?: string;
  worktree?: PlanSubagentWorktree;
  errorCause?: unknown;
  errorDetail?: unknown;
};

export type SubagentHostLike = {
  create: (
    parentTurnId: string,
    prompt: string,
    role?: PlanSubagentRole,
  ) => PlanSubagentTask;
  run: (task: PlanSubagentTask) => Promise<PlanSubagentTask>;
};

export type SubagentWorktreeRegistrar = (
  subagentId: string,
  repoRoot: string,
  worktree: PlanSubagentWorktree,
) => void;

export interface SubagentErrorDetail {
  command?: string;
  cwd?: string;
  exitCode?: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  worktreePath?: string;
  branch?: string;
}

export interface PlanSubagentRunResult {
  success: boolean;
  subagentId?: string;
  worktreePath?: string;
  error?: string;
  errorDetail?: SubagentErrorDetail;
}

export function subagentRoleForPlanTask(_task: ExecutionPlanTask): PlanSubagentRole {
  return 'coding';
}

export async function runPlanTaskViaSubagent(
  plan: ExecutionPlan,
  task: ExecutionPlanTask,
  deps: {
    parentTurnId: string;
    subagentHost: SubagentHostLike;
    repoRoot?: string;
    registerWorktree?: SubagentWorktreeRegistrar;
  },
): Promise<PlanSubagentRunResult> {
  const prompt = buildPlanTaskSubagentPrompt(plan, task);
  const role = subagentRoleForPlanTask(task);
  const subagentTask = deps.subagentHost.create(deps.parentTurnId, prompt, role);
  const finished = await deps.subagentHost.run(subagentTask);

  if (finished.status === 'completed') {
    if (finished.worktree && deps.repoRoot && deps.registerWorktree) {
      deps.registerWorktree(finished.id, deps.repoRoot, finished.worktree);
    }
    return {
      success: true,
      subagentId: finished.id,
      worktreePath: finished.worktree?.path,
    };
  }

  return {
    success: false,
    subagentId: finished.id,
    worktreePath: finished.worktree?.path,
    error: finished.error ?? `Subagent ended with status ${finished.status}`,
    errorDetail: extractSubagentErrorDetail(finished),
  };
}

function extractSubagentErrorDetail(task: PlanSubagentTask): SubagentErrorDetail | undefined {
  const err = task.error;
  if (!err) return undefined;

  const detail: SubagentErrorDetail = {};
  let hasInfo = false;

  const cmdMatch = err.match(/Command failed:\s*(.+?)(?:\n|$)/);
  if (cmdMatch) {
    detail.command = cmdMatch[1].trim();
    hasInfo = true;
  }

  const rawCause = task.errorCause ?? task.errorDetail;
  if (rawCause && typeof rawCause === 'object') {
    const c = rawCause as Record<string, unknown>;
    if (typeof c.command === 'string') {
      detail.command = c.command;
      hasInfo = true;
    }
    if (typeof c.cwd === 'string') {
      detail.cwd = c.cwd;
      hasInfo = true;
    }
    if (typeof c.exitCode === 'number' || c.exitCode === null) {
      detail.exitCode = c.exitCode as number | null;
      hasInfo = true;
    }
    if (typeof c.signal === 'string' || c.signal === null) {
      detail.signal = c.signal as string | null;
      hasInfo = true;
    }
    if (typeof c.stdout === 'string') {
      detail.stdout = c.stdout.slice(0, 2000);
      hasInfo = true;
    }
    if (typeof c.stderr === 'string') {
      detail.stderr = c.stderr.slice(0, 2000);
      hasInfo = true;
    }
  }

  if (task.worktree) {
    detail.worktreePath = task.worktree.path;
    detail.branch = task.worktree.branch;
    hasInfo = true;
  }

  return hasInfo ? detail : undefined;
}

export function attachSubagentBinding(
  plan: ExecutionPlan,
  taskId: string,
  binding: { subagentId: string; worktreePath?: string },
): ExecutionPlan {
  return {
    ...plan,
    tasks: plan.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            subagentId: binding.subagentId,
            worktreePath: binding.worktreePath,
          }
        : t,
    ),
  };
}
