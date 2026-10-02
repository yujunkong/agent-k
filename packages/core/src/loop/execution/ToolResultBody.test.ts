/**
 * V31-TOOL-08 — ToolResultBody formatting.
 */
import { describe, expect, it } from 'vitest';
import { formatToolResultBody } from './ToolResultBody';

describe('V31-TOOL-08 formatToolResultBody', () => {
  it('passes through string data unchanged', () => {
    const out = formatToolResultBody({ success: true, data: 'hello' });
    expect(out.body).toBe('hello');
    expect(out.truncated).toBe(false);
  });

  it('JSON-stringifies structured data', () => {
    const out = formatToolResultBody({
      success: true,
      data: { count: 2, results: ['a', 'b'] },
    });
    expect(out.body).toBe('{"count":2,"results":["a","b"]}');
  });

  it('renders null for empty success data', () => {
    const out = formatToolResultBody({ success: true });
    expect(out.body).toBe('null');
  });

  it('renders an Error body on failure', () => {
    const out = formatToolResultBody({ success: false, error: 'boom' });
    expect(out.body).toBe('Error: boom');
  });

  it('falls back to a generic error message', () => {
    const out = formatToolResultBody({ success: false });
    expect(out.body).toBe('Error: tool failed');
  });

  it('truncates when maxChars is exceeded', () => {
    const out = formatToolResultBody({
      success: true,
      data: 'x'.repeat(20),
      maxChars: 5,
    });
    expect(out.body).toBe('xxxxx');
    expect(out.truncated).toBe(true);
  });

  it('does not truncate when maxChars is absent', () => {
    const out = formatToolResultBody({
      success: true,
      data: 'x'.repeat(20),
    });
    expect(out.truncated).toBe(false);
    expect(out.body.length).toBe(20);
  });
});
