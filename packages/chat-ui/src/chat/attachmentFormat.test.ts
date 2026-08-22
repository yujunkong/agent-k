/**
 * CHAT-005 — attachment format + line-range helpers (ported from v2.1 unit suite).
 */
import { describe, expect, it } from 'vitest';
import {
  attachmentDisplayLabel,
  formatAttachmentsForPayload,
  looksLikeLogOrSnippet,
  makeLogAttachment,
  parseLineRangeInput,
} from './attachmentFormat';
import { parseFileMentionQuery } from '../prefetch/MentionExtractor';

describe('CHAT-005 attachmentFormat', () => {
  it('looksLikeLogOrSnippet — multi-line', () => {
    expect(looksLikeLogOrSnippet('a\nb\nc')).toBe(true);
    expect(looksLikeLogOrSnippet('short')).toBe(false);
  });

  it('parseLineRangeInput', () => {
    expect(parseLineRangeInput('10-30')).toEqual({ startLine: 10, endLine: 30 });
    expect(parseLineRangeInput('L5')).toEqual({ startLine: 5, endLine: 5 });
    expect(parseLineRangeInput('')).toEqual({});
    expect(parseLineRangeInput('abc')).toBeNull();
  });

  it('makeLogAttachment + display label', () => {
    const a = makeLogAttachment('err\nwarn\nok');
    expect(a.type).toBe('log');
    expect(a.content).toContain('err');
    expect(attachmentDisplayLabel(a)).toMatch(/3 lines/);
  });

  it('formatAttachmentsForPayload includes range + log body', () => {
    const out = formatAttachmentsForPayload([
      { type: 'file', path: '/tmp/a.ts', startLine: 10, endLine: 20 },
      makeLogAttachment('line1\nline2'),
    ]);
    expect(out).toContain('@file:/tmp/a.ts:10-20');
    expect(out).toContain('Attached log');
    expect(out).toContain('line1');
  });
});

describe('CHAT-005 MentionExtractor line range', () => {
  it('parseFileMentionQuery :10-30', () => {
    const p = parseFileMentionQuery('src/foo.ts:10-30');
    expect(p.path).toBe('src/foo.ts');
    expect(p.startLine).toBe(10);
    expect(p.endLine).toBe(30);
  });

  it('parseFileMentionQuery #L10-L20', () => {
    const p = parseFileMentionQuery('src/foo.ts#L10-L20');
    expect(p.path).toBe('src/foo.ts');
    expect(p.startLine).toBe(10);
    expect(p.endLine).toBe(20);
  });
});
