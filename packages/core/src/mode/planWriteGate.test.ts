/**
 * PLAN-009 — plan mode write gate.
 */
import { describe, expect, it } from 'vitest';
import { planWriteGate } from './planWriteGate';

describe('planWriteGate (PLAN-009)', () => {
  it('allows writes in agent mode', () => {
    expect(planWriteGate('agent', 'research', 'write_file').allowed).toBe(true);
  });

  it('blocks write tools in plan mode before build', () => {
    const gate = planWriteGate('plan', 'research', 'edit_file');
    expect(gate.allowed).toBe(false);
    expect(gate.error).toContain('build stage');
  });

  it('allows write tools in plan build stage', () => {
    expect(planWriteGate('plan', 'build', 'write_file').allowed).toBe(true);
  });
});
