/**
 * ADDON-T05: IDE context injection — never throws; injected deps work without vscode
 */
import * as assert from 'assert';
import { PrefetchEngine } from '../../../src/prefetch/PrefetchEngine';
import { collectIdeContextBag } from '../../../src/prefetch/ideContextInjector';

suite('ADDON-T05 ideContextInjector', () => {
  test('collectIdeContextBag uses injected deps and never throws', async () => {
    const bag = await collectIdeContextBag({
      getDiagnosticsSummary: async () => 'L10: [error] boom',
      getGitDiff: async () => 'diff --git a/x.ts',
      getActiveFileHint: async () => 'Active file: /tmp/x.ts\nconst x = 1',
      getSymbolHint: async () => 'symbol: Foo',
    });
    assert.ok(bag.diagnostics?.includes('boom'));
    assert.ok(bag.git_diff?.includes('diff --git'));
    assert.ok(bag.active_file?.includes('x.ts'));
    assert.ok(bag.symbols?.includes('Foo'));
  });

  test('collectIdeContextBag survives throwing deps', async () => {
    const bag = await collectIdeContextBag({
      getDiagnosticsSummary: async () => {
        throw new Error('vscode missing');
      },
      getGitDiff: async () => {
        throw new Error('git fail');
      },
      getActiveFileHint: async () => {
        throw new Error('no editor');
      },
      getSymbolHint: async () => {
        throw new Error('no hover');
      },
    });
    assert.deepStrictEqual(bag, {});
  });

  test('PrefetchEngine injects task_context with IDE bag', async () => {
    const engine = new PrefetchEngine(
      { enabled: true, ideContextEnabled: true, maxFiles: 0 },
      {
        getDiagnosticsSummary: async () => 'L1: [error] TypeError',
        getGitDiff: async () => '--- a/f\n+++ b/f',
        getActiveFileHint: async () => 'Active file: src/a.ts',
        getSymbolHint: async () => '',
      }
    );
    const block = await engine.prefetch('fix this crash please', 'agent');
    assert.ok(block.includes('task_context') || block.includes('Task Context'));
    assert.ok(block.includes('diagnostics') || block.includes('TypeError') || block.includes('Active file'));
  });

  test('PrefetchEngine disabled ide context skips injection', async () => {
    const engine = new PrefetchEngine(
      { enabled: true, ideContextEnabled: false, maxFiles: 0 },
      {
        getDiagnosticsSummary: async () => 'SHOULD_NOT_APPEAR',
        getGitDiff: async () => 'SHOULD_NOT_APPEAR',
      }
    );
    const block = await engine.prefetch('hello world', 'ask');
    assert.ok(!block.includes('SHOULD_NOT_APPEAR'));
  });
});
