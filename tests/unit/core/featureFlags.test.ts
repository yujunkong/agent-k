/**
 * Feature flags — Settings Hub toggles → tool/command gates
 */
import * as assert from 'assert';
import { configManager } from '../../../src/core/ConfigManager';
import {
  featureForTool,
  isFeatureEnabled,
  isToolFeatureEnabled
} from '../../../src/core/featureFlags';
import { ToolRegistry } from '../../../src/tools/registry';

suite('featureFlags', () => {
  const keys = [
    'agent-k.features.browser',
    'agent-k.features.mcp',
    'agent-k.features.skills',
    'agent-k.features.sub-agents',
    'agent-k.features.codebase-index',
    'agent-k.features.inline-completion'
  ] as const;
  const snapshot: Record<string, unknown> = {};

  suiteSetup(() => {
    for (const k of keys) {
      snapshot[k] = configManager.get(k);
    }
  });

  suiteTeardown(() => {
    configManager.update(snapshot as Record<string, any>);
  });

  test('defaults: most features on, inline-completion off', () => {
    configManager.update({
      'agent-k.features.browser': true,
      'agent-k.features.inline-completion': false
    });
    assert.strictEqual(isFeatureEnabled('browser'), true);
    assert.strictEqual(isFeatureEnabled('inline-completion'), false);
  });

  test('featureForTool maps browser/mcp/skills/task/codebase', () => {
    assert.strictEqual(featureForTool('browser_navigate'), 'browser');
    assert.strictEqual(featureForTool('mcp_foo_bar'), 'mcp');
    assert.strictEqual(featureForTool('mcp_list_tools'), 'mcp');
    assert.strictEqual(featureForTool('web_search'), 'mcp');
    assert.strictEqual(featureForTool('skill_run'), 'skills');
    assert.strictEqual(featureForTool('task_run'), 'sub-agents');
    assert.strictEqual(featureForTool('task'), 'sub-agents');
    assert.strictEqual(featureForTool('codebase_search'), 'codebase-index');
    assert.strictEqual(featureForTool('read_file'), null);
  });

  test('disabling browser hides browser tools from schemas', () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: 'browser_navigate',
      description: 'nav',
      parameters: { type: 'object', properties: {} },
      modeAllowlist: ['agent'],
      category: 'web'
    });
    registry.registerTool({
      name: 'read_file',
      description: 'read',
      parameters: { type: 'object', properties: {} },
      modeAllowlist: ['agent'],
      category: 'search'
    });

    configManager.update({ 'agent-k.features.browser': false });
    assert.strictEqual(isToolFeatureEnabled('browser_navigate'), false);

    const schemas = registry.getSchemas('agent');
    const names = schemas.map((s: any) => s.function.name);
    assert.ok(!names.includes('browser_navigate'));
    assert.ok(names.includes('read_file'));

    configManager.update({ 'agent-k.features.browser': true });
    assert.ok(
      registry.getSchemas('agent').some((s: any) => s.function.name === 'browser_navigate')
    );
  });
});
