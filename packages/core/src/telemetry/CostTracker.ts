/**
 * CostTracker / BudgetGuard — TEL-001: 일/월 토큰 예산
 * (v2.1 C4-T26 동작 동등 이식)
 *
 * v2.1은 localStorage 직접 사용 → core 경계(node, vscode 금지)에서는
 * BudgetStorage port + 메모리 폴백. host가 vscode globalState 등으로 주입.
 */
export interface BudgetConfig {
  dailyTokenBudget: number;
  monthlyTokenBudget: number;
  warningThreshold: number; // 0-1, e.g. 0.8 = warn at 80%
}

export interface BudgetStatus {
  dailyUsed: number;
  dailyBudget: number;
  monthlyUsed: number;
  monthlyBudget: number;
  dailyPercent: number;
  monthlyPercent: number;
  exceeded: boolean;
  warning: boolean;
}

/** Key-value storage port — host injects vscode globalState / webview localStorage adapter. */
export interface BudgetStorage {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): void;
}

const DAILY_BUDGET = 1000000; // 1M tokens/day
const MONTHLY_BUDGET = 20000000; // 20M tokens/month
const WARNING_THRESHOLD = 0.8;
const STORAGE_KEY_DAILY = 'agent-k.budget.daily';
const STORAGE_KEY_MONTHLY = 'agent-k.budget.monthly';

/** In-memory fallback when no storage port is bound. */
class MemoryBudgetStorage implements BudgetStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

export class CostTracker {
  private dailyUsed = 0;
  private monthlyUsed = 0;
  private config: BudgetConfig;
  private storage: BudgetStorage;

  constructor(config?: Partial<BudgetConfig>, storage?: BudgetStorage) {
    this.config = {
      dailyTokenBudget: DAILY_BUDGET,
      monthlyTokenBudget: MONTHLY_BUDGET,
      warningThreshold: WARNING_THRESHOLD,
      ...config
    };
    this.storage = storage ?? new MemoryBudgetStorage();
    this.loadFromStorage();
  }

  recordTokenUsage(tokens: number): void {
    this.dailyUsed += tokens;
    this.monthlyUsed += tokens;
    this.saveToStorage();
  }

  getStatus(): BudgetStatus {
    const dailyPercent = this.dailyUsed / this.config.dailyTokenBudget;
    const monthlyPercent = this.monthlyUsed / this.config.monthlyTokenBudget;

    return {
      dailyUsed: this.dailyUsed,
      dailyBudget: this.config.dailyTokenBudget,
      monthlyUsed: this.monthlyUsed,
      monthlyBudget: this.config.monthlyTokenBudget,
      dailyPercent,
      monthlyPercent,
      exceeded: dailyPercent >= 1 || monthlyPercent >= 1,
      warning: dailyPercent >= this.config.warningThreshold || monthlyPercent >= this.config.warningThreshold
    };
  }

  isOverBudget(): boolean {
    return this.getStatus().exceeded;
  }

  getWarningMessage(): string | null {
    const status = this.getStatus();
    if (status.exceeded) {
      return `⚠️ Token budget exceeded! Daily: ${(status.dailyPercent * 100).toFixed(0)}%, Monthly: ${(status.monthlyPercent * 100).toFixed(0)}%`;
    }
    if (status.warning) {
      return `⚠️ Token budget nearly exhausted. Daily: ${(status.dailyPercent * 100).toFixed(0)}%, Monthly: ${(status.monthlyPercent * 100).toFixed(0)}%`;
    }
    return null;
  }

  resetDaily(): void {
    this.dailyUsed = 0;
    this.saveToStorage();
  }

  resetMonthly(): void {
    this.monthlyUsed = 0;
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const daily = this.storage.getItem(STORAGE_KEY_DAILY);
      const monthly = this.storage.getItem(STORAGE_KEY_MONTHLY);
      if (daily) {
        const { value, date } = JSON.parse(daily);
        this.dailyUsed = date === new Date().toDateString() ? value : 0;
      }
      if (monthly) {
        const { value, month } = JSON.parse(monthly);
        this.monthlyUsed = month === new Date().getMonth() ? value : 0;
      }
    } catch {
      this.dailyUsed = 0;
      this.monthlyUsed = 0;
    }
  }

  private saveToStorage(): void {
    try {
      this.storage.setItem(STORAGE_KEY_DAILY, JSON.stringify({
        value: this.dailyUsed,
        date: new Date().toDateString()
      }));
      this.storage.setItem(STORAGE_KEY_MONTHLY, JSON.stringify({
        value: this.monthlyUsed,
        month: new Date().getMonth()
      }));
    } catch { /* storage not available */ }
  }
}
