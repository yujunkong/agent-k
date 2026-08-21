/**
 * SHARED-002 — closed Work Event kind / status enums (R-002 / CONV-002 foundation).
 * UI must switch on these literals; never re-derive kind from free-text labels.
 */

/** Lifecycle status for a work event row. */
export type WorkEventStatus = 'pending' | 'running' | 'done' | 'error';

/**
 * Closed timeline kinds aligned with host/runtime emission.
 * Extend only via Feature ID; do not accept arbitrary strings on the wire.
 */
export type WorkEventKind =
  | 'thinking'
  | 'planning'
  | 'searching'
  | 'reading'
  | 'editing'
  | 'running'
  | 'browsing'
  | 'asking'
  | 'session'
  | 'task'
  | 'verify'
  | 'done'
  | 'error';

export const WORK_EVENT_STATUSES = [
  'pending',
  'running',
  'done',
  'error',
] as const satisfies ReadonlyArray<WorkEventStatus>;

export const WORK_EVENT_KINDS = [
  'thinking',
  'planning',
  'searching',
  'reading',
  'editing',
  'running',
  'browsing',
  'asking',
  'session',
  'task',
  'verify',
  'done',
  'error',
] as const satisfies ReadonlyArray<WorkEventKind>;

export function isWorkEventStatus(value: unknown): value is WorkEventStatus {
  return (
    typeof value === 'string' &&
    (WORK_EVENT_STATUSES as ReadonlyArray<string>).includes(value)
  );
}

export function isWorkEventKind(value: unknown): value is WorkEventKind {
  return (
    typeof value === 'string' &&
    (WORK_EVENT_KINDS as ReadonlyArray<string>).includes(value)
  );
}
