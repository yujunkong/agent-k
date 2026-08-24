/**
 * @agent-k/plan — Plan Card domain (PLAN2 + EXEC).
 *
 * SoT: PlanSession + PlanEvent. Markdown is render-only.
 * UI lives in chat-ui PlanCard; host invokes generate/execute.
 */

export * from './session';
export * from './execution';
export {
  createPlanWatchdog,
  PLAN_GENERATE_TIMEOUT_MS,
  PLAN_GENERATE_TIMEOUT_MESSAGE,
  type PlanWatchdog,
} from './watchdog';
export {
  persistPlanDocument,
  loadPlanDocument,
  planDocumentPath,
  planStorageDir,
  type PlanFs,
} from './storage';
export {
  generatePlanForHost,
  executePlanForHost,
  resolveWorkspaceRepoRoot,
  type GeneratePlanForHostParams,
  type ExecutePlanForHostParams,
} from './hostApi';
