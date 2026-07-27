/**
 * ADDON-T11: status bar token/cost unit tests
 */
import * as assert from 'assert';
import {
  estimateCostUsd,
  formatTokenStatusBar,
  SessionUsageTracker,
  DEFAULT_COST_RATES,
} from '../../../src/telemetry/StatusBarCost';

suite('ADDON-T11 StatusBarCost', () => {
  test('estimateCostUsd uses default ~$0.15/$0.60 per 1M rates', () => {
    const cost = estimateCostUsd(1_000_000, 1_000_000);
    assert.ok(Math.abs(cost - (DEFAULT_COST_RATES.promptPerM + DEFAULT_COST_RATES.completionPerM)) < 1e-9);
  });

  test('estimateCostUsd zero tokens is zero cost', () => {
    assert.strictEqual(estimateCostUsd(0, 0), 0);
  });

  test('estimateCostUsd clamps negative inputs to zero', () => {
    assert.strictEqual(estimateCostUsd(-100, -50), 0);
  });

  test('estimateCostUsd honors custom rates', () => {
    const cost = estimateCostUsd(500_000, 0, { promptPerM: 2, completionPerM: 0 });
    assert.ok(Math.abs(cost - 1) < 1e-9);
  });

  test('formatTokenStatusBar without cost', () => {
    const text = formatTokenStatusBar(1500);
    assert.ok(text.includes('1.5k'));
    assert.ok(!/\$\d/.test(text));
  });

  test('formatTokenStatusBar with cost', () => {
    const text = formatTokenStatusBar(2_500_000, 0.42);
    assert.ok(text.includes('2.5M'));
    assert.ok(text.includes('$0.4200'));
  });

  test('formatTokenStatusBar rounds small counts', () => {
    const text = formatTokenStatusBar(7);
    assert.ok(text.includes('7 tok'));
  });

  test('SessionUsageTracker accumulates prompt/completion across calls', () => {
    const tracker = new SessionUsageTracker();
    tracker.recordUsage(100, 50);
    tracker.recordUsage(200, 25);
    const totals = tracker.getTotals();
    assert.strictEqual(totals.promptTokens, 300);
    assert.strictEqual(totals.completionTokens, 75);
    assert.strictEqual(totals.totalTokens, 375);
    assert.ok(totals.estimatedCostUsd > 0);
  });

  test('SessionUsageTracker.formatTooltip includes prompt/completion/cost summary', () => {
    const tracker = new SessionUsageTracker();
    tracker.recordUsage(1000, 500);
    const tooltip = tracker.formatTooltip();
    assert.ok(tooltip.includes('Prompt'));
    assert.ok(tooltip.includes('Completion'));
    assert.ok(tooltip.includes('Total'));
    assert.ok(tooltip.includes('$'));
  });

  test('SessionUsageTracker.reset clears totals', () => {
    const tracker = new SessionUsageTracker();
    tracker.recordUsage(500, 500);
    tracker.reset();
    const totals = tracker.getTotals();
    assert.strictEqual(totals.totalTokens, 0);
    assert.strictEqual(totals.estimatedCostUsd, 0);
  });

  test('SessionUsageTracker.formatStatusBar matches formatTokenStatusBar output', () => {
    const tracker = new SessionUsageTracker();
    tracker.recordUsage(10_000, 0);
    const totals = tracker.getTotals();
    assert.strictEqual(tracker.formatStatusBar(), formatTokenStatusBar(totals.totalTokens, totals.estimatedCostUsd));
  });
});
