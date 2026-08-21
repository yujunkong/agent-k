/**
 * CFG-002 — ProjectConfig unit tests.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENTK_DIR,
  PROJECT_CONFIG_PATH,
  exampleProjectConfig,
  flattenProjectConfig,
  parseProjectConfigJson,
  pickProjectConfigValues,
  unflattenProjectConfig,
} from './ProjectConfig';

describe('ProjectConfig (CFG-002)', () => {
  it('canonical path is .agentk/settings.json', () => {
    expect(PROJECT_CONFIG_PATH).toBe('.agentk/settings.json');
    expect(AGENTK_DIR).toBe('.agentk');
    expect(PROJECT_CONFIG_PATH.startsWith(`${AGENTK_DIR}/`)).toBe(true);
  });

  it('flattens nested provider / thinking / permission', () => {
    const flat = flattenProjectConfig({
      provider: { model: 'deepseek-v4-pro', type: 'litellm' },
      thinking: { effort: 'max' },
      maxTurns: 40,
      permission: { level: 'ask' },
    });
    expect(flat['agent-k.provider.model']).toBe('deepseek-v4-pro');
    expect(flat['agent-k.provider.type']).toBe('litellm');
    expect(flat['agent-k.thinking.effort']).toBe('max');
    expect(flat['agent-k.maxTurns']).toBe(40);
    expect(flat['agent-k.permission.level']).toBe('ask');
  });

  it('accepts already-flat agent-k.* keys and drops unknown', () => {
    const flat = flattenProjectConfig({
      'agent-k.thinking.effort': 'high',
      ignored: true,
    });
    expect(flat['agent-k.thinking.effort']).toBe('high');
    expect(flat['agent-k.ignored']).toBeUndefined();
  });

  it('round-trips unflatten → flatten', () => {
    const nested = exampleProjectConfig();
    const flat = flattenProjectConfig(nested);
    const again = flattenProjectConfig(unflattenProjectConfig(flat));
    expect(again['agent-k.provider.type']).toBe(flat['agent-k.provider.type']);
    expect(again['agent-k.thinking.effort']).toBe(flat['agent-k.thinking.effort']);
    expect(again['agent-k.permission.level']).toBe(flat['agent-k.permission.level']);
  });

  it('parseProjectConfigJson rejects invalid JSON', () => {
    const bad = parseProjectConfigJson('{');
    expect(bad.ok).toBe(false);
  });

  it('pickProjectConfigValues strips secrets', () => {
    const picked = pickProjectConfigValues({
      'agent-k.provider.model': 'x',
      'agent-k.provider.apiKey': 'secret',
      'agent-k.github.token': 'ghp_x',
    });
    expect(picked['agent-k.provider.model']).toBe('x');
    expect(picked['agent-k.provider.apiKey']).toBeUndefined();
    expect(picked['agent-k.github.token']).toBeUndefined();
  });
});
