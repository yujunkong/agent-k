/**
 * V31-RETRY-01/02 — RetryPolicy.
 *
 * Decides whether a failed tool call should be retried. It combines the
 * bounded FailureTracker with the stream-aware ErrorRecovery classifier so a
 * transient provider error is retryable while an exhausted failure escalates.
 */

import type { ErrorRecovery } from '../ErrorRecovery';
import { FailureTracker } from './FailureTracker';

export type RetryReason = 'delta' | 'transient' | 'exhausted' | 'doom';

export interface RetryInput {
  toolName: string;
  args: Record<string, unknown>;
  error: string;
}

export interface RetryDecision {
  retry: boolean;
  reason: RetryReason;
  nudge?: string;
  delayMs?: number;
}

export interface RetryPolicy {
  decide(input: RetryInput): RetryDecision;
}

export class DefaultRetryPolicy implements RetryPolicy {
  constructor(
    private readonly tracker: FailureTracker,
    private readonly recovery?: ErrorRecovery,
  ) {}

  decide(input: RetryInput): RetryDecision {
    const record = this.tracker.record(input.toolName, input.args, input.error);
    const argsHash = record.argsHash;

    // Arguments changed since a previous failure → fresh budget.
    if (argsHash && this.tracker.isDeltaRetry(input.toolName, input.args)) {
      return {
        retry: true,
        reason: 'delta',
        nudge: `Retry "${input.toolName}" with the changed arguments.`,
      };
    }

    if (this.tracker.isExhausted({ toolName: input.toolName, argsHash })) {
      return {
        retry: false,
        reason: 'exhausted',
        nudge: `"${input.toolName}" failed ${record.attempts} times. Choose a different approach or ask the user.`,
      };
    }

    // Transient provider errors are worth another attempt.
    if (this.recovery && /transient|timeout|rate limit|overloaded/i.test(input.error)) {
      return { retry: true, reason: 'transient', delayMs: 500 };
    }

    return {
      retry: true,
      reason: 'delta',
      nudge: `Retry "${input.toolName}" once more.`,
    };
  }
}
