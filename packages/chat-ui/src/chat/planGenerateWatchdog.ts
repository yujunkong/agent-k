/** LLM generation budget. Reset when the host reports generate() actually started. */
export const PLAN_GENERATE_TIMEOUT_MS = 180_000;

export const PLAN_GENERATE_TIMEOUT_MESSAGE =
  'Plan generation exceeded 180s and was cancelled. If it already finished, it will be applied shortly.';

export interface PlanGenerateWatchdog {
  beginGenerateTimeout: () => void;
  clear: () => void;
}

export function createPlanGenerateWatchdog(opts: {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  onGenerateTimeout: () => void;
}): PlanGenerateWatchdog {
  let generateTimer: unknown;
  let settled = false;

  const arm = () => {
    if (settled) return;
    if (generateTimer != null) opts.clearTimeout(generateTimer);
    generateTimer = opts.setTimeout(() => {
      if (settled) return;
      settled = true;
      generateTimer = undefined;
      opts.onGenerateTimeout();
    }, PLAN_GENERATE_TIMEOUT_MS);
  };

  // Fallback for hosts that never send plan.generate.started (no F5).
  // beginGenerateTimeout() restarts this budget after the host actually begins.
  arm();

  return {
    beginGenerateTimeout() {
      arm();
    },
    clear() {
      settled = true;
      if (generateTimer != null) opts.clearTimeout(generateTimer);
      generateTimer = undefined;
    }
  };
}
