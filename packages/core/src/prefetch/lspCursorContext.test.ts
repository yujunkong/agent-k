/**
 * CTX-011 / ADDON-T12 — LSP cursor context (ported from
 * v2.1 tests/unit/prefetch/lsp-cursor-context.test.ts; mocha→vitest).
 */
import { describe, expect, it } from 'vitest';
import { collectLspCursorContext } from './lspCursorContext';
import { collectIdeContextBag } from './ideContextInjector';

describe('CTX-011 lspCursorContext', () => {
  it('formats hover/definitions/references into one block', async () => {
    const block = await collectLspCursorContext({
      getHover: async () => 'function foo(): void',
      getDefinitions: async () => '/tmp/a.ts:10',
      getReferences: async () => '/tmp/b.ts:20\n/tmp/c.ts:5',
    });
    expect(block.startsWith('## LSP CURSOR CONTEXT')).toBe(true);
    expect(block).toContain('### Hover');
    expect(block).toContain('function foo');
    expect(block).toContain('### Definitions');
    expect(block).toContain('/tmp/a.ts:10');
    expect(block).toContain('### References');
    expect(block).toContain('/tmp/b.ts:20');
  });

  it('returns empty string when nothing is available', async () => {
    const block = await collectLspCursorContext({
      getHover: async () => '',
      getDefinitions: async () => '',
      getReferences: async () => '',
    });
    expect(block).toBe('');
  });

  it('never throws — deps that reject degrade to empty sections', async () => {
    const block = await collectLspCursorContext({
      getHover: async () => {
        throw new Error('no hover provider');
      },
      getDefinitions: async () => '/tmp/a.ts:1',
      getReferences: async () => {
        throw new Error('no references provider');
      },
    });
    expect(block.includes('### Hover')).toBe(false);
    expect(block).toContain('### Definitions');
    expect(block.includes('### References')).toBe(false);
  });

  it('respects timeoutMs — stuck collector resolves empty', async () => {
    const start = Date.now();
    const block = await collectLspCursorContext({
      timeoutMs: 30,
      getHover: () => new Promise(() => {}),
      getDefinitions: async () => 'ok',
      getReferences: async () => '',
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(block.includes('### Hover')).toBe(false);
    expect(block).toContain('### Definitions');
  });

  it('long sections are truncated', async () => {
    const block = await collectLspCursorContext({
      getHover: async () => 'x'.repeat(5000),
      getDefinitions: async () => '',
      getReferences: async () => '',
    });
    expect(block).toContain('(truncated)');
  });
});

describe('CTX-011 ideContextInjector + LSP merge', () => {
  it('append LSP context to symbols/type_definitions', async () => {
    const bag = await collectIdeContextBag({
      getSymbolHint: async () => 'symbol: Foo',
      getLspContext: async () =>
        ['## LSP CURSOR CONTEXT', '', '### Hover', 'class Foo {}'].join('\n'),
      getGitDiff: async () => '',
    });
    expect(bag.symbols).toContain('symbol: Foo');
    expect(bag.symbols).toContain('LSP CURSOR CONTEXT');
    expect(bag.type_definitions).toContain('class Foo');
  });

  it('degrades gracefully when LSP context is empty', async () => {
    const bag = await collectIdeContextBag({
      getSymbolHint: async () => 'symbol: Bar',
      getLspContext: async () => '',
      getGitDiff: async () => '',
    });
    expect(bag.symbols).toBe('symbol: Bar');
  });
});
