/**
 * V31-HARNESS-002 / V31-LOOP-01 / V31-QG2 — exit-gate nudge messages,
 * extracted from AgentLoopController.run. Behavior identical: an assistant
 * turn plus a user-role nudge that keeps the loop alive.
 */

import type { AgentMessage } from '../../types';

export function pushVerifyExitNudge(
  messages: AgentMessage[],
  content: string,
  nudge: string,
  turn: number
): void {
  messages.push({ role: 'assistant', content, metadata: { turn } });
  messages.push({
    role: 'user',
    content: nudge,
    metadata: { turn, type: 'verify_exit_nudge' },
  });
}

export const PHASE_EXIT_NUDGE =
  '[Phase] Verification is not done. Stay in verify/fix until edited paths are clean, then summarize.';

export function pushPhaseExitNudge(
  messages: AgentMessage[],
  content: string,
  turn: number
): void {
  messages.push({ role: 'assistant', content, metadata: { turn } });
  messages.push({
    role: 'user',
    content: PHASE_EXIT_NUDGE,
    metadata: { turn, type: 'phase_exit_nudge' },
  });
}
