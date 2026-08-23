/**
 * CHAT-005 — attachment format + line-range helpers (ported from v2.1 unit suite).
 */
import { describe, expect, it } from 'vitest';
import {
  attachmentDisplayLabel,
  formatAttachmentsForPayload,
  isOpenableAttachment,
  looksLikeLogOrSnippet,
  makeLogAttachment,
  makeImageAttachment,
  makeSnippetAttachment,
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

  it('makeLogAttachment + display label (no double line count)', () => {
    const a = makeLogAttachment('err\nwarn\nok');
    expect(a.type).toBe('log');
    expect(a.content).toContain('err');
    expect(attachmentDisplayLabel(a)).toBe('log (3 lines)');
  });

  it('editor selection → openable file chip with range label', () => {
    const a = makeSnippetAttachment('a\nb\nc\nd\ne\nf', {
      path: '/ws/src/IDE_PLAN.md',
      label: 'IDE_PLAN.md',
      startLine: 10,
      endLine: 15,
    });
    expect(a.type).toBe('file');
    expect(isOpenableAttachment(a)).toBe(true);
    expect(attachmentDisplayLabel(a)).toBe('IDE_PLAN.md (10-15)');
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

  it('CHAT-012 image chip → @image:path', () => {
    const img = makeImageAttachment({
      path: '/tmp/agent-k-captures/capture.png',
      mimeType: 'image/png',
      label: 'Screenshot.png',
    });
    expect(img.type).toBe('image');
    expect(attachmentDisplayLabel(img)).toBe('Screenshot.png');
    expect(formatAttachmentsForPayload([img])).toContain(
      '@image:/tmp/agent-k-captures/capture.png',
    );
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
