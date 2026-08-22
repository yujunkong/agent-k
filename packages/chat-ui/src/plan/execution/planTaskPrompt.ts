import type { ExecutionPlan, ExecutionPlanTask } from './types';
import { formatTaskFileTargets } from '../session/workspaceContext';

/** Prompt passed to the existing SubagentHost.create() path. */
export function buildPlanTaskSubagentPrompt(
  plan: ExecutionPlan,
  task: ExecutionPlanTask
): string {
  const lines = [
    `# Plan task: ${task.id}`,
    '',
    `Goal: ${plan.goal}`
  ];
  if (plan.repoRoot) {
    lines.push('', `Workspace root: ${plan.repoRoot}`);
  }
  lines.push('', `## ${task.title}`, task.description);
  if (task.files.length > 0) {
    lines.push('', `File targets: ${formatTaskFileTargets(task.files)}`);
  }
  if (task.verification.length > 0) {
    lines.push('', `Verification: ${task.verification.join('; ')}`);
  }
  if (task.dependencies.length > 0) {
    lines.push('', `Dependencies completed: ${task.dependencies.join(', ')}`);
  }
  return lines.join('\n');
}

/** Prompt for main-agent plan tasks (workspace root, not worktree). */
export function buildMainPlanTaskPrompt(
  plan: ExecutionPlan,
  task: ExecutionPlanTask
): string {
  return [
    'Execute ONLY this approved plan task. Do not skip ahead to later tasks.',
    '',
    buildPlanTaskSubagentPrompt(plan, task),
    '',
    'When finished, summarize what you did. Run verification steps for this task when listed.'
  ].join('\n');
}
