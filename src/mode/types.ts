/**
 * Mode classifier types.
 * Loop/registry Mode stays in `src/agent/types.ts` — do not fork a second union.
 */
import type { Mode } from '../agent/types';

export type { Mode };

/** UI picker: a locked mode, or Auto (classify on send). */
export type ModePicker = Mode | 'auto';

export interface ModeDecision {
  mode: Mode;
  confidence: number;
  reason: string;
  sticky: boolean;
  source: 'sticky' | 'heuristic' | 'llm' | 'fallback' | 'manual';
}

export interface ClassifyInput {
  userMessage: string;
  previousMode?: Mode | null;
  /** Previous turn actually ran tools (agent/debug sticky). */
  previousWasActive?: boolean;
  /**
   * Plan V2 is in research / planning / review — keep plan unless the
   * user explicitly switches (do not sticky through build/execute).
   */
  planSessionActive?: boolean;
}

/** One user message + the assistant reply that followed it. */
export interface ConversationTurn {
  id: string;
  mode: Mode;
  userMessage: string;
  hadToolCalls: boolean;
  modeDecision?: ModeDecision;
  timestamp: number;
}
