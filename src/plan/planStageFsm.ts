/**
 * Plan stage advance — optional tool after the plan document is ready.
 * Only planning → review (UI Confirm still owns build).
 */
import type { PlanStage } from './PlanModeController';

export type PlanAdvanceTarget = 'review';

export type PlanAdvanceResult =
  | { ok: true; stage: PlanAdvanceTarget }
  | { ok: false; error: string };

/**
 * Model may call plan_next_stage once after writing the plan.
 * Research/questions advances stay UI-driven (ask_question / Complete Questions).
 */
export function resolvePlanAdvance(
  from: PlanStage,
  to?: PlanAdvanceTarget | string
): PlanAdvanceResult {
  if (from === 'review' || from === 'build') {
    return {
      ok: false,
      error:
        from === 'review'
          ? 'Already in review. Wait for the user Confirm / Reject.'
          : 'Already in build.'
    };
  }
  if (from !== 'planning') {
    return {
      ok: false,
      error:
        'plan_next_stage is only for after the plan document is written (planning → review). Use ask_question / UI for earlier stages.'
    };
  }
  if (to && to !== 'review') {
    return {
      ok: false,
      error: 'Only to: "review" is allowed from planning.'
    };
  }
  return { ok: true, stage: 'review' };
}
