/**
 * HARNESS-002 / HARNESS-004 harness helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  extractEditedFilePath,
  formatPostEditVerificationFailure,
  parseLintErrorsFromToolResult,
  PostEditVerificationTracker,
} from './PostEditVerification';
import {
  createVerifyExitState,
  evaluateVerifyExit,
  markPathEdited,
  markPathVerified,
} from './VerifyExitCheck';
import {
  injectVerificationFirst,
  VERIFICATION_FIRST_PROMPT,
} from './VerificationFirstPrompt';

describe('VerificationFirstPrompt (HARNESS-002)', () => {
  it('injects protocol block once', () => {
    const once = injectVerificationFirst('Base prompt');
    expect(once).toContain('Verification-First Protocol');
    expect(once).toContain(VERIFICATION_FIRST_PROMPT.slice(0, 20));
    expect(injectVerificationFirst(once)).toBe(once);
  });
});

describe('PostEditVerification (HARNESS-004)', () => {
  it('extracts path from write tools', () => {
    expect(extractEditedFilePath('write_file', { path: 'src/a.ts' })).toBe(
      'src/a.ts',
    );
    expect(extractEditedFilePath('grep', { path: 'x' })).toBeUndefined();
  });

  it('parses lint errors from read_lints result', () => {
    const errors = parseLintErrorsFromToolResult({
      success: true,
      data: {
        errors: [{ path: 'a.ts', line: 1, message: 'boom', severity: 'error' }],
      },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('boom');
  });

  it('tracks micro-loop retries per file', () => {
    const tracker = new PostEditVerificationTracker(2);
    expect(tracker.nextAttempt('a.ts')).toBe(1);
    expect(tracker.nextAttempt('a.ts')).toBe(2);
    expect(tracker.atMax('a.ts')).toBe(true);
  });

  it('formats verification failure message', () => {
    const msg = formatPostEditVerificationFailure(
      [{ path: 'a.ts', message: 'x' }],
      0,
      2,
    );
    expect(msg).toContain('Verification micro-loop failed');
    expect(msg).toContain('<lint_errors>');
  });
});

describe('VerifyExitCheck (HARNESS-002)', () => {
  it('blocks exit when pending paths remain', () => {
    const state = createVerifyExitState();
    markPathEdited(state, 'src/foo.ts');
    const out = evaluateVerifyExit({
      verificationFirst: true,
      content: 'All done.',
      state,
      turn: 1,
      maxTurns: 10,
    });
    expect(out.block).toBe(true);
    expect(out.reason).toBe('pending_lints');
    expect(out.nudge).toContain('read_lints');
  });

  it('allows exit when paths verified', () => {
    const state = createVerifyExitState();
    markPathEdited(state, 'src/foo.ts');
    markPathVerified(state, 'src/foo.ts');
    const out = evaluateVerifyExit({
      verificationFirst: true,
      content: '## Summary\n\nFixed foo.ts lint.',
      state,
      turn: 2,
      maxTurns: 10,
    });
    expect(out.block).toBe(false);
  });

  it('does not block when verificationFirst disabled', () => {
    const state = createVerifyExitState();
    markPathEdited(state, 'src/foo.ts');
    expect(
      evaluateVerifyExit({
        verificationFirst: false,
        content: 'ok',
        state,
        turn: 1,
        maxTurns: 10,
      }).block,
    ).toBe(false);
  });
});
