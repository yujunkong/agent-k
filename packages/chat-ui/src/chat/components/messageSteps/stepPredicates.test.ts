import { describe, expect, it } from 'vitest';
import { inferTurn, isMeta } from './stepPredicates';

describe('isMeta', () => {
  it('flags chrome kinds', () => {
    expect(isMeta('thinking')).toBe(true);
    expect(isMeta('planning')).toBe(true);
    expect(isMeta('done')).toBe(true);
    expect(isMeta('session')).toBe(true);
  });

  it('rejects work kinds', () => {
    expect(isMeta('reading')).toBe(false);
    expect(isMeta('searching')).toBe(false);
    expect(isMeta('editing')).toBe(false);
    expect(isMeta('running')).toBe(false);
    expect(isMeta('task')).toBe(false);
    expect(isMeta('')).toBe(false);
  });
});

describe('inferTurn', () => {
  it('prefers an explicit positive turn', () => {
    expect(inferTurn({ id: 'tl_tool_9', turn: 3 })).toBe(3);
    expect(inferTurn({ id: 'tl_tool_9', turn: 1 })).toBe(1);
  });

  it('ignores non-positive turns and derives from id', () => {
    expect(inferTurn({ id: 'tl_thinking_2', turn: 0 })).toBe(2);
    expect(inferTurn({ id: 'tl_planning_7' })).toBe(7);
    expect(inferTurn({ id: 'tl_tool_5' })).toBe(5);
    expect(inferTurn({ id: 'step_9' })).toBe(9);
  });

  it('defaults to 1 when the id has no turn digits', () => {
    expect(inferTurn({ id: 'call_1' })).toBe(1);
    expect(inferTurn({ id: 'tl_subagent_abc' })).toBe(1);
  });
});
