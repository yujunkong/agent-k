/**
 * SHARED-001 / common — Agent interaction modes.
 * Kept in shared so host, core, and chat-ui share one closed union (R-001 adjacent).
 */

/** Closed set of Agent-K interaction modes (Feature Master MODE-*). */
export type AgentMode = 'ask' | 'agent' | 'plan' | 'debug';

/** Plan FSM stages used in chat.send payloads (PLAN-* later). */
export type PlanStage = 'research' | 'questions' | 'planning' | 'review' | 'build';

/** Thinking effort levels for models that support extended thinking. */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high' | 'max';

/** Runtime check for AgentMode (no NLP / string guessing). */
export function isAgentMode(value: unknown): value is AgentMode {
  return value === 'ask' || value === 'agent' || value === 'plan' || value === 'debug';
}
