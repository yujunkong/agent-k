/**
 * HARNESS-007 / V31-THOUGHT — Cursor pattern inject + thinking brevity.
 */
import { describe, expect, it } from 'vitest';
import { CURSOR_PATTERN_PROMPT, injectCursorPattern } from './CursorPattern';

describe('CURSOR_PATTERN_PROMPT', () => {
  it('asks for short thinking mid-explore', () => {
    expect(CURSOR_PATTERN_PROMPT).toMatch(/Thinking channel/i);
    expect(CURSOR_PATTERN_PROMPT).toMatch(/2–4 short sentences|2-4 short sentences/);
    expect(CURSOR_PATTERN_PROMPT).toMatch(/3–5 short sentences|3-5 short sentences/);
  });
});

describe('injectCursorPattern', () => {
  it('appends once', () => {
    const once = injectCursorPattern('Base system');
    expect(once).toContain('Base system');
    expect(once).toContain('Cursor Operating Pattern');
    const twice = injectCursorPattern(once);
    expect(twice).toBe(once);
  });
});
