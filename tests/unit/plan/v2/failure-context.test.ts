import * as assert from 'assert';
import { buildFailureContext, failureContextToPrompt } from '../../../../src/plan/v2/FailureContext';

suite('Plan V2 — FailureContext', () => {
  test('separates errors and warnings by severity', () => {
    const ctx = buildFailureContext('semantic_validation_failed', 1, [
      { code: 'FILE_NOT_FOUND', message: 'missing', severity: 'error', taskId: 'task-1' },
      { code: 'NO_VERIFICATION', message: 'no verify', severity: 'warning', taskId: 'task-1' }
    ]);
    assert.strictEqual(ctx.errors.length, 1);
    assert.strictEqual(ctx.warnings.length, 1);
  });

  test('prompt text includes the attempt number, codes, and task ids', () => {
    const ctx = buildFailureContext('semantic_validation_failed', 2, [
      { code: 'FILE_NOT_FOUND', message: 'src/auth/AuthService.ts does not exist.', severity: 'error', taskId: 'task-1' },
      { code: 'DEPENDENCY_MISSING', message: 'task-3 references task-1 but task-1 is undeclared.', severity: 'error', taskId: 'task-3' }
    ]);
    const prompt = failureContextToPrompt(ctx);
    assert.ok(prompt.includes('attempt 2'));
    assert.ok(prompt.includes('FILE_NOT_FOUND'));
    assert.ok(prompt.includes('task-1'));
    assert.ok(prompt.includes('DEPENDENCY_MISSING'));
    assert.ok(prompt.includes('ONLY these issues'));
  });

  test('prompt text is empty when there are no errors (warnings-only)', () => {
    const ctx = buildFailureContext('semantic_validation_failed', 1, [
      { code: 'NO_VERIFICATION', message: 'no verify', severity: 'warning', taskId: 'task-1' }
    ]);
    assert.strictEqual(failureContextToPrompt(ctx), '');
  });
});
