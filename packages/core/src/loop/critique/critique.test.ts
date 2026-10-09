/**
 * V31-LOOP-02 — Self-critique policy / runner / formatter tests.
 */
import { describe, expect, it } from 'vitest';
import { DefaultCritiqueFormatter } from './CritiqueFormatter';
import { CritiqueRunner } from './CritiqueRunner';
import { DefaultSelfCritiquePolicy } from './SelfCritiquePolicy';

const formatter = new DefaultCritiqueFormatter();

describe('DefaultSelfCritiquePolicy (V31-LOOP-02)', () => {
  const policy = new DefaultSelfCritiquePolicy();

  it('fires on edits + ok + passes < maxPasses', () => {
    expect(
      policy.shouldCritique({
        editedPaths: ['a.ts'],
        turn: 1,
        lastToolOk: true,
        passes: 0,
      }),
    ).toBe(true);
    expect(policy.maxPasses).toBe(2);
  });

  it('does not fire without edits or when last tool failed', () => {
    expect(
      policy.shouldCritique({
        editedPaths: [],
        turn: 1,
        lastToolOk: true,
        passes: 0,
      }),
    ).toBe(false);
    expect(
      policy.shouldCritique({
        editedPaths: ['a.ts'],
        turn: 1,
        lastToolOk: false,
        passes: 0,
      }),
    ).toBe(false);
  });

  it('stops at maxPasses', () => {
    expect(
      policy.shouldCritique({
        editedPaths: ['a.ts'],
        turn: 1,
        lastToolOk: true,
        passes: 2,
      }),
    ).toBe(false);
  });
});

describe('CritiqueRunner (V31-LOOP-02)', () => {
  it('returns null when there are no edits', () => {
    const runner = new CritiqueRunner(
      new DefaultSelfCritiquePolicy(),
      formatter,
    );
    expect(runner.run({ editedPaths: [], messages: [], turn: 1 })).toBeNull();
  });

  it('issues inline nudge and stops after maxPasses', () => {
    const runner = new CritiqueRunner(
      new DefaultSelfCritiquePolicy(),
      formatter,
    );

    const first = runner.run({
      editedPaths: ['src/a.ts'],
      messages: [],
      turn: 1,
    });
    expect(first?.pass).toBe(true);
    expect(first?.passes).toBe(1);
    expect(first?.nudge).toContain('<self_critique>');
    expect(first?.nudge).toContain('src/a.ts');

    const second = runner.run({
      editedPaths: ['src/b.ts'],
      messages: [],
      turn: 2,
    });
    expect(second?.passes).toBe(2);

    expect(
      runner.run({ editedPaths: ['src/c.ts'], messages: [], turn: 3 }),
    ).toBeNull();
  });

  it('reset restores the pass budget', () => {
    const runner = new CritiqueRunner(
      new DefaultSelfCritiquePolicy(),
      formatter,
    );
    runner.run({ editedPaths: ['a.ts'], messages: [], turn: 1 });
    runner.run({ editedPaths: ['a.ts'], messages: [], turn: 2 });
    runner.reset();
    expect(
      runner.run({ editedPaths: ['a.ts'], messages: [], turn: 3 })?.passes,
    ).toBe(1);
  });
});

describe('DefaultCritiqueFormatter (V31-LOOP-02)', () => {
  it('formats an inline instruction block with paths', () => {
    const text = formatter.format({
      editedPaths: ['src/a.ts', 'src/b.ts'],
      messages: [],
      turn: 1,
    });
    expect(text).toContain('<self_critique>');
    expect(text).toContain('src/a.ts, src/b.ts');
    expect(text).toContain('</self_critique>');
  });
});
