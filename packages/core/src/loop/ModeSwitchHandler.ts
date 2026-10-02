/**
 * V31-TOOL-06 — switch_mode domain logic.
 * The loop owns the active mode for subsequent turns; Plan/Debug cannot self-escalate.
 * Single-responsibility: validate + describe the transition; the caller applies it.
 */

import type { AgentMode } from '@agent-k/shared';
import { isAgentMode } from '@agent-k/shared';
import { modeRegistry, type ModeConfig } from '../mode/ModeRegistry';

export interface ModeSwitchDecision {
  ok: boolean;
  /** Present only when ok — the validated target mode. */
  target?: AgentMode;
  error?: string;
  /** Mode config for the target (only when ok). */
  config?: ModeConfig;
}

/**
 * Decide whether `switch_mode(mode)` is allowed from `current`.
 * Mirrors v2.1: plan/debug are terminal for model-initiated switches
 * (Build starts only via the UI Approve & Execute; Debug stays in its FSM).
 */
export function decideModeSwitch(
  current: AgentMode,
  rawTarget: unknown,
): ModeSwitchDecision {
  const target = String(rawTarget ?? '')
    .trim()
    .toLowerCase();
  if (!isAgentMode(target)) {
    return {
      ok: false,
      error: `Invalid mode: "${target}". Valid modes: ask, agent, plan, debug`,
    };
  }
  if (current === 'plan') {
    return {
      ok: false,
      error:
        'In PLAN mode, switch_mode is disabled. Write/revise the plan only; the user must click Approve & Execute to build.',
    };
  }
  if (current === 'debug') {
    return {
      ok: false,
      error:
        'In DEBUG mode, switch_mode is disabled. Stay in the debug FSM through Cleanup.',
    };
  }
  return { ok: true, target, config: modeRegistry.getModeConfig(target) };
}
