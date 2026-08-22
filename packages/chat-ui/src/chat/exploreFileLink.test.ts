import { describe, expect, it } from 'vitest';
import {
  openPathFromExploreDetail,
  openPathFromToolArgs
} from '../host/timelineLabels';

describe('openPathFromToolArgs', () => {
  it('extracts read_file path', () => {
    expect(
      openPathFromToolArgs('read_file', {
        path: 'packages/chat-ui/src/chat/conversation/agentTurnAdapter.tsx',
        offset: 1,
        limit: 77
      })
    ).toBe('packages/chat-ui/src/chat/conversation/agentTurnAdapter.tsx');
  });

  it('extracts grep scope path', () => {
    expect(
      openPathFromToolArgs('grep', {
        pattern: 'foo',
        path: 'packages/chat-ui/src/chat'
      })
    ).toBe('packages/chat-ui/src/chat');
  });
});

describe('shortDetail search rows', () => {
  it('formats codebase_search query next to Searched', async () => {
    const { shortDetail } = await import('../host/timelineLabels');
    expect(
      shortDetail('codebase_search', {
        query: '프로젝트 구조 워크스페이스 루트 파일'
      })
    ).toContain('프로젝트 구조');
  });

  it('formats grep pattern in path', async () => {
    const { shortDetail } = await import('../host/timelineLabels');
    expect(shortDetail('grep', { pattern: 'hasActive', path: 'timelinePresentation.ts' })).toBe(
      'hasActive in timelinePresentation.ts'
    );
  });

  it('parses raw JSON args for search tools', async () => {
    const { shortDetail } = await import('../host/timelineLabels');
    expect(
      shortDetail('glob', {
        raw: JSON.stringify({ glob_pattern: '**/package.json' })
      })
    ).toBe('**/package.json');
  });

  // Distinguish crate Cargo.toml reads (basename-only looked like duplicates).
  it('formats read_file with parent/file window', async () => {
    const { shortDetail, formatReadLineWindow } = await import('../host/timelineLabels');
    expect(formatReadLineWindow('crates/app/Cargo.toml', {})).toBe('app/Cargo.toml L1-250');
    expect(
      shortDetail('read_file', { path: 'crates/core/Cargo.toml', offset: 1, limit: 250 })
    ).toBe('core/Cargo.toml L1-250');
  });
});

describe('openPathFromExploreDetail', () => {
  it('parses Read window detail', () => {
    expect(openPathFromExploreDetail('agentTurnAdapter.tsx L1-77')).toBe(
      'agentTurnAdapter.tsx'
    );
    expect(openPathFromExploreDetail('MessageBubble.tsx L200-299')).toBe(
      'MessageBubble.tsx'
    );
  });

  it('parses Grepped "in path" detail', () => {
    expect(
      openPathFromExploreDetail('hasActive in timelinePresentation.ts')
    ).toBe('timelinePresentation.ts');
  });
});
