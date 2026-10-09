/**
 * V31-LOOP-01 — Loop phase policy / tracker / emitter tests.
 */
import { describe, expect, it } from 'vitest';
import { DefaultPhasePolicy } from './PhasePolicy';
import { LoopPhaseTracker } from './LoopPhaseTracker';
import { PhaseEmitter } from './PhaseEmitter';
import type { PhaseObservation } from './LoopPhase';
import type { AgentLoopEvent } from '../AgentLoopController';

function obs(overrides: Partial<PhaseObservation> = {}): PhaseObservation {
  return {
    turn: 1,
    hasToolCalls: false,
    toolNames: [],
    toolOk: true,
    editedPaths: [],
    verifyPending: false,
    ...overrides,
  };
}

describe('DefaultPhasePolicy (V31-LOOP-01)', () => {
  const policy = new DefaultPhasePolicy();

  it('plan → execute when tool calls start', () => {
    expect(
      policy.next('plan', obs({ hasToolCalls: true, toolNames: ['read_file'] })),
    ).toBe('execute');
  });

  it('execute → verify when edits need verification', () => {
    expect(
      policy.next(
        'execute',
        obs({ editedPaths: ['a.ts'], verifyPending: true }),
      ),
    ).toBe('verify');
  });

  it('verify → fix while verification pending', () => {
    expect(policy.next('verify', obs({ verifyPending: true }))).toBe('fix');
    expect(policy.next('fix', obs({ verifyPending: true }))).toBe('fix');
  });

  it('never done while verifyPending', () => {
    expect(
      policy.next('execute', obs({ finalProse: 'Done.', verifyPending: true })),
    ).toBe('verify');
  });

  it('done only when final prose and no pending verification', () => {
    expect(policy.next('execute', obs({ finalProse: 'All done.' }))).toBe(
      'done',
    );
  });

  it('done is terminal', () => {
    expect(
      policy.next('done', obs({ hasToolCalls: true, verifyPending: true })),
    ).toBe('done');
  });
});

describe('LoopPhaseTracker (V31-LOOP-01)', () => {
  it('starts at plan and returns transitions only on change', () => {
    const tracker = new LoopPhaseTracker();
    expect(tracker.current()).toBe('plan');
    expect(tracker.observe(obs())).toBeNull();

    const t1 = tracker.observe(
      obs({ turn: 2, hasToolCalls: true, toolNames: ['edit_file'] }),
    );
    expect(t1).toEqual({
      from: 'plan',
      to: 'execute',
      turn: 2,
      reason: 'tool calls started',
    });
  });

  it('walks execute → verify → fix → done', () => {
    const tracker = new LoopPhaseTracker();
    tracker.observe(obs({ hasToolCalls: true }));

    const toVerify = tracker.observe(
      obs({ turn: 2, editedPaths: ['a.ts'], verifyPending: true }),
    );
    expect(toVerify?.to).toBe('verify');

    const toFix = tracker.observe(obs({ turn: 3, verifyPending: true }));
    expect(toFix?.to).toBe('fix');

    const toDone = tracker.observe(obs({ turn: 4, finalProse: 'Fixed a.ts.' }));
    expect(toDone?.to).toBe('done');
  });
});

describe('PhaseEmitter (V31-LOOP-01)', () => {
  it('emits phase events only on transitions', () => {
    const events: AgentLoopEvent[] = [];
    const emitter = new PhaseEmitter(new LoopPhaseTracker(), (e) =>
      events.push(e),
    );
    emitter.observe(obs());
    expect(events).toEqual([]);
    emitter.observe(obs({ turn: 2, hasToolCalls: true }));
    expect(events).toEqual([
      {
        type: 'phase',
        phase: 'execute',
        turn: 2,
        reason: 'tool calls started',
      },
    ]);
  });
});
