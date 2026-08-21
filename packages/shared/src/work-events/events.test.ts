/**
 * SHARED-002 — Typed Work Event contract tests (R-002).
 */

import { describe, expect, it } from 'vitest';
import {
  WORK_EVENT_KINDS,
  isWorkEventKind,
  isWorkEventStatus,
  workEventHasKind,
  type TypedWorkEvent,
  type WorkEventKind,
} from './index';

/** Exhaustiveness check: every WorkEventKind must be handled. */
function labelForKind(kind: WorkEventKind): string {
  switch (kind) {
    case 'thinking':
      return 'thinking';
    case 'planning':
      return 'planning';
    case 'searching':
      return 'searching';
    case 'reading':
      return 'reading';
    case 'editing':
      return 'editing';
    case 'running':
      return 'running';
    case 'browsing':
      return 'browsing';
    case 'asking':
      return 'asking';
    case 'session':
      return 'session';
    case 'task':
      return 'task';
    case 'verify':
      return 'verify';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

describe('SHARED-002 Typed Work Events', () => {
  it('accepts only closed kind/status literals', () => {
    expect(isWorkEventKind('reading')).toBe(true);
    // v2.1 heuristic presentation label — not a wire kind
    expect(isWorkEventKind('read')).toBe(false);
    expect(isWorkEventStatus('running')).toBe(true);
    expect(isWorkEventStatus('complete')).toBe(false);
  });

  it('narrows by kind without string guessing', () => {
    const event: TypedWorkEvent = {
      id: 'we-1',
      turn: 1,
      status: 'running',
      label: 'Read package.json',
      kind: 'reading',
      path: 'package.json',
    };
    expect(workEventHasKind(event, 'reading')).toBe(true);
    if (workEventHasKind(event, 'reading')) {
      expect(event.path).toBe('package.json');
    }
  });

  it('supports exhaustiveness over WorkEventKind', () => {
    const labels = WORK_EVENT_KINDS.map(labelForKind);
    expect(labels).toHaveLength(WORK_EVENT_KINDS.length);
    expect(new Set(labels).size).toBe(WORK_EVENT_KINDS.length);
  });

  it('timeline stream payload can carry TypedWorkEvent', () => {
    const workEvent: TypedWorkEvent = {
      id: 'we-2',
      turn: 2,
      status: 'done',
      label: 'grep SHARED',
      kind: 'searching',
      query: 'SHARED-001',
    };
    const stream = {
      type: 'chat.stream' as const,
      payload: {
        requestId: 'req-1',
        event: 'timeline' as const,
        workEvent,
      },
    };
    expect(stream.payload.workEvent.kind).toBe('searching');
  });
});
