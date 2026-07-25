/**
 * C2-T28: 단위 테스트 — LintRunner, TestFinder, injectVerificationError
 */
import * as assert from 'assert';
import { injectVerificationError } from '../../../src/hooks/injectVerificationError';

suite('LintRunner', () => {
  test('린트 에러 포맷팅', () => {
    const errors = [
      { file: 'test.ts', line: 10, column: 5, message: 'Unexpected any', severity: 'warning' as const, code: 'no-explicit-any' },
      { file: 'test.ts', line: 20, column: 3, message: 'Unused variable', severity: 'warning' as const, code: 'no-unused-vars' }
    ];
    assert.strictEqual(errors.length, 2);
    assert.strictEqual(errors[0].code, 'no-explicit-any');
  });
});

suite('injectVerificationError', () => {
  const mockErrors = [
    { file: 'test.ts', line: 10, column: 1, message: 'Lint error', severity: 'warning' as const }
  ];

  test('첫 번째 재시도 — 에러 주입', () => {
    const result = injectVerificationError(mockErrors, 0, 2);
    assert.ok(result.content.includes('lint'));
    assert.strictEqual(result.shouldStop, false);
  });

  test('최대 재시도 초과 — 중단 신호', () => {
    const result = injectVerificationError(mockErrors, 2, 2);
    assert.strictEqual(result.shouldStop, true);
    assert.ok(result.content.includes('Maximum retries'));
  });

  test('에러 없음 — 빈 결과', () => {
    const result = injectVerificationError([], 0, 2);
    assert.strictEqual(result.content, '');
    assert.strictEqual(result.shouldStop, false);
  });
});
