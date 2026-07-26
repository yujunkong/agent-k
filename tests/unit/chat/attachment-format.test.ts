/**
 * Attachment format + mention line-range helpers
 */
import * as assert from 'assert';
import {
  formatAttachmentsForPayload,
  looksLikeLogOrSnippet,
  makeLogAttachment,
  parseLineRangeInput,
  attachmentDisplayLabel
} from '../../../src/chat/attachmentFormat';
import { parseFileMentionQuery } from '../../../src/prefetch/MentionExtractor';

suite('attachmentFormat', () => {
  test('looksLikeLogOrSnippet — multi-line', () => {
    assert.ok(looksLikeLogOrSnippet('a\nb\nc'));
    assert.ok(!looksLikeLogOrSnippet('short'));
  });

  test('parseLineRangeInput', () => {
    assert.deepStrictEqual(parseLineRangeInput('10-30'), {
      startLine: 10,
      endLine: 30
    });
    assert.deepStrictEqual(parseLineRangeInput('L5'), {
      startLine: 5,
      endLine: 5
    });
    assert.deepStrictEqual(parseLineRangeInput(''), {});
    assert.strictEqual(parseLineRangeInput('abc'), null);
  });

  test('makeLogAttachment + display label', () => {
    const a = makeLogAttachment('err\nwarn\nok');
    assert.strictEqual(a.type, 'log');
    assert.ok(a.content?.includes('err'));
    assert.ok(/3 lines/.test(attachmentDisplayLabel(a)));
  });

  test('formatAttachmentsForPayload includes range + log body', () => {
    const out = formatAttachmentsForPayload([
      { type: 'file', path: '/tmp/a.ts', startLine: 10, endLine: 20 },
      makeLogAttachment('line1\nline2')
    ]);
    assert.ok(out.includes('@file:/tmp/a.ts:10-20'));
    assert.ok(out.includes('Attached log'));
    assert.ok(out.includes('line1'));
  });
});

suite('MentionExtractor line range', () => {
  test('parseFileMentionQuery :10-30', () => {
    const p = parseFileMentionQuery('src/foo.ts:10-30');
    assert.strictEqual(p.path, 'src/foo.ts');
    assert.strictEqual(p.startLine, 10);
    assert.strictEqual(p.endLine, 30);
  });

  test('parseFileMentionQuery #L10-L20', () => {
    const p = parseFileMentionQuery('src/foo.ts#L10-L20');
    assert.strictEqual(p.path, 'src/foo.ts');
    assert.strictEqual(p.startLine, 10);
    assert.strictEqual(p.endLine, 20);
  });
});
