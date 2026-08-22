/**
 * CFG-009 — Thinking effort configuration helpers.
 */

import type { ThinkingEffort } from '@agent-k/shared';

export const THINKING_EFFORT_CONFIG_KEY = 'agent-k.thinking.effort' as const;

export const THINKING_EFFORT_LEVELS: readonly ThinkingEffort[] = [
  'off',
  'low',
  'medium',
  'high',
  'max',
] as const;

export function parseThinkingEffort(value: unknown): ThinkingEffort {
  if (
    value === 'off' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'max'
  ) {
    return value;
  }
  return 'medium';
}

export function extractThinkingEffort(
  bag: Record<string, unknown>
): ThinkingEffort {
  return parseThinkingEffort(bag[THINKING_EFFORT_CONFIG_KEY]);
}

/**
 * Clamp requested effort to levels the model family supports.
 * Unknown / unsupported models → empty list (UI hides the control).
 */
export function clampThinkingEffort(
  requested: ThinkingEffort,
  allowed: readonly ThinkingEffort[]
): ThinkingEffort {
  if (allowed.length === 0) return 'off';
  if (allowed.includes(requested)) return requested;
  // Prefer medium, then high, then first non-off, else first entry.
  if (allowed.includes('medium')) return 'medium';
  if (allowed.includes('high')) return 'high';
  const nonOff = allowed.find((e) => e !== 'off');
  return nonOff ?? allowed[0]!;
}
