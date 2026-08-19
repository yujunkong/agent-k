import {
  assertMatchingRepoRoot,
  formatTaskFileTargets,
  unresolvedModifyOrReadTargets
} from '../v2/workspaceContext';
import type { PlanFileTarget } from '../v2/schema';
import type { ExecutionPlan, ExecutionPlanTask } from './types';

export interface ExecutionContextIssue {
  code: 'REPO_ROOT_MISMATCH' | 'UNRESOLVED_TASK_TARGETS';
  message: string;
}

export function validateExecutionPlanContext(
  plan: ExecutionPlan,
  actualRepoRoot?: string
): ExecutionContextIssue | null {
  if (plan.repoRoot && actualRepoRoot) {
    try {
      assertMatchingRepoRoot({
        expected: plan.repoRoot,
        actual: actualRepoRoot,
        stage: 'execution'
      });
    } catch (error) {
      return {
        code: 'REPO_ROOT_MISMATCH',
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  return null;
}

export function validateTaskExecutionLaunch(
  plan: ExecutionPlan,
  task: ExecutionPlanTask,
  actualRepoRoot?: string
): ExecutionContextIssue | null {
  const planIssue = validateExecutionPlanContext(plan, actualRepoRoot);
  if (planIssue) return planIssue;

  const unresolved = unresolvedModifyOrReadTargets(task.files);
  if (unresolved.length === 0) return null;

  const root = plan.repoRoot || actualRepoRoot || '(unknown workspace root)';
  const paths = unresolved.map((file) => file.path).join(', ');
  return {
    code: 'UNRESOLVED_TASK_TARGETS',
    message:
      `Task "${task.id}" targets are not present under workspace root ${root}: ${paths}. ` +
      `Planner file refs: ${formatTaskFileTargets(task.files)}. ` +
      'Discover the correct paths in this repository or update the plan — these paths may be from a different project structure.'
  };
}

export function executionIssueToTaskError(issue: ExecutionContextIssue): string {
  return issue.message;
}

/** Exported for tests — surfaces unresolved targets without blocking when policy allows. */
export function listUnresolvedExecutionTargets(task: {
  files: PlanFileTarget[];
}): PlanFileTarget[] {
  return unresolvedModifyOrReadTargets(task.files);
}
