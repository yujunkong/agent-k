/**
 * HARNESS-007 — search-before-read nudge unit tests (reads are never failed).
 */
import { describe, expect, it } from 'vitest';
import {
  batchHasBlindRead,
  batchHasSearchTool,
  isBlindReadWithoutSearch,
  userMessageHintsPath,
} from './searchBeforeRead';

describe('searchBeforeRead (HARNESS-007)', () => {
  it('flags blind read_file when no search yet', () => {
    expect(
      isBlindReadWithoutSearch({
        toolName: 'read_file',
        args: { path: 'crates/app/Cargo.toml' },
        batch: [{ name: 'read_file' }],
        searchSatisfied: false,
        userText: '프로젝트 구조 파악해줘',
      })
    ).toBe(true);
  });

  it('does not flag when same batch includes grep', () => {
    expect(
      isBlindReadWithoutSearch({
        toolName: 'read_file',
        args: { path: 'src/a.ts' },
        batch: [{ name: 'grep' }, { name: 'read_file' }],
        searchSatisfied: false,
        userText: '찾아봐',
      })
    ).toBe(false);
    expect(batchHasSearchTool([{ name: 'grep' }, { name: 'read_file' }])).toBe(
      true
    );
  });

  it('does not flag after searchSatisfied', () => {
    expect(
      isBlindReadWithoutSearch({
        toolName: 'read_file',
        args: { path: 'src/a.ts' },
        batch: [{ name: 'read_file' }],
        searchSatisfied: true,
        userText: '찾아봐',
      })
    ).toBe(false);
  });

  it('does not flag when user named the path', () => {
    expect(userMessageHintsPath('Read src/index.ts please', 'src/index.ts')).toBe(
      true
    );
    expect(
      batchHasBlindRead({
        batch: [{ name: 'read_file', arguments: { path: 'src/index.ts' } }],
        searchSatisfied: false,
        userText: 'Read src/index.ts and summarize.',
      })
    ).toBe(false);
  });
});
