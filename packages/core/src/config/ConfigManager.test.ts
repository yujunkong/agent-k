/**
 * CFG-001 — ConfigManager unit tests.
 */
import { describe, expect, it, vi } from 'vitest';
import { ConfigManager, createDefaultConfig } from './ConfigManager';
import {
  DEFAULT_DENY_GLOBS,
  DEFAULT_PERMISSION_LEVEL,
  DEFAULT_REQUIRE_APPROVAL_TOOLS,
} from './PermissionConfig';

describe('ConfigManager (CFG-001)', () => {
  it('seeds permission defaults from CFG-003', () => {
    const cm = new ConfigManager();
    expect(cm.get('agent-k.permission.level')).toBe(DEFAULT_PERMISSION_LEVEL);
    expect(cm.get('agent-k.permission.denyGlobs')).toEqual([...DEFAULT_DENY_GLOBS]);
    expect(cm.get('agent-k.permission.requireApprovalTools')).toEqual([
      ...DEFAULT_REQUIRE_APPROVAL_TOOLS,
    ]);
  });

  it('queue keys match product defaults', () => {
    const cm = new ConfigManager();
    expect(cm.get('agent-k.queue.onEnterWhileRunning')).toBe('resynthesize');
    expect(cm.get('agent-k.queue.onStop')).toBe('keep');
    expect(cm.get('agent-k.queue.resynthesizeDebounceMs')).toBe(300);
    expect(cm.get('agent-k.queue.debounceMs')).toBe(300);
  });

  it('set notifies listeners and persists via storage', () => {
    const store = new Map<string, unknown>();
    const cm = new ConfigManager();
    cm.setStorage({
      get: (k) => store.get(k),
      set: (k, v) => {
        store.set(k, v);
      },
    });
    const seen: unknown[] = [];
    cm.on('agent-k.maxTurns', (_k, v) => seen.push(v));
    cm.set('agent-k.maxTurns', 40);
    expect(cm.get('agent-k.maxTurns')).toBe(40);
    expect(seen).toEqual([40]);
    expect(typeof store.get('agent-k.config')).toBe('string');
  });

  it('syncFromVSCode does not echo to updater', () => {
    const cm = new ConfigManager();
    const updater = vi.fn();
    cm.bindVSCodeUpdater(updater);
    cm.syncFromVSCode({ 'agent-k.mode.default': 'plan' });
    expect(cm.get('agent-k.mode.default')).toBe('plan');
    expect(updater).not.toHaveBeenCalled();
  });

  it('set pushes allowlisted keys to VS Code updater', () => {
    const cm = new ConfigManager();
    const updater = vi.fn();
    cm.bindVSCodeUpdater(updater);
    cm.set('agent-k.permission.level', 'ask');
    expect(updater).toHaveBeenCalledWith('agent-k.permission.level', 'ask');
  });

  it('validate rejects invalid permission level and baseUrl', () => {
    const cm = new ConfigManager();
    expect(cm.validate('agent-k.permission.level', 'nope')).toMatch(/Invalid permission/);
    expect(cm.validate('agent-k.provider.baseUrl', 'ftp://x')).toMatch(/http/);
    expect(cm.validate('agent-k.context.budget', 100)).toMatch(/1000/);
  });

  it('reset restores a single key to createDefaultConfig value', () => {
    const cm = new ConfigManager();
    cm.set('agent-k.maxTurns', 99);
    cm.reset('agent-k.maxTurns');
    expect(cm.get('agent-k.maxTurns')).toBe(createDefaultConfig()['agent-k.maxTurns']);
  });
});
