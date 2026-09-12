/**
 * TEL-001~003 telemetry unit tests (v2.1 ADDON-T11 동작 동등)
 */
import { describe, it, expect } from 'vitest';
import {
  estimateCostUsd,
  formatTokenStatusBar,
  SessionUsageTracker,
  DEFAULT_COST_RATES,
} from './StatusBarCost';
import { CostTracker, type BudgetStorage } from './CostTracker';
import { TelemetryCollector } from './TelemetryCollector';

describe('TEL-002 StatusBarCost', () => {
  it('estimateCostUsd uses default ~$0.15/$0.60 per 1M rates', () => {
    const cost = estimateCostUsd(1_000_000, 1_000_000);
    expect(Math.abs(cost - (DEFAULT_COST_RATES.promptPerM + DEFAULT_COST_RATES.completionPerM))).toBeLessThan(1e-9);
  });

  it('estimateCostUsd zero tokens is zero cost', () => {
    expect(estimateCostUsd(0, 0)).toBe(0);
  });

  it('estimateCostUsd clamps negative inputs to zero', () => {
    expect(estimateCostUsd(-100, -50)).toBe(0);
  });

  it('estimateCostUsd honors custom rates', () => {
    const cost = estimateCostUsd(500_000, 0, { promptPerM: 2, completionPerM: 0 });
    expect(Math.abs(cost - 1)).toBeLessThan(1e-9);
  });

  it('formatTokenStatusBar without cost', () => {
    const text = formatTokenStatusBar(1500);
    expect(text).toContain('1.5k');
    expect(text).not.toMatch(/\$\d/);
  });

  it('formatTokenStatusBar with cost', () => {
    const text = formatTokenStatusBar(2_500_000, 0.42);
    expect(text).toContain('2.5M');
    expect(text).toContain('$0.4200');
  });

  it('formatTokenStatusBar rounds small counts', () => {
    expect(formatTokenStatusBar(7)).toContain('7 tok');
  });

  it('SessionUsageTracker accumulates prompt/completion across calls', () => {
    const tracker = new SessionUsageTracker();
    tracker.recordUsage(100, 50);
    tracker.recordUsage(200, 25);
    const totals = tracker.getTotals();
    expect(totals.promptTokens).toBe(300);
    expect(totals.completionTokens).toBe(75);
    expect(totals.totalTokens).toBe(375);
    expect(totals.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('SessionUsageTracker.formatTooltip includes prompt/completion/cost summary', () => {
    const tracker = new SessionUsageTracker();
    tracker.recordUsage(1000, 500);
    const tooltip = tracker.formatTooltip();
    expect(tooltip).toContain('Prompt');
    expect(tooltip).toContain('Completion');
    expect(tooltip).toContain('Total');
    expect(tooltip).toContain('$');
  });

  it('SessionUsageTracker.reset clears totals', () => {
    const tracker = new SessionUsageTracker();
    tracker.recordUsage(500, 500);
    tracker.reset();
    const totals = tracker.getTotals();
    expect(totals.totalTokens).toBe(0);
    expect(totals.estimatedCostUsd).toBe(0);
  });

  it('SessionUsageTracker.formatStatusBar matches formatTokenStatusBar output', () => {
    const tracker = new SessionUsageTracker();
    tracker.recordUsage(10_000, 0);
    const totals = tracker.getTotals();
    expect(tracker.formatStatusBar()).toBe(formatTokenStatusBar(totals.totalTokens, totals.estimatedCostUsd));
  });
});

describe('TEL-001 CostTracker', () => {
  it('records token usage and reports status', () => {
    const tracker = new CostTracker();
    tracker.recordTokenUsage(1000);
    const status = tracker.getStatus();
    expect(status.dailyUsed).toBe(1000);
    expect(status.monthlyUsed).toBe(1000);
    expect(status.exceeded).toBe(false);
    expect(status.warning).toBe(false);
  });

  it('warns at threshold and exceeds at budget', () => {
    const tracker = new CostTracker({ dailyTokenBudget: 1000, monthlyTokenBudget: 1000, warningThreshold: 0.8 });
    tracker.recordTokenUsage(850);
    expect(tracker.getStatus().warning).toBe(true);
    expect(tracker.getWarningMessage()).toContain('nearly exhausted');
    tracker.recordTokenUsage(200);
    expect(tracker.isOverBudget()).toBe(true);
    expect(tracker.getWarningMessage()).toContain('exceeded');
  });

  it('monthly budget alone can exceed', () => {
    const tracker = new CostTracker({ dailyTokenBudget: 1_000_000, monthlyTokenBudget: 100 });
    tracker.recordTokenUsage(150);
    expect(tracker.isOverBudget()).toBe(true);
  });

  it('persists via storage port and reloads same-day values', () => {
    const backing = new Map<string, string>();
    const storage: BudgetStorage = {
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => void backing.set(k, v),
    };
    const tracker = new CostTracker(undefined, storage);
    tracker.recordTokenUsage(1234);

    const reloaded = new CostTracker(undefined, storage);
    expect(reloaded.getStatus().dailyUsed).toBe(1234);
  });

  it('stale daily entries reset to zero on load', () => {
    const backing = new Map<string, string>();
    backing.set('agent-k.budget.daily', JSON.stringify({ value: 999, date: 'Old Date' }));
    const storage: BudgetStorage = {
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => void backing.set(k, v),
    };
    const tracker = new CostTracker(undefined, storage);
    expect(tracker.getStatus().dailyUsed).toBe(0);
  });

  it('resetDaily / resetMonthly clear counters', () => {
    const tracker = new CostTracker();
    tracker.recordTokenUsage(500);
    tracker.resetDaily();
    expect(tracker.getStatus().dailyUsed).toBe(0);
    expect(tracker.getStatus().monthlyUsed).toBe(500);
    tracker.resetMonthly();
    expect(tracker.getStatus().monthlyUsed).toBe(0);
  });
});

describe('TEL-003 TelemetryCollector', () => {
  it('records tool calls and summarizes', () => {
    const collector = new TelemetryCollector();
    collector.recordToolCall('read_file', 'read', 100, true);
    collector.recordToolCall('read_file', 'read', 200, true);
    collector.recordToolCall('edit_file', 'edit', 300, false, 'boom');

    const summary = collector.getSummary();
    expect(summary.totalTurns).toBe(3);
    expect(summary.toolUsage.get('read_file')).toBe(2);
    expect(summary.toolUsage.get('edit_file')).toBe(1);
    expect(summary.successRate).toBeCloseTo(2 / 3);
    expect(summary.errorRate).toBeCloseTo(1 / 3);
    expect(summary.avgTurnDuration).toBeCloseTo(200);
  });

  it('getToolStats reports per-tool calls/avg/error rate', () => {
    const collector = new TelemetryCollector();
    collector.recordToolCall('grep', 'search', 50, true);
    collector.recordToolCall('grep', 'search', 150, false, 'err');
    const stats = collector.getToolStats('grep');
    expect(stats.calls).toBe(2);
    expect(stats.avgDuration).toBe(100);
    expect(stats.errorRate).toBe(0.5);
  });

  it('caps logs at 1000 entries', () => {
    const collector = new TelemetryCollector();
    for (let i = 0; i < 1100; i++) {
      collector.recordToolCall('t', 'c', 1, true);
    }
    expect(collector.getSummary().totalTurns).toBe(1000);
    // v2.1 동작: turnNumber = logs.length + 1 → 캡 이후 1001 고정
    expect(collector.getRecentLogs(1)[0].turnNumber).toBe(1001);
  });

  it('clear resets logs and session duration baseline', () => {
    const collector = new TelemetryCollector();
    collector.recordToolCall('t', 'c', 1, true);
    collector.clear();
    expect(collector.getSummary().totalTurns).toBe(0);
    expect(collector.getSessionDuration()).toBeGreaterThanOrEqual(0);
  });
});
