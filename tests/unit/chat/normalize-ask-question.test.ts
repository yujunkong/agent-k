import * as assert from 'assert';
import {
  OTHER_OPTION,
  normalizeMcqQuestion
} from '../../../src/chat/normalizeAskQuestion';

suite('normalizeMcqQuestion', () => {
  test('항상 기타를 붙인다', () => {
    const n = normalizeMcqQuestion('골라주세요', ['A', 'B']);
    assert.ok(n.options.includes(OTHER_OPTION));
    assert.strictEqual(n.options[n.options.length - 1], OTHER_OPTION);
  });

  test('본문에 박힌 options JSON을 복구한다', () => {
    const raw =
      '어떤 접근으로?\n", "options": ["A. 전체", "B. 점진", "C. 부분"]';
    const n = normalizeMcqQuestion(raw, undefined);
    assert.ok(n.options.some((o) => /전체/.test(o)));
    assert.ok(n.options.includes(OTHER_OPTION));
    assert.ok(!/"options"/i.test(n.question));
  });

  test('A/B/C 라인도 옵션으로 뽑는다', () => {
    const raw = ['범위?', 'A. 전체', 'B. 일부', 'C. 최소'].join('\n');
    const n = normalizeMcqQuestion(raw);
    assert.ok(n.options.length >= 3);
    assert.ok(n.options.includes(OTHER_OPTION));
  });
});
