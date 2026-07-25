/**
 * C2-T26: 단위 테스트 — PatchParser, Matcher, Staleness, Merger
 */
import * as assert from 'assert';
import { applySearchReplace, validateHunk } from '../../../src/tools/patchDocument';

suite('PatchParser', () => {
  test('기본 search-replace 적용', () => {
    const result = applySearchReplace('Hello world', [{ oldText: 'world', newText: 'there' }]);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.resultContent, 'Hello there');
  });

  test('유일 매칭 검증 — 정확히 1개', () => {
    const v = validateHunk('a b c a', 'b');
    assert.strictEqual(v.valid, true);
    assert.strictEqual(v.count, 1);
  });

  test('유일 매칭 검증 — 0개', () => {
    const v = validateHunk('a b c', 'x');
    assert.strictEqual(v.valid, false);
    assert.strictEqual(v.count, 0);
  });

  test('유일 매칭 검증 — 2개 이상', () => {
    const v = validateHunk('a a a', 'a');
    assert.strictEqual(v.valid, false);
    assert.ok(v.count > 1);
  });

  test('멀티 헌크 적용', () => {
    const content = 'foo\nbar\nbaz\n';
    const hunks = [
      { oldText: 'foo', newText: 'FOO' },
      { oldText: 'baz', newText: 'BAZ' }
    ];
    const result = applySearchReplace(content, hunks);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.resultContent, 'FOO\nbar\nBAZ\n');
  });

  test('변경 없음 — identical text', () => {
    const result = applySearchReplace('same', [{ oldText: 'same', newText: 'same' }]);
    assert.strictEqual(result.modified, true); // still applied, but content same
  });
});
