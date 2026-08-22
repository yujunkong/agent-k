/**
 * AGENT-009 — Idle turn/run timeout (bump on LLM/tool activity).
 */

export const DEFAULT_TURN_TIMEOUT_MS = 120_000;

export function resolveTurnTimeoutMs(
  configValue: number | undefined,
  settingsValue: unknown
): number {
  if (typeof configValue === 'number' && Number.isFinite(configValue)) {
    return Math.max(0, Math.floor(configValue));
  }
  const fromSettings = Number(settingsValue);
  if (Number.isFinite(fromSettings) && fromSettings >= 0) {
    return Math.floor(fromSettings);
  }
  return DEFAULT_TURN_TIMEOUT_MS;
}

export type RunTimeoutCallbacks = {
  onTimeout: (ms: number) => void;
};

/**
 * Idle timeout for the whole agent run.
 * ms <= 0 disables. `bump()` resets the idle window.
 */
export class RunTimeoutGuard {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fired = false;
  private ms = 0;
  private cbs: RunTimeoutCallbacks | null = null;

  get didFire(): boolean {
    return this.fired;
  }

  arm(ms: number, cbs: RunTimeoutCallbacks): void {
    this.clearTimerOnly();
    this.fired = false;
    this.ms = ms;
    this.cbs = cbs;
    if (ms <= 0) return;
    this.schedule();
  }

  /** Reset idle window — call on LLM/tool activity. */
  bump(): void {
    if (this.fired || this.ms <= 0 || !this.cbs) return;
    this.schedule();
  }

  clear(): void {
    this.clearTimerOnly();
    this.cbs = null;
    this.ms = 0;
  }

  private clearTimerOnly(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    this.clearTimerOnly();
    this.timer = setTimeout(() => {
      this.fired = true;
      this.timer = null;
      this.cbs?.onTimeout(this.ms);
    }, this.ms);
  }
}
