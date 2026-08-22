/**
 * CONV-012 — normalizeChangeSummary field aliases → ChangeSummaryItem.
 */
import { describe, expect, it } from 'vitest';
import { normalizeChangeSummary } from './normalizeChangeSummary';

describe('CONV-012 normalizeChangeSummary', () => {
  it('maps path/filePath and addition/deletion aliases', () => {
    expect(
      normalizeChangeSummary([
        { path: 'a.ts', additions: 2, deletions: 1 },
        { filePath: 'b.ts', additionsCount: 3, removed: 4 },
        { path: '', added: 9 }
      ])
    ).toEqual([
      { path: 'a.ts', additions: 2, deletions: 1 },
      { path: 'b.ts', additions: 3, deletions: 4 }
    ]);
  });

  it('returns empty for empty input', () => {
    expect(normalizeChangeSummary()).toEqual([]);
  });
});
