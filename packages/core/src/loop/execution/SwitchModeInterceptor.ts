/**
 * V31-TOOL-06 / V31-QG2 — switch_mode interception, extracted from
 * AgentLoopController.executeToolCalls.
 *
 * The loop owns mode changes; the host tool executor is never called for
 * switch_mode. Plan/Debug cannot self-escalate (decideModeSwitch rejects).
 */

import type { AgentMode } from '@agent-k/shared';
import type { AgentLoopEvent } from '../AgentLoopController';
import { decideModeSwitch } from '../ModeSwitchHandler';

export interface SwitchModeOutcome {
  /** True when the tool call was intercepted as switch_mode. */
  handled: boolean;
  /** Tool-result body for the model. */
  body: string;
  /** Loop config updates to apply on success. */
  next?: { mode: AgentMode; systemPrompt: string; maxTurns: number };
  /** Event to emit after the tool message is pushed (turn added by caller). */
  event?: Omit<Extract<AgentLoopEvent, { type: 'mode_switch' }>, 'turn'>;
  ok: boolean;
  error?: string;
}

export function interceptSwitchMode(
  currentMode: AgentMode,
  rawTarget: unknown
): SwitchModeOutcome {
  const decision = decideModeSwitch(currentMode, rawTarget);
  if (decision.ok && decision.target && decision.config) {
    return {
      handled: true,
      ok: true,
      body: `Switched mode from "${currentMode}" to "${decision.target}". ${decision.config.description}`,
      next: {
        mode: decision.target,
        systemPrompt: decision.config.systemPrompt,
        maxTurns: decision.config.maxTurns,
      },
      event: { type: 'mode_switch', from: currentMode, to: decision.target },
    };
  }
  return {
    handled: true,
    ok: false,
    body: `Error: ${decision.error}`,
    error: decision.error,
  };
}
