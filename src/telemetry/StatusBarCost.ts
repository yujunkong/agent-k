/**
 * StatusBarCost — ADDON-T11: 세션 토큰·비용 Status Bar 표시
 *
 * 순수 헬퍼(formatTokenStatusBar/estimateCostUsd) + 세션 누적 트래커
 * (SessionUsageTracker). vscode 의존 없음 — extension.ts에서 StatusBarItem에 바인딩.
 */

export interface CostRates {
  promptPerM: number;
  completionPerM: number;
}

/** ~GPT-4o-mini class pricing as a reasonable local-model-era default. */
export const DEFAULT_COST_RATES: CostRates = {
  promptPerM: 0.15,
  completionPerM: 0.6,
};

/** Estimate USD cost for prompt/completion token counts (default ~$0.15/$0.60 per 1M tokens). */
export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  rates: CostRates = DEFAULT_COST_RATES
): number {
  const prompt = Math.max(0, promptTokens || 0);
  const completion = Math.max(0, completionTokens || 0);
  return (prompt / 1_000_000) * rates.promptPerM + (completion / 1_000_000) * rates.completionPerM;
}

function formatTokenCount(n: number): string {
  const value = Math.max(0, n || 0);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

/** Compact status bar text, e.g. "$(zap) 12.3k tok · $0.0042". Omits cost when not finite. */
export function formatTokenStatusBar(totalTokens: number, estimatedCostUsd?: number): string {
  const tokens = formatTokenCount(totalTokens);
  if (estimatedCostUsd == null || !Number.isFinite(estimatedCostUsd)) {
    return `$(zap) ${tokens} tok`;
  }
  return `$(zap) ${tokens} tok · $${estimatedCostUsd.toFixed(4)}`;
}

export interface SessionUsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

/** Accumulates prompt/completion tokens for the active chat session. */
export class SessionUsageTracker {
  private promptTokens = 0;
  private completionTokens = 0;
  private rates: CostRates;

  constructor(rates: CostRates = DEFAULT_COST_RATES) {
    this.rates = rates;
  }

  recordUsage(promptTokens: number, completionTokens: number): void {
    this.promptTokens += Math.max(0, promptTokens || 0);
    this.completionTokens += Math.max(0, completionTokens || 0);
  }

  getTotals(): SessionUsageTotals {
    const totalTokens = this.promptTokens + this.completionTokens;
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens,
      estimatedCostUsd: estimateCostUsd(this.promptTokens, this.completionTokens, this.rates),
    };
  }

  formatStatusBar(): string {
    const totals = this.getTotals();
    return formatTokenStatusBar(totals.totalTokens, totals.estimatedCostUsd);
  }

  formatTooltip(): string {
    const t = this.getTotals();
    return [
      'Agent K session usage',
      `Prompt: ${formatTokenCount(t.promptTokens)} tokens`,
      `Completion: ${formatTokenCount(t.completionTokens)} tokens`,
      `Total: ${formatTokenCount(t.totalTokens)} tokens`,
      `Estimated cost: $${t.estimatedCostUsd.toFixed(4)}`,
    ].join('\n');
  }

  reset(): void {
    this.promptTokens = 0;
    this.completionTokens = 0;
  }
}

/** Process-wide fallback singleton — used when no RuntimeServices instance is bound. */
export const sessionUsageTracker = new SessionUsageTracker();
