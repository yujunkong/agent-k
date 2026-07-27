/**
 * ADDON-T01: autoVerificationHook related-test path
 */
import * as assert from 'assert';
import { createAutoVerificationHook } from '../../../src/hooks/autoVerificationHook';
import { injectTestVerificationError } from '../../../src/hooks/injectVerificationError';
import { resolveVerificationHookOptions } from '../../../src/verification/config';
import type { TestFile } from '../../../src/verification/TestFinder';
import type { TestResult } from '../../../src/verification/TestRunner';

suite('ADDON-T01 autoVerificationHook test loop', () => {
  test('resolveVerificationHookOptions: Tier A off, Tier B on', () => {
    assert.strictEqual(resolveVerificationHookOptions('A').testEnabled, false);
    assert.strictEqual(resolveVerificationHookOptions('B').testEnabled, true);
    assert.strictEqual(
      resolveVerificationHookOptions('A', { testEnabled: true }).testEnabled,
      true
    );
  });

  test('injectTestVerificationError formats failure for model', () => {
    const r = injectTestVerificationError('FAIL expected 5', ['a.test.ts'], 0, 2);
    assert.ok(r.content.includes('Test verification failed'));
    assert.ok(r.content.includes('a.test.ts'));
    assert.strictEqual(r.shouldStop, false);
  });

  test('testEnabled: failing related tests → verificationInjected', async () => {
    const related: TestFile[] = [
      { filePath: '/tmp/foo.test.ts', type: 'same_dir', framework: 'jest' },
    ];
    const failResult: TestResult = {
      success: false,
      passed: 0,
      failed: 1,
      output: 'FAIL foo.test.ts — expected 5 got 1',
      duration: 12,
    };

    const hook = createAutoVerificationHook({
      lintEnabled: false,
      testEnabled: true,
      maxRetries: 2,
      lintRunner: { runLint: async () => [] } as any,
      testFinder: { findRelatedTests: () => related } as any,
      testRunner: { runRelatedTestFiles: async () => failResult } as any,
    });

    const result = await hook({
      toolName: 'edit_file',
      args: { path: '/tmp/foo.ts' },
      result: { success: true, data: {} },
      mode: 'agent',
      turnNumber: 1,
      duration: 1,
    });

    assert.strictEqual(result.action, 'modify');
    assert.ok(result.modifiedResult);
    assert.strictEqual(result.modifiedResult!.success, false);
    const data = result.modifiedResult!.data as Record<string, unknown>;
    assert.strictEqual(data.verificationInjected, true);
    assert.strictEqual(data.kind, 'test');
    assert.ok(String(data.retryMessage).includes('Test verification failed'));
  });

  test('testEnabled false: skips tests even if finder would match', async () => {
    const hook = createAutoVerificationHook({
      lintEnabled: false,
      testEnabled: false,
      lintRunner: { runLint: async () => [] } as any,
      testFinder: {
        findRelatedTests: () => {
          throw new Error('should not call finder');
        },
      } as any,
      testRunner: {
        runRelatedTestFiles: async () => {
          throw new Error('should not run tests');
        },
      } as any,
    });

    const result = await hook({
      toolName: 'write_file',
      args: { path: '/tmp/foo.ts' },
      result: { success: true, data: {} },
      mode: 'agent',
      turnNumber: 1,
      duration: 1,
    });

    assert.strictEqual(result.action, 'allow');
  });

  test('maxRetries exhausted → ask guidance path', async () => {
    const related: TestFile[] = [
      { filePath: '/tmp/foo.test.ts', type: 'same_dir', framework: 'jest' },
    ];
    const failResult: TestResult = {
      success: false,
      passed: 0,
      failed: 1,
      output: 'still failing',
      duration: 1,
    };

    const hook = createAutoVerificationHook({
      lintEnabled: false,
      testEnabled: true,
      maxRetries: 1,
      lintRunner: { runLint: async () => [] } as any,
      testFinder: { findRelatedTests: () => related } as any,
      testRunner: { runRelatedTestFiles: async () => failResult } as any,
    });

    const ctx = {
      toolName: 'edit_file' as const,
      args: { path: '/tmp/foo.ts' },
      result: { success: true, data: {} },
      mode: 'agent' as const,
      turnNumber: 1,
      duration: 1,
    };

    await hook(ctx); // attempt 1
    const second = await hook(ctx); // attempt 2 → max
    assert.strictEqual(second.action, 'modify');
    const data = second.modifiedResult!.data as Record<string, unknown>;
    assert.ok(data.userGuidance);
  });
});
