/**
 * SAFE-008 — Verification micro-loop.
 * check → (optional) fix → re-check, capped by maxFixAttempts, then stop.
 */

import { createSafetyError, type SafetyResult } from './types';

export interface VerificationMicroLoopOptions {
  /** Return true when verification passes. */
  check: () => boolean | Promise<boolean>;
  /** Optional fix attempt invoked after a failed check. */
  fix?: () => void | Promise<void>;
  /** Max fix attempts after the initial failed check (default 2). */
  maxFixAttempts?: number;
}

export interface VerificationMicroLoopValue {
  /** Total check invocations. */
  checkCount: number;
  /** How many times fix ran. */
  fixAttempts: number;
  passed: boolean;
}

const DEFAULT_MAX_FIX_ATTEMPTS = 2;

/**
 * Run: check → if fail and attempts remain, fix then check again → stop.
 */
export async function runVerificationMicroLoop(
  opts: VerificationMicroLoopOptions,
): Promise<SafetyResult<VerificationMicroLoopValue>> {
  const maxFixAttempts = opts.maxFixAttempts ?? DEFAULT_MAX_FIX_ATTEMPTS;
  let checkCount = 0;
  let fixAttempts = 0;

  while (true) {
    checkCount += 1;
    const passed = await opts.check();
    if (passed) {
      return {
        ok: true,
        value: { checkCount, fixAttempts, passed: true },
      };
    }

    if (fixAttempts >= maxFixAttempts || !opts.fix) {
      return {
        ok: false,
        error: createSafetyError(
          'VERIFICATION_FAILED',
          `Verification failed after ${fixAttempts} fix attempt(s)`,
          { checkCount, fixAttempts, maxFixAttempts },
        ),
      };
    }

    fixAttempts += 1;
    await opts.fix();
  }
}
