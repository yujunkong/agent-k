/**
 * ADDON-T12: LSP cursor-depth context — injected deps, no vscode required
 */
import * as assert from 'assert';
import { collectLspCursorContext } from '../../../src/prefetch/lspCursorContext';
import { collectIdeContextBag } from '../../../src/prefetch/ideContextInjector';

suite('ADDON-T12 lspCursorContext', () => {
  test('formats hover/definitions/references into one block', async () => {
    const block = await collectLspCursorContext({
      getHover: async () => 'function foo(): void',
      getDefinitions: async () => '/tmp/a.ts:10',
      getReferences: async () => '/tmp/b.ts:20\n/tmp/c.ts:5'
    });
    assert.ok(block.startsWith('## LSP CURSOR CONTEXT'));
    assert.ok(block.includes('### Hover'));
    assert.ok(block.includes('function foo'));
    assert.ok(block.includes('### Definitions'));
    assert.ok(block.includes('/tmp/a.ts:10'));
    assert.ok(block.includes('### References'));
    assert.ok(block.includes('/tmp/b.ts:20'));
  });

  test('returns empty string when nothing is available', async () => {
    const block = await collectLspCursorContext({
      getHover: async () => '',
      getDefinitions: async () => '',
      getReferences: async () => ''
    });
    assert.strictEqual(block, '');
  });

  test('never throws — deps that reject degrade to empty sections', async () => {
    const block = await collectLspCursorContext({
      getHover: async () => {
        throw new Error('no hover provider');
      },
      getDefinitions: async () => '/tmp/a.ts:1',
      getReferences: async () => {
        throw new Error('no references provider');
      }
    });
    assert.ok(!block.includes('### Hover'));
    assert.ok(block.includes('### Definitions'));
    assert.ok(!block.includes('### References'));
  });

  test('respects timeoutMs — a stuck collector resolves empty, does not hang', async () => {
    const start = Date.now();
    const block = await collectLspCursorContext({
      timeoutMs: 30,
      getHover: () => new Promise(() => {}), // never resolves
      getDefinitions: async () => 'ok',
      getReferences: async () => ''
    });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `expected fast timeout, took ${elapsed}ms`);
    assert.ok(!block.includes('### Hover'));
    assert.ok(block.includes('### Definitions'));
  });

  test('long sections are truncated', async () => {
    const block = await collectLspCursorContext({
      getHover: async () => 'x'.repeat(5000),
      getDefinitions: async () => '',
      getReferences: async () => ''
    });
    assert.ok(block.includes('(truncated)'));
  });
});

suite('ADDON-T12 ideContextInjector + LSP merge', () => {
  test('collectIdeContextBag appends LSP context to symbols/type_definitions', async () => {
    const bag = await collectIdeContextBag({
      getSymbolHint: async () => 'symbol: Foo',
      getLspContext: async () =>
        ['## LSP CURSOR CONTEXT', '', '### Hover', 'class Foo {}'].join('\n')
    });
    assert.ok(bag.symbols?.includes('symbol: Foo'));
    assert.ok(bag.symbols?.includes('LSP CURSOR CONTEXT'));
    assert.ok(bag.type_definitions?.includes('class Foo'));
  });

  test('collectIdeContextBag degrades gracefully when LSP context is empty', async () => {
    const bag = await collectIdeContextBag({
      getSymbolHint: async () => 'symbol: Bar',
      getLspContext: async () => ''
    });
    assert.strictEqual(bag.symbols, 'symbol: Bar');
  });
});
