/**
 * ADDON-T15: MCP deferred schema budget unit tests
 */
import * as assert from 'assert';
import {
  DeferredMCPTools,
  DEFAULT_MAX_SCHEMA_TOKENS,
  estimateSchemaTokens,
  shouldAutoDefer,
} from '../../../src/mcp/DeferredMCPTools';
import type { MCPClient } from '../../../src/mcp/MCPClient';

function fakeMcpClient(): MCPClient {
  return {
    getAllTools: () => [],
    connect: async () => [],
  } as unknown as MCPClient;
}

suite('ADDON-T15 schema budget', () => {
  test('estimateSchemaTokens approximates chars/4', () => {
    assert.strictEqual(estimateSchemaTokens(''), 0);
    assert.strictEqual(estimateSchemaTokens('x'.repeat(400)), 100);
    assert.strictEqual(estimateSchemaTokens('x'.repeat(401)), 101);
  });

  test('shouldAutoDefer uses default 8000 token budget', () => {
    assert.strictEqual(DEFAULT_MAX_SCHEMA_TOKENS, 8000);
    assert.strictEqual(shouldAutoDefer(7999), false);
    assert.strictEqual(shouldAutoDefer(8000), false);
    assert.strictEqual(shouldAutoDefer(8001), true);
  });

  test('shouldAutoDefer honors custom budget', () => {
    assert.strictEqual(shouldAutoDefer(500, 1000), false);
    assert.strictEqual(shouldAutoDefer(1500, 1000), true);
  });

  test('DeferredMCPTools defaults maxSchemaTokens to 8000', () => {
    const dmt = new DeferredMCPTools(fakeMcpClient());
    assert.strictEqual(dmt.getMaxSchemaTokens(), 8000);
  });

  test('DeferredMCPTools constructor accepts custom maxSchemaTokens', () => {
    const dmt = new DeferredMCPTools(fakeMcpClient(), 2000);
    assert.strictEqual(dmt.getMaxSchemaTokens(), 2000);
  });

  test('setMaxSchemaTokens updates the budget', () => {
    const dmt = new DeferredMCPTools(fakeMcpClient());
    dmt.setMaxSchemaTokens(3000);
    assert.strictEqual(dmt.getMaxSchemaTokens(), 3000);
  });

  test('setMaxSchemaTokens falls back to default on invalid input', () => {
    const dmt = new DeferredMCPTools(fakeMcpClient());
    dmt.setMaxSchemaTokens(-5);
    assert.strictEqual(dmt.getMaxSchemaTokens(), DEFAULT_MAX_SCHEMA_TOKENS);
  });

  test('applyBudget flags an over-budget server as deferred', () => {
    const dmt = new DeferredMCPTools(fakeMcpClient(), 100); // 100 tokens = 400 chars
    const payload = 'x'.repeat(2000); // ~500 tokens, over budget
    const result = dmt.applyBudget('big-server', payload);
    assert.strictEqual(result.deferred, true);
    assert.strictEqual(result.tokens, 500);
    assert.strictEqual(dmt.isOverSchemaBudget('big-server'), true);
    assert.strictEqual(dmt.isServerLoaded('big-server'), false);
  });

  test('applyBudget allows a small schema payload under budget', () => {
    const dmt = new DeferredMCPTools(fakeMcpClient(), 8000);
    const payload = 'x'.repeat(400); // 100 tokens, well under budget
    const result = dmt.applyBudget('small-server', payload);
    assert.strictEqual(result.deferred, false);
    assert.strictEqual(dmt.isOverSchemaBudget('small-server'), false);
  });

  test('applyBudget on an already-loaded server resets it back to deferred when over budget', async () => {
    const dmt = new DeferredMCPTools(fakeMcpClient(), 8000);
    dmt.deferServer('srv', ['tool_a']);
    await dmt.loadServer('srv');
    assert.strictEqual(dmt.isServerLoaded('srv'), true);

    dmt.applyBudget('srv', 'x'.repeat(40000)); // way over budget
    assert.strictEqual(dmt.isServerLoaded('srv'), false);
    assert.strictEqual(dmt.isOverSchemaBudget('srv'), true);
  });

  test('isOverSchemaBudget defaults to false for unknown servers', () => {
    const dmt = new DeferredMCPTools(fakeMcpClient());
    assert.strictEqual(dmt.isOverSchemaBudget('unknown'), false);
  });

  test('getSearchDescription notes over-budget servers stay deferred', () => {
    const dmt = new DeferredMCPTools(fakeMcpClient(), 10);
    dmt.applyBudget('huge', 'x'.repeat(1000));
    const desc = dmt.getSearchDescription('huge');
    assert.ok(desc.includes('over schema budget'));
  });
});
