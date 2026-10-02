/**
 * HARNESS-004 + V31-LOOP-02 / V31-QG2 — post-edit lint micro-loop and the
 * clean-edit self-critique, extracted from AgentLoopController so the loop
 * file keeps its size budget. Behavior is identical to the original inline
 * block (lint → failure text | verified + critique nudge).
 */

import {
  parseLintErrorsFromToolResult,
  formatPostEditVerificationFailure,
  PostEditVerificationTracker,
} from '../../harness/PostEditVerification';
import { markPathVerified, type VerifyExitState } from '../../harness/VerifyExitCheck';
import type { CritiqueRunner } from '../critique/CritiqueRunner';
import type { ExecuteToolResult } from '../../types';
import type { AgentLoopEvent } from '../AgentLoopController';

export interface PostEditVerifyInput {
  editedPath: string;
  callId: string;
  signal?: AbortSignal;
  tracker: PostEditVerificationTracker;
  verifyExitState: VerifyExitState;
  critiqueRunner: CritiqueRunner;
  messages: unknown[];
  turn: number;
  executeTool: (input: {
    name: string;
    args: Record<string, unknown>;
    callId: string;
    signal?: AbortSignal;
  }) => Promise<ExecuteToolResult>;
}

export interface PostEditVerifyResult {
  body: string;
  /** V31-LOOP-02 self-critique event to emit (clean edit only). */
  critiqueEvent?: Extract<AgentLoopEvent, { type: 'self_critique' }>;
}

export async function runPostEditVerification(
  body: string,
  input: PostEditVerifyInput
): Promise<PostEditVerifyResult> {
  try {
    const lintResult = await input.executeTool({
      name: 'read_lints',
      args: { paths: [input.editedPath] },
      callId: `${input.callId}_verify`,
      signal: input.signal,
    });
    const lintErrors = parseLintErrorsFromToolResult(lintResult);
    if (lintErrors.length > 0) {
      const attempt = input.tracker.nextAttempt(input.editedPath);
      return {
        body:
          `${body}\n\n` +
          formatPostEditVerificationFailure(
            lintErrors,
            attempt - 1,
            input.tracker.maxAttempts
          ),
      };
    }
    markPathVerified(input.verifyExitState, input.editedPath);
    // V31-LOOP-02 — inline self-critique after a clean edit
    const critique = input.critiqueRunner.run({
      editedPaths: [input.editedPath],
      messages: input.messages as never[],
      turn: input.turn,
    });
    if (critique?.nudge) {
      return {
        body: `${body}\n\n${critique.nudge}`,
        critiqueEvent: {
          type: 'self_critique',
          turn: input.turn,
          passes: critique.passes,
          text: critique.nudge,
        },
      };
    }
    return { body };
  } catch {
    /* verification must not break tool batch */
    return { body };
  }
}
