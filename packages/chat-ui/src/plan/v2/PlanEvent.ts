/**
 * PlanEvent — explicit runtime events for Plan V2.
 *
 * The whole point of this file: nothing downstream should ever have to
 * guess "is this assistant message a Plan?" from openingLead/turnProse/
 * content the way chat/planPromote.ts does today. Every Plan state change
 * is an explicit, typed event instead.
 *
 * Scope note: this introduces `plan.generated` (and the surrounding
 * lifecycle events) as an ADDITIVE runtime event stream that PlanSession
 * consumes. It does not delete planPromote.ts or PlanModeController — see
 * PlanModeControllerAdapter.ts for how the old and new worlds coexist.
 */
import type { PlanDocument, TaskStatus } from './schema';
import type { FailureContext } from './FailureContext';
import type { ExecutionPlan, TaskExecutionDelegate } from '../execution/types';

export interface ToolEvidence {
  toolName: string;
  /** File path or command string the tool acted on, if applicable. */
  target?: string;
  success: boolean;
  timestamp: number;
}

export type PlanEvent =
  | { type: 'plan.started'; goal: string; timestamp: number }
  | { type: 'research.completed'; findings: string; timestamp: number }
  | { type: 'plan.generation.attempt'; attempt: number; timestamp: number }
  | { type: 'plan.generation.failed'; attempt: number; failure: FailureContext; timestamp: number }
  | { type: 'plan.generated'; plan: PlanDocument; attempt: number; timestamp: number }
  | { type: 'plan.review.opened'; timestamp: number }
  | { type: 'plan.approved'; taskIds?: string[]; timestamp: number }
  | { type: 'plan.rejected'; feedback: string; timestamp: number }
  | {
      type: 'task.status.changed';
      taskId: string;
      from: TaskStatus;
      to: TaskStatus;
      evidence?: ToolEvidence;
      timestamp: number;
    }
  | { type: 'plan.completed'; timestamp: number }
  | { type: 'plan.failed'; reason: string; timestamp: number }
  | { type: 'plan.execution.started'; executionPlan: ExecutionPlan; timestamp: number }
  | { type: 'plan.execution.updated'; executionPlan: ExecutionPlan; timestamp: number }
  | {
      type: 'task.execution.started';
      taskId: string;
      delegate: TaskExecutionDelegate;
      subagentId?: string;
      timestamp: number;
    }
  | {
      type: 'task.execution.completed';
      taskId: string;
      subagentId?: string;
      worktreePath?: string;
      timestamp: number;
    }
  | {
      type: 'task.execution.failed';
      taskId: string;
      error: string;
      subagentId?: string;
      timestamp: number;
    }
  | { type: 'plan.execution.cancelled'; reason?: string; timestamp: number };

export type PlanEventType = PlanEvent['type'];
