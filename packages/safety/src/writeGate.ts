/**
 * SAFE-004 — Write gate.
 * Combines permission level + deny-path check for agent writes.
 */

import { isPathDenied, DEFAULT_DENY_GLOBS } from './denyGlobs';
import {
  type PermissionLevel,
  createSafetyError,
  type SafetyError,
  type SafetyResult,
} from './types';

export interface CanWriteOptions {
  level: PermissionLevel;
  path: string;
  denyGlobs?: readonly string[];
}

export interface CanWriteDecision {
  allowed: boolean;
  /** Present when allowed === false. */
  error?: SafetyError;
  /** True when level is ask (caller should escalate to PermissionGate). */
  needsApproval?: boolean;
}

/**
 * Static write policy: deny paths always block; `ask` needs approval;
 * accept_edits / auto / bypass allow (path not denied).
 */
export function canWrite(opts: CanWriteOptions): CanWriteDecision {
  const globs = opts.denyGlobs ?? DEFAULT_DENY_GLOBS;

  if (isPathDenied(opts.path, globs)) {
    const error = createSafetyError(
      'PATH_DENIED',
      `Write denied: path matches deny glob (${opts.path})`,
      { path: opts.path },
    );
    return { allowed: false, error };
  }

  if (opts.level === 'ask') {
    const error = createSafetyError(
      'WRITE_DENIED',
      'Write requires explicit approval at permission level "ask"',
      { path: opts.path, level: opts.level },
    );
    return { allowed: false, needsApproval: true, error };
  }

  // accept_edits / auto / bypass
  return { allowed: true };
}

/** R-005 result form of canWrite. */
export function canWriteResult(opts: CanWriteOptions): SafetyResult<{ path: string }> {
  const decision = canWrite(opts);
  if (!decision.allowed) {
    return {
      ok: false,
      error: decision.error ?? createSafetyError('WRITE_DENIED', 'Write denied'),
    };
  }
  return { ok: true, value: { path: opts.path } };
}
