/**
 * PLAN2-014 — Plan generation watchdog (owner = packages/plan).
 * STREAM-008 / REL-002 remain thin callers of this helper.
 */

export const PLAN_GENERATE_TIMEOUT_MS = 180_000;

export const PLAN_GENERATE_TIMEOUT_MESSAGE =
  'Plan generation exceeded timeout and was cancelled.';

export interface PlanWatchdog {
  beginGenerateTimeout: () => void;
  clear: () => void;
}

export function createPlanWatchdog(opts: {
  timeoutMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  onTimeout: () => void;
}): PlanWatchdog {
  const timeoutMs = opts.timeoutMs ?? PLAN_GENERATE_TIMEOUT_MS;
  const setT = opts.setTimeoutFn ?? setTimeout;
  const clearT =
    opts.clearTimeoutFn ??
    ((id: unknown) => {
      clearTimeout(id as ReturnType<typeof setTimeout>);
    });
  let timer: unknown;
  let settled = false;

  const arm = () => {
    if (settled) return;
    if (timer != null) clearT(timer);
    timer = setT(() => {
      if (settled) return;
      settled = true;
      timer = undefined;
      opts.onTimeout();
    }, timeoutMs);
  };

  arm();

  return {
    beginGenerateTimeout() {
      arm();
    },
    clear() {
      settled = true;
      if (timer != null) clearT(timer);
      timer = undefined;
    },
  };
}
