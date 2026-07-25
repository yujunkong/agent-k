/**
 * TelemetryCollector - 턴 로그, 도구 지연시간, 토큰 사용량 (C4-T25)
 */
export interface TurnLog {
  turnNumber: number;
  toolName?: string;
  toolCategory?: string;
  duration: number;
  tokensUsed?: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface TelemetrySummary {
  totalTurns: number;
  totalDuration: number;
  avgTurnDuration: number;
  totalTokens: number;
  toolUsage: Map<string, number>;
  errorRate: number;
  successRate: number;
}

export class TelemetryCollector {
  private logs: TurnLog[] = [];
  private startTime: number = Date.now();

  record(log: TurnLog): void {
    this.logs.push(log);
    // Keep only last 1000 entries
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }
  }

  recordToolCall(toolName: string, category: string, duration: number, success: boolean, error?: string): void {
    this.record({
      turnNumber: this.logs.length + 1,
      toolName,
      toolCategory: category,
      duration,
      success,
      error,
      timestamp: Date.now()
    });
  }

  getSummary(): TelemetrySummary {
    const totalTurns = this.logs.length;
    const totalDuration = this.logs.reduce((sum, l) => sum + l.duration, 0);
    const totalTokens = this.logs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0);
    const successes = this.logs.filter(l => l.success).length;
    const errors = this.logs.filter(l => !l.success).length;

    const toolUsage = new Map<string, number>();
    for (const log of this.logs) {
      if (log.toolName) {
        toolUsage.set(log.toolName, (toolUsage.get(log.toolName) || 0) + 1);
      }
    }

    return {
      totalTurns,
      totalDuration,
      avgTurnDuration: totalTurns > 0 ? totalDuration / totalTurns : 0,
      totalTokens,
      toolUsage,
      errorRate: totalTurns > 0 ? errors / totalTurns : 0,
      successRate: totalTurns > 0 ? successes / totalTurns : 0
    };
  }

  getRecentLogs(count = 20): TurnLog[] {
    return this.logs.slice(-count);
  }

  getToolStats(toolName: string): { calls: number; avgDuration: number; errorRate: number } {
    const toolLogs = this.logs.filter(l => l.toolName === toolName);
    const calls = toolLogs.length;
    const avgDuration = calls > 0 ? toolLogs.reduce((s, l) => s + l.duration, 0) / calls : 0;
    const errors = toolLogs.filter(l => !l.success).length;
    return { calls, avgDuration, errorRate: calls > 0 ? errors / calls : 0 };
  }

  clear(): void {
    this.logs = [];
    this.startTime = Date.now();
  }

  getSessionDuration(): number {
    return Date.now() - this.startTime;
  }
}
