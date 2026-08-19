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
