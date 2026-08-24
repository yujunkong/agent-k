import type { ExecutionPlan, ExecutionPlanTask } from './types';

export interface ExecutionPlanValidationIssue {
  code: 'unknown_dependency' | 'cycle' | 'duplicate_task_id' | 'empty_scope';
  message: string;
  taskId?: string;
}

export function validateExecutionPlanStructure(
  tasks: Pick<ExecutionPlanTask, 'id' | 'dependencies'>[]
): ExecutionPlanValidationIssue[] {
  const issues: ExecutionPlanValidationIssue[] = [];
  const ids = new Set<string>();

  for (const task of tasks) {
    if (ids.has(task.id)) {
      issues.push({
        code: 'duplicate_task_id',
        message: `Duplicate task id: ${task.id}`,
        taskId: task.id
      });
    }
    ids.add(task.id);
  }

  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!ids.has(dep)) {
        issues.push({
          code: 'unknown_dependency',
          message: `Task ${task.id} depends on unknown task ${dep}`,
          taskId: task.id
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (taskId: string, stack: string[]): void => {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      issues.push({
        code: 'cycle',
        message: `Dependency cycle detected: ${[...stack, taskId].join(' → ')}`,
        taskId
      });
      visiting.delete(taskId);
      return;
    }
    visiting.add(taskId);
    const task = tasks.find((item) => item.id === taskId);
    task?.dependencies.forEach((dep) => visit(dep, [...stack, taskId]));
    visiting.delete(taskId);
    visited.add(taskId);
  };

  for (const task of tasks) {
    visit(task.id, []);
  }

  return issues;
}

export function assertValidExecutionPlan(plan: ExecutionPlan): void {
  const issues = validateExecutionPlanStructure(plan.tasks);
  if (issues.length > 0) {
    const detail = issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid execution plan: ${detail}`);
  }
  if (plan.approvedTaskIds.length === 0 && plan.tasks.length === 0) {
    throw new Error('Invalid execution plan: no tasks');
  }
}
