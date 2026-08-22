/**
 * STREAM-008 — Plan generate watchdog (renamed from planV2* in v3).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAN_GENERATE_TIMEOUT_MS,
  createPlanGenerateWatchdog
} from './planGenerateWatchdog';

describe('STREAM-008 createPlanGenerateWatchdog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('arms 180s immediately so old hosts without started still time out', () => {
    vi.useFakeTimers();
    const onGenerateTimeout = vi.fn();
    createPlanGenerateWatchdog({
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      onGenerateTimeout
    });
    expect(onGenerateTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PLAN_GENERATE_TIMEOUT_MS);
    expect(onGenerateTimeout).toHaveBeenCalledOnce();
  });

  it('host started signal restarts the 180s budget', () => {
    vi.useFakeTimers();
    const onGenerateTimeout = vi.fn();
    const watchdog = createPlanGenerateWatchdog({
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      onGenerateTimeout
    });
    vi.advanceTimersByTime(PLAN_GENERATE_TIMEOUT_MS - 1);
    watchdog.beginGenerateTimeout();
    vi.advanceTimersByTime(PLAN_GENERATE_TIMEOUT_MS - 1);
    expect(onGenerateTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onGenerateTimeout).toHaveBeenCalledOnce();
  });

  it('clear leaves no pending timeout', () => {
    vi.useFakeTimers();
    const onGenerateTimeout = vi.fn();
    const watchdog = createPlanGenerateWatchdog({
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      onGenerateTimeout
    });
    watchdog.clear();
    vi.advanceTimersByTime(PLAN_GENERATE_TIMEOUT_MS + 1000);
    expect(onGenerateTimeout).not.toHaveBeenCalled();
  });
});
