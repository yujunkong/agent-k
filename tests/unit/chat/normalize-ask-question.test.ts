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

  test('객체 옵션을 라벨 문자열로 만든다 (object Object 방지)', () => {
    const n = normalizeMcqQuestion('목표 아키텍처?', [
      { label: '모놀리식 Rust 서비스' },
      { text: 'Python 공존 + Rust 점진' },
      { value: 'API만 Rust' },
      '그대로 유지'
    ]);
    assert.ok(!n.options.some((o) => o.includes('[object Object]')));
    assert.ok(n.options.some((o) => /모놀리식/.test(o)));
    assert.ok(n.options.some((o) => /공존/.test(o)));
    assert.ok(n.options.some((o) => /API만/.test(o)));
    assert.ok(n.options.includes('그대로 유지'));
    assert.ok(n.options.includes(OTHER_OPTION));
  });
});
