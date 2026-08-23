import type { SubagentRole, SubagentTask } from '@agent-k/core';
import type { SubagentWorktree } from '@agent-k/worktree';
import type { ExecutionPlan, ExecutionPlanTask } from './types';
import { buildPlanTaskSubagentPrompt } from './planTaskPrompt';

export type SubagentHostLike = {
  create: (parentTurnId: string, prompt: string, role?: SubagentRole) => SubagentTask;
  run: (task: SubagentTask) => Promise<SubagentTask>;
};

export type SubagentWorktreeRegistrar = (
  subagentId: string,
  repoRoot: string,
  worktree: SubagentWorktree
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

export function subagentRoleForPlanTask(_task: ExecutionPlanTask): SubagentRole {
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
  }
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
      worktreePath: finished.worktree?.path
    };
  }

  return {
    success: false,
    subagentId: finished.id,
    worktreePath: finished.worktree?.path,
    error: finished.error ?? `Subagent ended with status ${finished.status}`,
    errorDetail: extractSubagentErrorDetail(finished)
  };
}

function extractSubagentErrorDetail(task: SubagentTask): SubagentErrorDetail | undefined {
  const err = task.error;
  if (!err) return undefined;

  const detail: SubagentErrorDetail = {};
  let hasInfo = false;

  // Extract command info from error message pattern: "Command failed: <cmd>"
  const cmdMatch = err.match(/Command failed:\s*(.+?)(?:\n|$)/);
  if (cmdMatch) {
    detail.command = cmdMatch[1].trim();
    hasInfo = true;
  }

  // If the task has structured error data (e.g. from execSync failures)
  const rawCause = (task as any).errorCause ?? (task as any).errorDetail;
  if (rawCause && typeof rawCause === 'object') {
    if (typeof rawCause.command === 'string') { detail.command = rawCause.command; hasInfo = true; }
    if (typeof rawCause.cwd === 'string') { detail.cwd = rawCause.cwd; hasInfo = true; }
    if (typeof rawCause.exitCode === 'number' || rawCause.exitCode === null) { detail.exitCode = rawCause.exitCode; hasInfo = true; }
    if (typeof rawCause.signal === 'string' || rawCause.signal === null) { detail.signal = rawCause.signal; hasInfo = true; }
    if (typeof rawCause.stdout === 'string') { detail.stdout = rawCause.stdout.slice(0, 2000); hasInfo = true; }
    if (typeof rawCause.stderr === 'string') { detail.stderr = rawCause.stderr.slice(0, 2000); hasInfo = true; }
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
  binding: { subagentId: string; worktreePath?: string }
): ExecutionPlan {
  return {
    ...plan,
    tasks: plan.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            subagentId: binding.subagentId,
            worktreePath: binding.worktreePath
          }
        : task
    )
  };
}
