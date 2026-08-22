/**
 * STREAM-002 — deriveTurnStatus (chat-ui 표시). Runtime SM is core REL-004.
 */
import { describe, expect, it } from 'vitest';
import { deriveTurnStatus, type TurnStateStep } from './turnState';

function step(
  kind: string,
  itemStatus: TurnStateStep['itemStatus'] = 'running',
  extra?: Partial<TurnStateStep>
): TurnStateStep {
  return { kind, itemStatus, ...extra };
}

describe('STREAM-002 deriveTurnStatus', () => {
  it('short-circuits on error / pending / complete', () => {
    expect(deriveTurnStatus({ status: 'error' }, true)).toBe('error');
    expect(deriveTurnStatus({ status: 'pending' }, true)).toBe('understanding');
    expect(deriveTurnStatus({ status: 'complete', steps: [step('editing')] }, false)).toBe(
      'completed'
    );
  });

  it('streaming with no steps is understanding', () => {
    expect(deriveTurnStatus({ status: 'streaming', steps: [] }, true)).toBe(
      'understanding'
    );
  });

  it('prefers the most recent running step over last done step', () => {
    const steps = [
      step('searching', 'done'),
      step('editing', 'running')
    ];
    expect(deriveTurnStatus({ status: 'streaming', steps }, true)).toBe('executing');
  });

  it('maps explore / plan / ask / think kinds', () => {
    expect(
      deriveTurnStatus({ status: 'streaming', steps: [step('reading')] }, true)
    ).toBe('exploring');
    expect(
      deriveTurnStatus({ status: 'streaming', steps: [step('planning')] }, true)
    ).toBe('planning');
    expect(
      deriveTurnStatus({ status: 'streaming', steps: [step('asking')] }, true)
    ).toBe('understanding');
    expect(
      deriveTurnStatus({ status: 'streaming', steps: [step('thinking')] }, true)
    ).toBe('understanding');
  });

  it('reclassifies running terminal as testing when command looks like a test runner', () => {
    expect(
      deriveTurnStatus(
        {
          status: 'streaming',
          steps: [step('running', 'running', { detail: 'npm test' })]
        },
        true
      )
    ).toBe('testing');
    expect(
      deriveTurnStatus(
        {
          status: 'streaming',
          steps: [step('running', 'running', { detail: 'ls -la' })]
        },
        true
      )
    ).toBe('executing');
  });

  it('idle between tools falls back to last step kind', () => {
    expect(
      deriveTurnStatus(
        {
          status: 'streaming',
          steps: [step('searching', 'done'), step('reading', 'done')]
        },
        true
      )
    ).toBe('exploring');
  });
});
