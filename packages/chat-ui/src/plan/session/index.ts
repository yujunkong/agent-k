/**
 * Thin re-export — Plan V2 domain lives in @agent-k/plan (Phase 6 extract).
 * PlanModeControllerAdapter stays here (V1 UI seam).
 */

export * from '@agent-k/plan/session';
export { PlanModeControllerAdapter } from './PlanModeControllerAdapter';
