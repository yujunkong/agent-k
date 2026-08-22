/**
 * STREAM-002 — Turn status derivation (chat-ui).
 *
 * Currently **not wired** into MessageBubble (user preference: pre-phase UI —
 * no understanding|planning|exploring|… rail/label). Logic + unit tests kept
 * for optional later re-enable; do not import from MessageBubble until then.
 *
 * Runtime turn SM remains `packages/core` REL-004 (`TurnStateMachine`).
 */

export type TurnStatus =
  | 'understanding'
  | 'planning'
  | 'exploring'
  | 'executing'
  | 'testing'
  | 'completed'
  | 'error';

export const TURN_STATUS_LABEL: Record<TurnStatus, string> = {
  understanding: 'Understanding',
  planning: 'Planning',
  exploring: 'Exploring',
  executing: 'Editing',
  testing: 'Testing',
  completed: 'Done',
  error: 'Error'
};

/** Ordered for a linear progress rail (Phase 5 UI) — not used for derivation itself. */
export const TURN_STATUS_ORDER: TurnStatus[] = [
  'understanding',
  'planning',
  'exploring',
  'executing',
  'testing',
  'completed'
];

const EXPLORE_KINDS = new Set(['searching', 'reading', 'browsing']);
const EXECUTE_KINDS = new Set(['editing', 'running']);

/**
 * No 'testing' kind exists on the wire (TimelineDelta.kind has no such
 * value — adding one is a host-side change, out of scope for this phase).
 * Instead, a running/most-recent 'running' step is reclassified as
 * 'testing' when its command looks like a test runner. Heuristic, not
 * exact — same tradeoff class as the other webview classifiers.
 */
const TEST_COMMAND_RE =
  /\b(npm\s+(run\s+)?test|yarn\s+test|pnpm\s+test|pytest|jest|mocha|vitest|go\s+test|cargo\s+test|mvn\s+test|gradle\s+test|ctest|rspec)\b/i;

export interface TurnStateStep {
  kind: string;
  itemStatus: 'running' | 'done' | 'error';
  toolName?: string;
  label?: string;
  detail?: string;
}

export interface TurnStateMessage {
  status?: string;
  steps?: TurnStateStep[];
}

function isTestishStep(step: TurnStateStep): boolean {
  if (step.kind !== 'running') return false;
  const haystack = `${step.toolName || ''} ${step.label || ''} ${step.detail || ''}`;
  return TEST_COMMAND_RE.test(haystack);
}

/**
 * Derive the current Cursor-style turn phase for one assistant message.
 *
 * Precedence:
 *  1. Terminal message states (error / pending) short-circuit.
 *  2. A settled ('complete', not currently streaming) message is always
 *     'completed' — whatever its last step kind was, the turn is done.
 *  3. Otherwise, look at the most recently RUNNING step (what's actually
 *     happening right now); fall back to the last step overall (between
 *     tool calls, nothing is 'running' for a moment).
 *  4. No steps at all while streaming = the model is still composing its
 *     opening read/plan of the request — 'understanding'.
 */
export function deriveTurnStatus(
  message: TurnStateMessage,
  isStreaming: boolean
): TurnStatus {
  if (message.status === 'error') return 'error';
  if (message.status === 'pending') return 'understanding';
  if (message.status === 'complete' && !isStreaming) return 'completed';

  const steps = message.steps || [];
  const running = [...steps].reverse().find((s) => s.itemStatus === 'running');
  const reference = running || steps[steps.length - 1];

  if (!reference) {
    return isStreaming ? 'understanding' : 'completed';
  }

  if (reference.kind === 'asking') return 'understanding';
  if (reference.kind === 'planning') return 'planning';
  if (isTestishStep(reference)) return 'testing';
  if (EXPLORE_KINDS.has(reference.kind)) return 'exploring';
  if (EXECUTE_KINDS.has(reference.kind)) return 'executing';
  if (reference.kind === 'thinking') return 'understanding';

  return isStreaming ? 'executing' : 'completed';
}
