/**
 * CFG-005 — Queue configuration helpers.
 */

export type QueueOnEnterWhileRunning =
  | 'queue'
  | 'interrupt'
  | 'resynthesize'
  | 'ignore';

export type QueueOnStop = 'keep' | 'discard';

export const QUEUE_CONFIG_KEYS = [
  'agent-k.queue.onEnterWhileRunning',
  'agent-k.queue.onStop',
  'agent-k.queue.resynthesizeDebounceMs',
  'agent-k.queue.debounceMs',
] as const;

export interface QueueConfig {
  onEnterWhileRunning: QueueOnEnterWhileRunning;
  onStop: QueueOnStop;
  resynthesizeDebounceMs: number;
  debounceMs: number;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  onEnterWhileRunning: 'resynthesize',
  onStop: 'keep',
  resynthesizeDebounceMs: 300,
  debounceMs: 300,
};

export function parseQueueOnEnterWhileRunning(
  value: unknown
): QueueOnEnterWhileRunning {
  if (
    value === 'queue' ||
    value === 'interrupt' ||
    value === 'resynthesize' ||
    value === 'ignore'
  ) {
    return value;
  }
  return DEFAULT_QUEUE_CONFIG.onEnterWhileRunning;
}

export function parseQueueOnStop(value: unknown): QueueOnStop {
  return value === 'discard' ? 'discard' : 'keep';
}

export function extractQueueConfig(
  bag: Record<string, unknown>
): QueueConfig {
  const debounce = Number(bag['agent-k.queue.debounceMs']);
  const resynth = Number(bag['agent-k.queue.resynthesizeDebounceMs']);
  return {
    onEnterWhileRunning: parseQueueOnEnterWhileRunning(
      bag['agent-k.queue.onEnterWhileRunning']
    ),
    onStop: parseQueueOnStop(bag['agent-k.queue.onStop']),
    resynthesizeDebounceMs: Number.isFinite(resynth)
      ? Math.max(0, Math.floor(resynth))
      : DEFAULT_QUEUE_CONFIG.resynthesizeDebounceMs,
    debounceMs: Number.isFinite(debounce)
      ? Math.max(0, Math.floor(debounce))
      : DEFAULT_QUEUE_CONFIG.debounceMs,
  };
}
