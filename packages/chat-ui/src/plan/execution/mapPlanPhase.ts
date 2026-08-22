import type { PlanPhase } from '../v2/PlanSession';
import type { PlanExecutionStatus } from './types';

/** Map PlanSession FSM phase → execution-plan lifecycle status. */
export function mapPlanPhaseToExecutionStatus(phase: PlanPhase): PlanExecutionStatus {
  switch (phase) {
    case 'idle':
    case 'research':
    case 'planning':
      return 'draft';
    case 'review':
      return 'reviewing';
    case 'executing':
      return 'executing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
