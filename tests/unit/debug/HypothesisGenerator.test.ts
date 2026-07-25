/**
 * C6-T16: 단위 테스트 — HypothesisGenerator (가설 생성/정제/랭킹)
 */
import * as assert from 'assert';
import { HypothesisGenerator } from '../../../src/debug/HypothesisGenerator';

suite('HypothesisGenerator (C6-T16)', () => {
  const generator = new HypothesisGenerator();

  test('가설 생성 — 에러 메세지 기반', () => {
    const hypotheses = generator.generate({
      errorMessage: 'Cannot read properties of null (reading user)',
      fileContext: 'src/auth.ts:42: getUser()',
      stackTrace: 'at getUser (src/auth.ts:42)\nat login (src/auth.ts:15)'
    });

    assert.ok(hypotheses.length > 0);
    assert.ok(hypotheses.some(h => h.title.toLowerCase().includes('null')));
  });

  test('가설 템플릿 기반 생성', () => {
    const reported = generator.reportHypothesis('race');
    assert.ok(reported);
    assert.ok(reported!.title.includes('Race'));
  });

  test('가설 개수 상한', () => {
    const hypotheses = generator.generate({
      errorMessage: 'TimeoutError',
      fileContext: 'test.ts',
      stackTrace: 'at test (test.ts:1)'
    });
    assert.ok(hypotheses.length <= 5, 'Max 5 hypotheses');
  });

  test('가설 정제', () => {
    const refined = generator.refine('hyp-null', {
      reproduced: true,
      observations: ['user is null when session expired']
    });
    assert.ok(refined);
    assert.strictEqual(refined!.status, 'refined');
    assert.ok(refined!.description.includes('session'));
  });
});
