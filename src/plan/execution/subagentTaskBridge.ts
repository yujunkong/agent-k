import type { SubagentRole, SubagentTask } from '../../agent/subagents';
import type { SubagentWorktree } from '../../agent/subagentWorktree';
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

export interface PlanSubagentRunResult {
  success: boolean;
  subagentId?: string;
  worktreePath?: string;
  error?: string;
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
    error: finished.error ?? `Subagent ended with status ${finished.status}`
  };
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
