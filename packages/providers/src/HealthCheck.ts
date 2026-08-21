/**
 * PROVIDER-008 — Provider health check registry.
 * UI is event-driven (Connect / retry); startPeriodic is legacy-compat only.
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthState {
  providerId: string;
  status: HealthStatus;
  latency?: number;
  lastChecked: number;
  error?: string;
}

export class HealthCheck {
  private readonly states = new Map<string, HealthState>();
  private readonly intervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly checkers = new Map<
    string,
    () => Promise<{ healthy: boolean; latency?: number }>
  >();

  registerChecker(
    providerId: string,
    checkFn: () => Promise<{ healthy: boolean; latency?: number }>,
  ): void {
    this.checkers.set(providerId, checkFn);
    this.states.set(providerId, { providerId, status: 'unknown', lastChecked: 0 });
  }

  unregister(providerId: string): void {
    this.checkers.delete(providerId);
    this.stopPeriodic(providerId);
    this.states.delete(providerId);
  }

  async check(providerId: string): Promise<HealthState> {
    const checkFn = this.checkers.get(providerId);
    if (!checkFn) {
      return {
        providerId,
        status: 'unknown',
        lastChecked: Date.now(),
        error: 'No checker registered',
      };
    }

    try {
      const result = await checkFn();
      const state: HealthState = {
        providerId,
        status: result.healthy
          ? result.latency && result.latency > 2000
            ? 'degraded'
            : 'healthy'
          : 'unhealthy',
        latency: result.latency,
        lastChecked: Date.now(),
      };
      this.states.set(providerId, state);
      return state;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const state: HealthState = {
        providerId,
        status: 'unhealthy',
        lastChecked: Date.now(),
        error: message,
      };
      this.states.set(providerId, state);
      return state;
    }
  }

  async checkAll(): Promise<Map<string, HealthState>> {
    const results = new Map<string, HealthState>();
    for (const id of this.checkers.keys()) {
      results.set(id, await this.check(id));
    }
    return results;
  }

  getState(providerId: string): HealthState | undefined {
    return this.states.get(providerId);
  }

  startPeriodic(providerId: string, intervalMs = 5 * 60 * 1000): void {
    this.stopPeriodic(providerId);
    void this.check(providerId);
    const interval = setInterval(() => {
      void this.check(providerId);
    }, intervalMs);
    this.intervals.set(providerId, interval);
  }

  stopPeriodic(providerId: string): void {
    const interval = this.intervals.get(providerId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(providerId);
    }
  }

  startAllPeriodic(intervalMs = 5 * 60 * 1000): void {
    for (const id of this.checkers.keys()) {
      this.startPeriodic(id, intervalMs);
    }
  }

  stopAll(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}

export const healthCheck = new HealthCheck();
