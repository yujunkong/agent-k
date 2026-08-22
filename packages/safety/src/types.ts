/**
 * SAFE-* shared types for @agent-k/safety.
 * PermissionLevel mirrors core CFG-003 locally to avoid safety↔core cycles.
 */

/**
 * Cursor-style four-level permission ladder (CFG-003 / SAFE-001).
 * Duplicated here on purpose — do NOT import from @agent-k/core.
 */
export type PermissionLevel = 'ask' | 'accept_edits' | 'auto' | 'bypass';

export const PERMISSION_LEVELS: readonly PermissionLevel[] = [
  'ask',
  'accept_edits',
  'auto',
  'bypass',
] as const;

/** Product default matches CFG-003 / C4-T01. */
export const DEFAULT_PERMISSION_LEVEL: PermissionLevel = 'accept_edits';

/**
 * R-005-style domain error (explicit code + message; no thrown opaque failures).
 * Kept local so safety does not widen SharedErrorCode for every gate.
 */
export type SafetyErrorCode =
  | 'PERMISSION_DENIED'
  | 'PATH_DENIED'
  | 'TERMINAL_DENIED'
  | 'WRITE_DENIED'
  | 'SECRET_NOT_FOUND'
  | 'CHECKPOINT_NOT_FOUND'
  | 'VERIFICATION_FAILED'
  | 'HOOK_BLOCKED'
  | 'HOOK_FAILED'
  | 'INVALID_INPUT'
  | 'INTERNAL';

export interface SafetyError {
  code: SafetyErrorCode;
  message: string;
  /** Optional correlation — never put secret values here. */
  details?: Record<string, string | number | boolean | null>;
}

/** Discriminated result used across SAFE-* gates (R-005). */
export type SafetyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SafetyError };

export function createSafetyError(
  code: SafetyErrorCode,
  message: string,
  details?: SafetyError['details'],
): SafetyError {
  return details ? { code, message, details } : { code, message };
}

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return (
    typeof value === 'string' &&
    (PERMISSION_LEVELS as readonly string[]).includes(value)
  );
}
