import * as assert from 'assert';
import {
  PROJECT_CONFIG_PATH,
  exampleProjectConfig,
  flattenProjectConfig,
  parseProjectConfigJson,
  pickProjectConfigValues,
  unflattenProjectConfig,
} from '../../../src/core/ProjectConfig';

suite('ProjectConfig', () => {
  test('canonical path is .agent-k/settings.json', () => {
    assert.strictEqual(PROJECT_CONFIG_PATH, '.agent-k/settings.json');
  });

  test('flattens nested provider / thinking', () => {
    const flat = flattenProjectConfig({
      provider: { model: 'deepseek-v4-pro', type: 'litellm' },
      thinking: { effort: 'max' },
      maxTurns: 40,
    });
    assert.strictEqual(flat['agent-k.provider.model'], 'deepseek-v4-pro');
    assert.strictEqual(flat['agent-k.provider.type'], 'litellm');
    assert.strictEqual(flat['agent-k.thinking.effort'], 'max');
    assert.strictEqual(flat['agent-k.maxTurns'], 40);
  });

  test('accepts already-flat agent-k.* keys', () => {
    const flat = flattenProjectConfig({
      'agent-k.thinking.effort': 'high',
      ignored: true,
    });
    assert.strictEqual(flat['agent-k.thinking.effort'], 'high');
    assert.strictEqual(flat['agent-k.ignored'], undefined);
  });

  test('round-trips unflatten → flatten', () => {
    const nested = exampleProjectConfig();
    const flat = flattenProjectConfig(nested);
    const again = flattenProjectConfig(unflattenProjectConfig(flat));
    assert.strictEqual(again['agent-k.provider.model'], flat['agent-k.provider.model']);
    assert.strictEqual(again['agent-k.thinking.effort'], flat['agent-k.thinking.effort']);
  });

  test('parseProjectConfigJson rejects invalid JSON', () => {
    const bad = parseProjectConfigJson('{');
    assert.strictEqual(bad.ok, false);
  });

  test('pickProjectConfigValues strips secrets', () => {
    const picked = pickProjectConfigValues({
      'agent-k.provider.model': 'x',
      'agent-k.provider.apiKey': 'secret',
      'agent-k.github.token': 'ghp_x',
    });
    assert.strictEqual(picked['agent-k.provider.model'], 'x');
    assert.strictEqual(picked['agent-k.provider.apiKey'], undefined);
    assert.strictEqual(picked['agent-k.github.token'], undefined);
  });
});
