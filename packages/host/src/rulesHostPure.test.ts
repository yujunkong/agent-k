/**
 * SET-011 — Rules tab pure helpers (v2.1 rulesHostHandlers parity).
 */
import { describe, it, expect } from 'vitest';
import { resolveRuleId, slugFromTitle, uniqueCustomFileName } from './rulesHostPure';

describe('SET-011 rules helpers', () => {
  it('resolves basic rule ids', () => {
    expect(resolveRuleId('/w', 'basic')).toEqual({
      abs: '/w/.agentrules',
      relPath: '.agentrules',
      kind: 'basic',
      fileName: '.agentrules',
    });
    expect(resolveRuleId('/w', '.agentrules')?.kind).toBe('basic');
  });

  it('resolves custom rule ids under .agentk/rules', () => {
    expect(resolveRuleId('/w', '.agentk/rules/style.md')).toEqual({
      abs: '/w/.agentk/rules/style.md',
      relPath: '.agentk/rules/style.md',
      kind: 'custom',
      fileName: 'style.md',
    });
    // bare filename also resolves
    expect(resolveRuleId('/w', 'style.md')?.relPath).toBe('.agentk/rules/style.md');
  });

  it('sanitizes traversal ids to a basename inside .agentk/rules', () => {
    expect(resolveRuleId('/w', '../evil.md')?.abs).toBe('/w/.agentk/rules/evil.md');
    expect(resolveRuleId('/w', '.agentk/rules/../evil.md')?.abs).toBe(
      '/w/.agentk/rules/evil.md',
    );
  });

  it('rejects invalid ids', () => {
    expect(resolveRuleId('/w', '')).toBeNull();
    expect(resolveRuleId('/w', 'notes.exe')).toBeNull();
    expect(resolveRuleId('/w', '.hidden.md')).toBeNull();
  });

  it('slugifies titles', () => {
    expect(slugFromTitle('My Rule!')).toBe('my-rule');
    expect(slugFromTitle('  ')).toBe('rule');
    expect(slugFromTitle('한글')).toBe('rule');
  });

  it('picks a unique file name', () => {
    const existing = new Set(['style.md', 'style-2.md']);
    expect(uniqueCustomFileName((n) => existing.has(n), 'Style')).toBe('style-3.md');
    expect(uniqueCustomFileName(() => false, 'Style')).toBe('style.md');
  });
});
