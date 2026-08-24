/**
 * SHARED-PLAN-001 — Plan card / PlanDocument wire types (no business logic).
 *
 * Domain FSM lives in @agent-k/plan. Markdown is never SoT on the wire.
 */

/** How a task relates to a file. */
export type PlanFileIntent = 'read' | 'modify' | 'create';

export type PlanFileTargetResolution = 'resolved' | 'unresolved';

export interface PlanFileRef {
  path: string;
  intent: PlanFileIntent;
}

/** Runtime file target after workspace existence resolution. */
export interface PlanFileTarget extends PlanFileRef {
  exists?: boolean;
  resolution?: PlanFileTargetResolution;
}

/**
 * Task status on the card. `satisfied` = edit evidence; `verified` = verify passed.
 * Never conflate the two.
 */
export const TASK_STATUS_VALUES = [
  'pending',
  'in_progress',
  'blocked',
  'satisfied',
  'awaiting_verification',
  'verified',
  'failed',
] as const;

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  files: PlanFileTarget[];
  dependencies: string[];
  verification: string[];
  /** Present when session tracks live execution status on the card. */
  status?: TaskStatus;
}

export interface PlanRisk {
  id: string;
  risk: string;
  mitigation: string;
}

/** Structured plan — card / generate.result payload SoT. */
export interface PlanDocument {
  id: string;
  goal: string;
  summary: string;
  tasks: PlanTask[];
  risks: PlanRisk[];
  createdAt: number;
  /** Absolute workspace root when generated (host-side). */
  repoRoot?: string;
}

/** R-004 canonical phases (Work Order mapping). */
export const R004_PHASES = [
  'PlanCreated',
  'Researching',
  'Planned',
  'Reviewing',
  'Approved',
  'Executing',
  'Verifying',
  'Completed',
  'Failed',
  'Cancelled',
] as const;

export type R004Phase = (typeof R004_PHASES)[number];

/** PlanSession runtime phases (packages/plan). */
export const PLAN_SESSION_PHASES = [
  'idle',
  'research',
  'planning',
  'review',
  'executing',
  'completed',
  'failed',
] as const;

export type PlanSessionPhase = (typeof PLAN_SESSION_PHASES)[number];

/** Map session phase → nearest R-004 label (Verifying stays under executing + task status). */
export const SESSION_PHASE_TO_R004: Record<PlanSessionPhase, R004Phase> = {
  idle: 'PlanCreated',
  research: 'Researching',
  planning: 'Planned',
  review: 'Reviewing',
  executing: 'Executing',
  completed: 'Completed',
  failed: 'Failed',
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === 'string' &&
    (TASK_STATUS_VALUES as ReadonlyArray<string>).includes(value)
  );
}

export function isPlanSessionPhase(value: unknown): value is PlanSessionPhase {
  return (
    typeof value === 'string' &&
    (PLAN_SESSION_PHASES as ReadonlyArray<string>).includes(value)
  );
}
