/**
 * V31-RETRY-01/02 / V31-QG2 — failure-nudge body appending, extracted from
 * AgentLoopController.executeToolCalls.
 *
 * Order matters: the exhausted escalation for the CURRENT args wins over the
 * delta nudge — alternating args must not suppress "stop retrying".
 */

import type { FailureTracker } from './FailureTracker';

export function appendFailureNudge(
  tracker: FailureTracker,
  body: string,
  toolName: string,
  args: Record<string, unknown>,
  error: string,
  deltaAwareRetry: boolean
): string {
  const record = tracker.record(toolName, args, error);
  if (
    tracker.isExhausted({
      toolName,
      argsHash: record.argsHash,
    })
  ) {
    return (
      body +
      `\n\n"${toolName}" failed ${record.attempts} times with the same arguments. ` +
      `Stop retrying it and choose a different approach or ask the user.`
    );
  }
  if (deltaAwareRetry && tracker.isDeltaRetry(toolName, args)) {
    return (
      body +
      `\n\n"${toolName}" failed before with different arguments; ` +
      `retry with the current arguments.`
    );
  }
  return body;
}
