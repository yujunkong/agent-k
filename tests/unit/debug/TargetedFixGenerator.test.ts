/**
 * C6-T18: 단위 테스트 — TargetedFixGenerator (픽스 생성 검증)
 */
import * as assert from 'assert';
import { TargetedFixGenerator } from '../../../src/debug/TargetedFixGenerator';

suite('TargetedFixGenerator (C6-T18)', () => {
  const fixer = new TargetedFixGenerator();

  test('null 체크 픽스 생성', () => {
    const fix = fixer.generateNullCheckFix('src/auth.ts', 'user', 'user?.name');
    assert.ok(fix.patch.includes('user?.name'));
    assert.ok(fix.type === 'null_check');
  });

  test('타임아웃 핸들링 픽스 생성', () => {
    const fix = fixer.generateTimeoutFix('src/api.ts', 'fetchData', 5000);
    assert.ok(fix.patch.includes('AbortController') || fix.patch.includes('setTimeout'));
    assert.ok(fix.type === 'timeout_handling');
  });

  test('리소스 정리 픽스 생성', () => {
    const fix = fixer.generateCleanupFix('src/cache.ts', 'Map');
    assert.ok(fix.patch.includes('clear') || fix.patch.includes('weak'));
    assert.ok(fix.type === 'resource_cleanup');
  });

  test('Async/Await 픽스 생성', () => {
    const fix = fixer.generateAsyncFix('src/service.ts', 'getData', ['then']);
    assert.ok(fix.patch.includes('async') || fix.patch.includes('await'));
    assert.ok(fix.type === 'async_handling');
  });

  test('메모이제이션 픽스 생성', () => {
    const fix = fixer.generateMemoFix('src/compute.ts', 'expensiveFn', 'Map');
    assert.ok(fix.patch.includes('Map') || fix.patch.includes('cache'));
    assert.ok(fix.type === 'memoization');
  });

  test('픽스 검증 — null 체크', () => {
    const fix = fixer.generateNullCheckFix('test.ts', 'x', 'x?.y');
    const valid = fixer.validateFix('test.ts', fix.patch, x => !x.includes('x.y'));
    assert.ok(valid);
  });
});
