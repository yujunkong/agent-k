/**
 * HealthCheck - 프로바이더 헬스체크
 *
 * GET /models 로 검증. UI 는 이벤트 기반(Connect / 재시도 / Composer 엔드포인트 변경).
 * 주기적 polling 은 호출하지 않는 것이 기본이며, startPeriodic 은 호환용으로만 남긴다.
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
  private states: Map<string, HealthState> = new Map();
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private checkers: Map<string, () => Promise<{ healthy: boolean; latency?: number }>> = new Map();

  registerChecker(providerId: string, checkFn: () => Promise<{ healthy: boolean; latency?: number }>) {
    this.checkers.set(providerId, checkFn);
    this.states.set(providerId, { providerId, status: 'unknown', lastChecked: 0 });
  }

  unregister(providerId: string) {
    this.checkers.delete(providerId);
    this.stopPeriodic(providerId);
    this.states.delete(providerId);
  }

  async check(providerId: string): Promise<HealthState> {
    const checkFn = this.checkers.get(providerId);
    if (!checkFn) {
      return { providerId, status: 'unknown', lastChecked: Date.now(), error: 'No checker registered' };
    }

    try {
      const result = await checkFn();
      const state: HealthState = {
        providerId,
        status: result.healthy ? (result.latency && result.latency > 2000 ? 'degraded' : 'healthy') : 'unhealthy',
        latency: result.latency,
        lastChecked: Date.now()
      };
      this.states.set(providerId, state);
      return state;
    } catch (error: any) {
      const state: HealthState = {
        providerId,
        status: 'unhealthy',
        lastChecked: Date.now(),
        error: error?.message || 'Unknown error'
      };
      this.states.set(providerId, state);
      return state;
    }
  }

  async checkAll(): Promise<Map<string, HealthState>> {
    const results = new Map<string, HealthState>();
    for (const [id] of this.checkers) {
      const state = await this.check(id);
      results.set(id, state);
    }
    return results;
  }

  getState(providerId: string): HealthState | undefined {
    return this.states.get(providerId);
  }

  startPeriodic(providerId: string, intervalMs = 5 * 60 * 1000) {
    this.stopPeriodic(providerId);
    // Run immediately
    this.check(providerId);
    // Then periodically
    const interval = setInterval(() => this.check(providerId), intervalMs);
    this.intervals.set(providerId, interval);
  }

  stopPeriodic(providerId: string) {
    const interval = this.intervals.get(providerId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(providerId);
    }
  }

  startAllPeriodic(intervalMs = 5 * 60 * 1000) {
    for (const [id] of this.checkers) {
      this.startPeriodic(id, intervalMs);
    }
  }

  stopAll() {
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();
  }
}

export const healthCheck = new HealthCheck();
