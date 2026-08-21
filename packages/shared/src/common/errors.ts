/**
 * SHARED-001 — common error shape for protocol / work-event boundaries.
 * Pure types only; callers decide how to log or surface.
 */

/** Stable error codes shared across packages (extend per Feature, do not invent ad-hoc strings). */
export type SharedErrorCode =
  | 'PROTOCOL_UNKNOWN_TYPE'
  | 'PROTOCOL_INVALID_PAYLOAD'
  | 'PROTOCOL_VERSION_MISMATCH'
  | 'WORK_EVENT_INVALID'
  | 'INTERNAL';

export interface SharedError {
  code: SharedErrorCode;
  message: string;
  /** Optional correlation (request / turn / tool). */
  details?: Record<string, string | number | boolean | null>;
}

export function createSharedError(
  code: SharedErrorCode,
  message: string,
  details?: SharedError['details'],
): SharedError {
  return details ? { code, message, details } : { code, message };
}
