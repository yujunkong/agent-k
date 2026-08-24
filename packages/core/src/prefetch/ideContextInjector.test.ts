/**
 * CTX-011 / ADDON-T05 — IDE context injector (ported from
 * v2.1 tests/unit/prefetch/ide-context-injector.test.ts; mocha→vitest).
 */
import { describe, expect, it } from 'vitest';
import { PrefetchEngine } from './PrefetchEngine';
import { collectIdeContextBag } from './ideContextInjector';

describe('CTX-011 ideContextInjector', () => {
  it('collectIdeContextBag uses injected deps and never throws', async () => {
    const bag = await collectIdeContextBag({
      getDiagnosticsSummary: async () => 'L10: [error] boom',
      getGitDiff: async () => 'diff --git a/x.ts',
      getActiveFileHint: async () => 'Active file: /tmp/x.ts\nconst x = 1',
      getSymbolHint: async () => 'symbol: Foo',
      getLspContext: async () => '',
    });
    expect(bag.diagnostics).toContain('boom');
    expect(bag.git_diff).toContain('diff --git');
    expect(bag.active_file).toContain('x.ts');
    expect(bag.symbols).toContain('Foo');
  });

  it('collectIdeContextBag survives throwing deps', async () => {
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
      getLspContext: async () => {
        throw new Error('no lsp');
      },
    });
    expect(bag).toEqual({});
  });

  it('PrefetchEngine injects task_context with IDE bag', async () => {
    const engine = new PrefetchEngine(
      { enabled: true, ideContextEnabled: true, maxFiles: 0 },
      {
        getDiagnosticsSummary: async () => 'L1: [error] TypeError',
        getGitDiff: async () => '--- a/f\n+++ b/f',
        getActiveFileHint: async () => 'Active file: src/a.ts',
        getSymbolHint: async () => '',
        getLspContext: async () => '',
      }
    );
    const block = await engine.prefetch('fix this crash please', 'agent');
    expect(block.includes('task_context') || block.includes('Task Context')).toBe(true);
    expect(
      block.includes('diagnostics') ||
        block.includes('TypeError') ||
        block.includes('Active file')
    ).toBe(true);
  });

  it('PrefetchEngine disabled ide context skips injection', async () => {
    const engine = new PrefetchEngine(
      { enabled: true, ideContextEnabled: false, maxFiles: 0 },
      {
        getDiagnosticsSummary: async () => 'SHOULD_NOT_APPEAR',
        getGitDiff: async () => 'SHOULD_NOT_APPEAR',
      }
    );
    const block = await engine.prefetch('hello world', 'ask');
    expect(block.includes('SHOULD_NOT_APPEAR')).toBe(false);
  });
});
