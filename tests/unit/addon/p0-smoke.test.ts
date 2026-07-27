/**
 * ADDON-T18: P0 smoke — ensure ADDON T01–T05 modules load and core APIs work
 */
import * as assert from 'assert';
import { resolveVerificationHookOptions } from '../../../src/verification/config';
import { DEFAULT_TURN_TIMEOUT_MS, resolveTurnTimeoutMs } from '../../../src/loop/turnTimeout';
import { planWriteGate } from '../../../src/plan/writeGate';
import { inferTaskType, selectContextItems } from '../../../src/prefetch/taskContextStrategy';
import { collectIdeContextBag } from '../../../src/prefetch/ideContextInjector';

suite('ADDON-T18 P0 smoke', () => {
  test('T01 verification options resolve', () => {
    const opts = resolveVerificationHookOptions('B', { testEnabled: true });
    assert.strictEqual(opts.testEnabled, true);
    assert.strictEqual(opts.lintEnabled, true);
  });

  test('T02 idle timeout defaults', () => {
    assert.strictEqual(DEFAULT_TURN_TIMEOUT_MS, 900_000);
    assert.strictEqual(resolveTurnTimeoutMs(undefined, undefined), 900_000);
  });

  test('T03 plan write gate blocks research writes', () => {
    assert.strictEqual(planWriteGate('plan', 'research', 'edit_file').allowed, false);
  });

  test('T04 task strategy selects bug_fix', () => {
    assert.strictEqual(inferTaskType('fix the FAIL assert'), 'bug_fix');
    const items = selectContextItems('bug_fix', {
      failing_test: 'FAIL',
      diagnostics: 'err',
      related_files: 'a.ts',
      recent_changes: 'diff',
      error_message: 'err',
    });
    assert.ok(items.length >= 3);
  });

  test('T05 IDE bag never throws without vscode', async () => {
    const bag = await collectIdeContextBag({
      getDiagnosticsSummary: async () => '',
      getGitDiff: async () => '',
      getActiveFileHint: async () => '',
      getSymbolHint: async () => '',
    });
    assert.ok(bag && typeof bag === 'object');
  });
});
