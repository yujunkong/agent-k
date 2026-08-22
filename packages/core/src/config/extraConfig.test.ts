/**
 * CFG-004…007, 009, 010 — harness/queue/terminal/review/thinking/classifier config.
 */
import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from './ConfigManager';
import {
  clampThinkingEffort,
  extractDebugClassifierConfig,
  extractHarnessConfig,
  extractQueueConfig,
  extractReviewConfig,
  extractTerminalConfig,
  extractThinkingEffort,
  isTerminalCommandDenied,
} from './index';

describe('extra config (CFG-004…010)', () => {
  it('extracts harness/queue/terminal/review/thinking/classifier from defaults', () => {
    const bag = createDefaultConfig();
    expect(extractHarnessConfig(bag).enabled).toBe(true);
    expect(extractQueueConfig(bag).onEnterWhileRunning).toBe('resynthesize');
    expect(extractTerminalConfig(bag).timeoutMs).toBe(60_000);
    expect(extractReviewConfig(bag).applyPolicy).toBe('manual');
    expect(extractThinkingEffort(bag)).toBe('medium');
    expect(extractDebugClassifierConfig(bag).enabled).toBe(false);
  });

  it('denies terminal commands matching patterns', () => {
    expect(isTerminalCommandDenied('rm -rf /', ['rm\\s+-rf'])).toBe(true);
    expect(isTerminalCommandDenied('ls -la', ['rm\\s+-rf'])).toBe(false);
  });

  it('clamps thinking effort to allowed levels', () => {
    expect(clampThinkingEffort('max', ['off', 'high', 'max'])).toBe('max');
    expect(clampThinkingEffort('low', ['off', 'high', 'max'])).toBe('high');
  });
});
