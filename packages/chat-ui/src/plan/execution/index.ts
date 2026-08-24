/**
 * Thin re-export — execution engine lives in @agent-k/plan.
 * diagnosticToWorkEvent stays in chat-ui (ConversationWorkEvent bridge).
 */

export * from '@agent-k/plan/execution';
export { diagnosticToWorkEvent } from './diagnosticToWorkEvent';
