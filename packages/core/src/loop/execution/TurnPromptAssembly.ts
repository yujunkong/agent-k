/**
 * V31-QG2 — per-turn system prompt assembly, extracted from AgentLoopController.
 *
 * Layering (single source, never stacked twice):
 *   base (host/mode) → problem frame → loop phase.
 * Sticky context (rules/plan/todos) is appended by the ContextAssembler.
 */

import type { IntentKind } from '@agent-k/shared';
import type { LoopPhase } from '../phases';
import { injectProblemFramePrompt } from '../frame';
import { injectPhasePrompt } from '../../harness/PhasePromptInjector';

export interface TurnPromptLayerInput {
  baseSystem: string;
  intentKind?: IntentKind;
  tracksFrame: boolean;
  shouldTrackPhase: boolean;
  phase: LoopPhase;
}

export function buildTurnSystemPrompt(input: TurnPromptLayerInput): string {
  const framed = input.tracksFrame
    ? injectProblemFramePrompt(input.baseSystem, input.intentKind!)
    : input.baseSystem;
  return input.shouldTrackPhase
    ? injectPhasePrompt(framed, input.phase)
    : framed;
}

/** Sticky context is re-injected every turn; empty pieces are dropped. */
export function joinStickyContext(
  parts: Array<string | undefined | null>
): string | undefined {
  return parts.filter(Boolean).join('\n\n') || undefined;
}
