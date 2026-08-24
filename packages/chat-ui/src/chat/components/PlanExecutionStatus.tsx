/**
 * Compact plan DAG execution progress — "Executing 2/4 · Task title"
 */
import React from 'react';
import type { ExecutionPlan } from '../../plan/execution';
import {
  buildPlanExecutionSteps,
  formatPlanExecutionProgress,
  isPlanExecutionActive
} from '../../plan/execution';
import { PlanningStatus, type PlanningStep } from './PlanningStatus';

interface PlanExecutionStatusProps {
  plan: ExecutionPlan;
}

export function PlanExecutionStatus({ plan }: PlanExecutionStatusProps) {
  const progress = formatPlanExecutionProgress(plan);
  const steps: PlanningStep[] = buildPlanExecutionSteps(plan);
  const active = isPlanExecutionActive(plan);

  return (
    <div className="ak-plan-execution-bar" role="status" aria-live="polite">
      <PlanningStatus
        steps={steps}
        isActive={active}
        mode={active ? 'executing' : plan.status === 'failed' ? 'idle' : 'executing'}
        title={progress.summary}
      />
    </div>
  );
}
