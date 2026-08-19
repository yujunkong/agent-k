import type { ExecutionPlan, ExecutionPlanTask } from './types';

/** Prompt passed to the existing SubagentHost.create() path. */
export function buildPlanTaskSubagentPrompt(
  plan: ExecutionPlan,
  task: ExecutionPlanTask
): string {
  const lines = [
    `# Plan task: ${task.id}`,
    '',
    `Goal: ${plan.goal}`,
    '',
    `## ${task.title}`,
    task.description
  ];
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
