/**
 * V31-TOOL-06 — decideModeSwitch unit tests.
 */
import { describe, expect, it } from 'vitest';
import { decideModeSwitch } from './ModeSwitchHandler';

describe('decideModeSwitch (V31-TOOL-06)', () => {
  it('allows agent → plan and returns the target mode config', () => {
    const d = decideModeSwitch('agent', 'plan');
    expect(d.ok).toBe(true);
    expect(d.target).toBe('plan');
    expect(d.config?.name).toBe('plan');
  });

  it('trims and lowercases the target', () => {
    const d = decideModeSwitch('agent', '  Debug ');
    expect(d.ok).toBe(true);
    expect(d.target).toBe('debug');
  });

  it('rejects an unknown target', () => {
    const d = decideModeSwitch('agent', 'build');
    expect(d.ok).toBe(false);
    expect(d.error).toContain('Invalid mode');
  });

  it('rejects self-escalation from plan', () => {
    const d = decideModeSwitch('plan', 'agent');
    expect(d.ok).toBe(false);
    expect(d.error).toMatch(/PLAN mode/);
  });

  it('rejects self-escalation from debug', () => {
    const d = decideModeSwitch('debug', 'agent');
    expect(d.ok).toBe(false);
    expect(d.error).toMatch(/DEBUG mode/);
  });
});
