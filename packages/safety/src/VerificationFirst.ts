/**
 * SAFE-007 — Verification-first policy flag helper.
 * Broad edits should verify/explore before mutating when enabled.
 */

/** Flat / nested settings shapes consumers may pass. */
export type VerificationFirstInput =
  | boolean
  | {
      verificationFirst?: boolean;
      'agent-k.verification.first'?: boolean;
      enabled?: boolean;
    };

/**
 * Resolve whether verification-first policy is active.
 * Defaults to true when unset (safer for medium-model harness).
 */
export function isVerificationFirstEnabled(
  input?: VerificationFirstInput,
  defaultEnabled = true,
): boolean {
  if (input === undefined || input === null) {
    return defaultEnabled;
  }
  if (typeof input === 'boolean') {
    return input;
  }
  if (typeof input.verificationFirst === 'boolean') {
    return input.verificationFirst;
  }
  if (typeof input['agent-k.verification.first'] === 'boolean') {
    return input['agent-k.verification.first'];
  }
  if (typeof input.enabled === 'boolean') {
    return input.enabled;
  }
  return defaultEnabled;
}

export interface VerificationFirstPolicy {
  enabled: boolean;
  /** Soft guidance string for prompt / timeline (not a system prompt dump). */
  reason: string;
}

/** Structured policy snapshot for loop / context assemblers. */
export function resolveVerificationFirstPolicy(
  input?: VerificationFirstInput,
  defaultEnabled = true,
): VerificationFirstPolicy {
  const enabled = isVerificationFirstEnabled(input, defaultEnabled);
  return {
    enabled,
    reason: enabled
      ? 'Verify / explore before broad edits (SAFE-007).'
      : 'Verification-first policy disabled.',
  };
}
