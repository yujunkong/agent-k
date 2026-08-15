/** LLM generation budget. Reset when the host reports generate() actually started. */
export const PLAN_V2_GENERATE_TIMEOUT_MS = 180_000;

export const PLAN_V2_GENERATE_TIMEOUT_MESSAGE =
  'Plan 생성이 180초를 초과해 중단했습니다. 호스트 요청을 취소했습니다. 이미 생성이 끝나 있으면 잠시 후 자동으로 반영됩니다.';

export interface PlanV2GenerateWatchdog {
  beginGenerateTimeout: () => void;
  clear: () => void;
}

export function createPlanV2GenerateWatchdog(opts: {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  onGenerateTimeout: () => void;
}): PlanV2GenerateWatchdog {
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
    }, PLAN_V2_GENERATE_TIMEOUT_MS);
  };

  // Fallback for hosts that never send plan.v2.generate.started (no F5).
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
