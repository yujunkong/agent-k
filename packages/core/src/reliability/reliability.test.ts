/**
 * REL-001…008 — reliability helper tests.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  RegenerationSafety,
  SendEpochMap,
  StreamingStabilizationBuffer,
  TurnStateMachine,
  checkCompactionIntegrity,
  createClassifierDiagnostics,
  createPlanWatchdog,
  validateToolPayload,
} from './index';
import type { AgentMessage } from '../types';

describe('reliability domain (REL-001…008)', () => {
  it('classifier diagnostics ring buffer (REL-001)', () => {
    const d = createClassifierDiagnostics(10, true);
    d.run('isWeakFinalAnswer', 'ok', 1);
    expect(d.size).toBe(1);
  });

  it('plan watchdog fires (REL-002)', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const wd = createPlanWatchdog({
      timeoutMs: 100,
      onTimeout,
    });
    vi.advanceTimersByTime(100);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    wd.clear();
    vi.useRealTimers();
  });

  it('streaming stabilization buffer flushes (REL-003)', async () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const buf = new StreamingStabilizationBuffer((t) => chunks.push(t), 20);
    buf.push('hel');
    buf.push('lo');
    vi.advanceTimersByTime(20);
    expect(chunks.join('')).toBe('hello');
    vi.useRealTimers();
  });

  it('turn state machine transitions (REL-004)', () => {
    const sm = new TurnStateMachine();
    expect(sm.transition('sending')).toBe(true);
    expect(sm.transition('streaming')).toBe(true);
    expect(sm.transition('idle')).toBe(false);
  });

  it('send epoch stale detection (REL-005)', () => {
    const map = new SendEpochMap();
    const e1 = map.bump('s1');
    const e2 = map.bump('s1');
    expect(map.isStale('s1', e1)).toBe(true);
    expect(map.isStale('s1', e2)).toBe(false);
  });

  it('regeneration safety lock (REL-006)', () => {
    const lock = new RegenerationSafety();
    expect(lock.tryBegin('t1')).toBe(true);
    expect(lock.tryBegin('t1')).toBe(false);
    lock.end('t1');
    expect(lock.tryBegin('t1')).toBe(true);
  });

  it('tool payload validation (REL-007)', () => {
    expect(validateToolPayload({ name: 'read_file', arguments: { path: 'a' } }).ok).toBe(
      true
    );
    expect(
      validateToolPayload({
        name: 'x',
        rawContent: '```json\n{"name":"read_file","arguments":{}}\n```',
      }).looksBroken
    ).toBe(true);
  });

  it('compaction integrity (REL-008)', () => {
    const messages: AgentMessage[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: '1', name: 'read_file', arguments: {} }],
      },
      { role: 'tool', content: 'ok', toolCallId: '1', name: 'read_file' },
    ];
    expect(checkCompactionIntegrity(messages).ok).toBe(true);
  });
});
