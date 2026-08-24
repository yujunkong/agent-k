import type { ExecutionPlan, ExecutionPlanTask } from './types';

export interface PlanExecutionProgress {
  current: number;
  total: number;
  activeTitle: string | null;
  summary: string;
}

export interface PlanExecutionStepView {
  id: string;
  label: string;
  status: 'pending' | 'current' | 'completed' | 'skipped' | 'error';
  detail?: string;
}

const TERMINAL: ExecutionPlanTask['status'][] = ['completed', 'failed', 'blocked'];

export function getActiveExecutionTask(plan: ExecutionPlan): ExecutionPlanTask | null {
  return (
    plan.tasks.find((task) => task.status === 'running') ??
    plan.tasks.find((task) => task.status === 'ready') ??
    null
  );
}

export function countCompletedExecutionTasks(plan: ExecutionPlan): number {
  return plan.tasks.filter((task) => task.status === 'completed').length;
}

/** Cursor-style headline: "Executing 2/4 · Implement JWT middleware" */
export function formatPlanExecutionProgress(plan: ExecutionPlan): PlanExecutionProgress {
  const total = plan.tasks.length;
  const done = countCompletedExecutionTasks(plan);
  const active = getActiveExecutionTask(plan);

  if (plan.status === 'completed') {
    return {
      current: total,
      total,
      activeTitle: null,
      summary: `Plan completed · ${total}/${total} tasks`
    };
  }

  if (plan.status === 'failed') {
    const failed = plan.tasks.find((task) => task.status === 'failed');
    return {
      current: done,
      total,
      activeTitle: failed?.title ?? null,
      summary: `Plan failed · ${done}/${total} tasks done`
    };
  }

  if (plan.status === 'cancelled') {
    return {
      current: done,
      total,
      activeTitle: null,
      summary: `Plan cancelled · ${done}/${total} tasks done`
    };
  }

  const current = active?.status === 'running' ? Math.min(done + 1, total) : Math.min(done + 1, total);
  const activeTitle = active?.title ?? null;
  const summary = activeTitle
    ? `Executing ${current}/${total} · ${activeTitle}`
    : `Executing ${current}/${total}`;

  return { current, total, activeTitle, summary };
}

export function buildPlanExecutionSteps(plan: ExecutionPlan): PlanExecutionStepView[] {
  return plan.tasks.map((task) => ({
    id: task.id,
    label: task.title,
    status:
      task.status === 'completed'
        ? 'completed'
        : task.status === 'running'
          ? 'current'
          : task.status === 'failed'
            ? 'error'
            : task.status === 'blocked'
              ? 'skipped'
              : 'pending',
    detail:
      task.execution === 'subagent'
        ? task.subagentId
          ? `Subagent · ${task.subagentId}`
          : 'Subagent'
        : 'Main agent'
  }));
}

export function shouldShowPlanExecutionBar(plan: ExecutionPlan | null): boolean {
  if (!plan) return false;
  return plan.status === 'executing' || plan.status === 'failed' || plan.status === 'completed';
}

export function isPlanExecutionActive(plan: ExecutionPlan | null): boolean {
  return plan?.status === 'executing';
}
