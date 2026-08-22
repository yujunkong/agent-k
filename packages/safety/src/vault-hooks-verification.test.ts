/**
 * SAFE-005 / SAFE-006 / SAFE-007 / SAFE-008 / SAFE-009 / SAFE-010 unit tests.
 */
import { describe, expect, it, vi } from 'vitest';
import { InMemorySecretsVault } from './SecretsVault';
import { CheckpointManager } from './CheckpointManager';
import {
  isVerificationFirstEnabled,
  resolveVerificationFirstPolicy,
} from './VerificationFirst';
import { runVerificationMicroLoop } from './VerificationMicroLoop';
import { StubRelatedTestRunner } from './RelatedTestRunner';
import { HooksSystem } from './HooksSystem';
import { createSafetyError } from './types';

describe('SAFE-005 SecretsVault', () => {
  it('set/get/delete without exposing values in toString', async () => {
    const vault = new InMemorySecretsVault();
    await vault.set('apiKey', 'sk-super-secret');
    expect(await vault.get('apiKey')).toBe('sk-super-secret');
    expect(vault.toString()).toBe('InMemorySecretsVault(size=1)');
    expect(vault.toString()).not.toContain('sk-super-secret');

    await vault.delete('apiKey');
    expect(await vault.get('apiKey')).toBeUndefined();
    const missing = await vault.getResult('apiKey');
    expect(missing.ok).toBe(false);
  });
});

describe('SAFE-006 CheckpointManager', () => {
  it('create/list/restore metadata-only snapshots', () => {
    const mgr = new CheckpointManager();
    const cp = mgr.create(
      { 'src/a.ts': 'const a = 1' },
      { trigger: 'first_write', mode: 'agent', turnNumber: 1 },
    );
    expect(mgr.list()).toHaveLength(1);
    expect(cp.fileSnapshots[0]?.content).toBe('const a = 1');

    const restored = mgr.restore(cp.id);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.value.fileSnapshots[0]?.filePath).toBe('src/a.ts');
    }

    const missing = mgr.restore('nope');
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe('CHECKPOINT_NOT_FOUND');
    }
  });
});

describe('SAFE-007 VerificationFirst', () => {
  it('resolves boolean and nested flag shapes', () => {
    expect(isVerificationFirstEnabled(true)).toBe(true);
    expect(isVerificationFirstEnabled(false)).toBe(false);
    expect(isVerificationFirstEnabled({ verificationFirst: false })).toBe(false);
    expect(
      isVerificationFirstEnabled({ 'agent-k.verification.first': true }),
    ).toBe(true);
    expect(isVerificationFirstEnabled(undefined)).toBe(true);
    expect(resolveVerificationFirstPolicy(false).enabled).toBe(false);
  });
});

describe('SAFE-008 VerificationMicroLoop', () => {
  it('passes on first check', async () => {
    const result = await runVerificationMicroLoop({
      check: () => true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.checkCount).toBe(1);
      expect(result.value.fixAttempts).toBe(0);
    }
  });

  it('fixes then passes within max attempts', async () => {
    let healthy = false;
    const fix = vi.fn(async () => {
      healthy = true;
    });
    const result = await runVerificationMicroLoop({
      check: () => healthy,
      fix,
      maxFixAttempts: 2,
    });
    expect(result.ok).toBe(true);
    expect(fix).toHaveBeenCalledTimes(1);
  });

  it('stops with VERIFICATION_FAILED after max fixes', async () => {
    const result = await runVerificationMicroLoop({
      check: () => false,
      fix: async () => undefined,
      maxFixAttempts: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VERIFICATION_FAILED');
      expect(result.error.details?.fixAttempts).toBe(2);
    }
  });
});

describe('SAFE-009 RelatedTestRunner stub', () => {
  it('records requested paths', async () => {
    const runner = new StubRelatedTestRunner();
    await runner.runRelated({ paths: ['src/a.ts', 'src/a.test.ts'] });
    expect(runner.requestedPaths).toEqual([['src/a.ts', 'src/a.test.ts']]);
    const empty = await runner.runRelatedResult({ paths: [] });
    expect(empty.ok).toBe(false);
  });
});

describe('SAFE-010 HooksSystem', () => {
  it('runs before/after hooks', async () => {
    const hooks = new HooksSystem();
    const before = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const after = vi.fn(async () => ({ ok: true as const, value: undefined }));
    hooks.registerBeforeTool(before);
    hooks.registerAfterTool(after);

    await expect(
      hooks.runBeforeTool({ toolName: 'edit_file' }),
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(
      hooks.runAfterTool({ toolName: 'edit_file', result: { ok: true } }),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(before).toHaveBeenCalled();
    expect(after).toHaveBeenCalled();
  });

  it('returns explicit error when hook blocks', async () => {
    const hooks = new HooksSystem();
    hooks.registerBeforeTool(async () => ({
      ok: false,
      error: createSafetyError('HOOK_BLOCKED', 'blocked by policy'),
    }));
    const result = await hooks.runBeforeTool({ toolName: 'run_terminal_cmd' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('HOOK_BLOCKED');
    }
  });

  it('maps thrown errors to HOOK_FAILED', async () => {
    const hooks = new HooksSystem();
    hooks.registerAfterTool(async () => {
      throw new Error('boom');
    });
    const result = await hooks.runAfterTool({ toolName: 'edit_file' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('HOOK_FAILED');
      expect(result.error.message).toBe('boom');
    }
  });
});
