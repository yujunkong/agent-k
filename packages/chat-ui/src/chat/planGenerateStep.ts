/** Plan V2 JSON 생성 중 WorkTimeline에 올릴 고정 step id. */
import type { ConversationWorkEvent, ConversationWorkStatus } from './conversation/conversationWorkEvent';

export const PLAN_GENERATE_STEP_ID = 'tl_plan_v2_generate';

export function isPlanGenerateStep(step: { id?: string; title?: string; label?: string }): boolean {
  if (step.id === PLAN_GENERATE_STEP_ID) return true;
  return /계획 생성|Creating plan|Created plan|Failed to create plan/.test(
    String(step.title || step.label || '')
  );
}

export function planGenerateWorkEvent(
  status: ConversationWorkStatus,
  label?: string
): ConversationWorkEvent {
  const running = status === 'running' || status === 'pending';
  return {
    id: PLAN_GENERATE_STEP_ID,
    type: 'plan',
    status,
    label:
      label ||
      (status === 'error' ? 'Failed to create plan' : running ? 'Creating plan' : 'Created plan')
  };
}
