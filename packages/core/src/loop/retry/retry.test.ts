/**
 * V31-RETRY-01…04 — FailureTracker, RetryPolicy, PermissionDenialRecovery,
 * plus DoomLoopDetector extensions.
 */
import { describe, expect, it } from 'vitest';
import {
  FailureTracker,
  DefaultRetryPolicy,
  PermissionDenialRecovery,
} from './index';
import { DoomLoopDetector } from '../DoomLoopDetector';

describe('V31-RETRY-01 FailureTracker', () => {
  it('counts attempts per tool+args key', () => {
    const tracker = new FailureTracker(3);
    const args = { path: 'a.ts' };
    tracker.record('read_file', args, 'Error: not found');
    tracker.record('read_file', args, 'Error: not found');
    expect(tracker.attemptsFor({ toolName: 'read_file', argsHash: tracker.record('read_file', args, 'Error: not found').argsHash })).toBe(3);
  });

  it('isExhausted after maxAttempts', () => {
    const tracker = new FailureTracker(2);
    const args = { path: 'b.ts' };
    tracker.record('read_file', args, 'boom');
    const rec = tracker.record('read_file', args, 'boom');
    expect(tracker.isExhausted({ toolName: 'read_file', argsHash: rec.argsHash })).toBe(true);
  });

  it('treats different args as a fresh budget (delta retry)', () => {
    const tracker = new FailureTracker(2);
    tracker.record('read_file', { path: 'a.ts' }, 'boom');
    expect(tracker.isDeltaRetry('read_file', { path: 'b.ts' })).toBe(true);
    expect(tracker.isDeltaRetry('read_file', { path: 'a.ts' })).toBe(false);
  });

  it('reset clears all records', () => {
    const tracker = new FailureTracker(3);
    tracker.record('grep', { pattern: 'x' }, 'boom');
    tracker.reset();
    expect(tracker.attemptsFor({ toolName: 'grep', argsHash: '{}' })).toBe(0);
  });
});

describe('V31-RETRY-01/02 DefaultRetryPolicy', () => {
  it('retries a first failure', () => {
    const policy = new DefaultRetryPolicy(new FailureTracker(3));
    const d = policy.decide({ toolName: 'read_file', args: { path: 'a' }, error: 'boom' });
    expect(d.retry).toBe(true);
  });

  it('escalates after the budget is exhausted', () => {
    const tracker = new FailureTracker(2);
    const policy = new DefaultRetryPolicy(tracker);
    policy.decide({ toolName: 'read_file', args: { path: 'a' }, error: 'boom' });
    const d = policy.decide({ toolName: 'read_file', args: { path: 'a' }, error: 'boom' });
    expect(d.retry).toBe(false);
    expect(d.reason).toBe('exhausted');
    expect(d.nudge).toContain('different approach');
  });

  it('flags a delta retry when args changed', () => {
    const tracker = new FailureTracker(1);
    const policy = new DefaultRetryPolicy(tracker);
    policy.decide({ toolName: 'read_file', args: { path: 'a' }, error: 'boom' });
    const d = policy.decide({ toolName: 'read_file', args: { path: 'b' }, error: 'boom' });
    expect(d.reason).toBe('delta');
    expect(d.retry).toBe(true);
  });
});

describe('V31-RETRY-04 PermissionDenialRecovery', () => {
  it('recovers once then stops', () => {
    const rec = new PermissionDenialRecovery(1);
    const first = rec.onDenied({ toolName: 'write_file', turn: 1 });
    expect(first.recover).toBe(true);
    expect(first.nudge).toContain('alternative');
    const second = rec.onDenied({ toolName: 'write_file', turn: 2 });
    expect(second.recover).toBe(false);
  });

  it('reset restores the budget', () => {
    const rec = new PermissionDenialRecovery(1);
    rec.onDenied({ toolName: 'x', turn: 1 });
    rec.reset();
    expect(rec.onDenied({ toolName: 'x', turn: 2 }).recover).toBe(true);
  });
});

describe('V31-RETRY-03 DoomLoopDetector extensions', () => {
  it('keeps AGENT-010 default behavior', () => {
    const d = new DoomLoopDetector(3);
    for (let i = 0; i < 3; i++) d.recordCall('read_file', { path: 'a' }, 'Error: nope');
    expect(d.isDoomLoop()).toBe(true);
  });

  it('detects same error with drifting args when ignoreArgsOnSameError', () => {
    const d = new DoomLoopDetector(3, { ignoreArgsOnSameError: true });
    d.recordCall('read_file', { path: 'a' }, 'Error: not found');
    d.recordCall('read_file', { path: 'b' }, 'Error: not found');
    d.recordCall('read_file', { path: 'c' }, 'Error: not found');
    expect(d.isDoomLoop()).toBe(true);
  });

  it('default detector does NOT treat drifting args as a loop', () => {
    const d = new DoomLoopDetector(3);
    d.recordCall('read_file', { path: 'a' }, 'Error: not found');
    d.recordCall('read_file', { path: 'b' }, 'Error: not found');
    d.recordCall('read_file', { path: 'c' }, 'Error: not found');
    expect(d.isDoomLoop()).toBe(false);
  });

  it('detects alternating A/B/A/B when detectAlternation', () => {
    const d = new DoomLoopDetector(2, { detectAlternation: true });
    d.recordCall('read_file', { path: 'a' }, 'ok');
    d.recordCall('grep', { pattern: 'x' }, 'ok');
    d.recordCall('read_file', { path: 'a' }, 'ok');
    d.recordCall('grep', { pattern: 'x' }, 'ok');
    expect(d.isDoomLoop()).toBe(true);
  });
});
