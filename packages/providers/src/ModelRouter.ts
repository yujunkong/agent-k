/**
 * MODEL-003 — Runtime tier router (task/complexity → A/B/C).
 * R-001: keep separate from Composer dropdown / ModelResolver.
 */

export type ModelTier = 'A' | 'B' | 'C';
export type TaskComplexity = 'simple' | 'moderate' | 'complex';

export interface RouterConfig {
  defaultTier: ModelTier;
  tierAModel: string;
  tierBModel: string;
  tierCModel: string;
  /** Retry N times on Tier A before upgrading to B */
  retryThreshold: number;
  /** Token budget before switching */
  budgetThreshold: number;
  /** Per-task-type overrides */
  overrides: Record<string, ModelTier>;
}

export interface RoutingDecision {
  tier: ModelTier;
  model: string;
  reason: string;
  cost: number;
}

const DEFAULT_CONFIG: RouterConfig = {
  defaultTier: 'A',
  tierAModel: 'flash-model',
  tierBModel: 'pro-model',
  tierCModel: 'enterprise-model',
  retryThreshold: 2,
  budgetThreshold: 32000,
  overrides: {
    plan: 'B',
    debug: 'B',
    review: 'B',
    search: 'A',
    ask: 'A',
  },
};

export class ModelRouter {
  private config: RouterConfig;

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Route to appropriate tier based on task context. */
  route(params: {
    taskType?: string;
    complexity?: TaskComplexity;
    retryCount?: number;
    tokenBudget?: number;
    forceTier?: ModelTier;
  }): RoutingDecision {
    if (params.forceTier) {
      return this.decide(params.forceTier, `Forced to tier ${params.forceTier}`);
    }

    if (params.taskType && this.config.overrides[params.taskType]) {
      const overrideTier = this.config.overrides[params.taskType];
      return this.decide(overrideTier, `Task "${params.taskType}" requires tier ${overrideTier}`);
    }

    if (params.retryCount && params.retryCount >= this.config.retryThreshold) {
      return this.decide(
        'B',
        `Retry count ${params.retryCount} ≥ threshold ${this.config.retryThreshold}, escalating to B`,
      );
    }

    if (params.complexity === 'complex') {
      return this.decide('B', 'Complex task routed to tier B');
    }

    if (params.tokenBudget && params.tokenBudget > this.config.budgetThreshold) {
      return this.decide(
        'B',
        `Token budget ${params.tokenBudget} > ${this.config.budgetThreshold}, upgrading to B`,
      );
    }

    return this.decide(
      this.config.defaultTier,
      `Default routing to tier ${this.config.defaultTier}`,
    );
  }

  getModel(tier: ModelTier): string {
    const map: Record<ModelTier, string> = {
      A: this.config.tierAModel,
      B: this.config.tierBModel,
      C: this.config.tierCModel,
    };
    return map[tier];
  }

  updateConfig(updates: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): RouterConfig {
    return { ...this.config };
  }

  estimateCost(tier: ModelTier, inputTokens: number, outputTokens: number): number {
    const rates: Record<ModelTier, { input: number; output: number }> = {
      A: { input: 0.0001, output: 0.0002 },
      B: { input: 0.0005, output: 0.0015 },
      C: { input: 0.002, output: 0.006 },
    };
    const rate = rates[tier];
    return inputTokens * rate.input + outputTokens * rate.output;
  }

  private decide(tier: ModelTier, reason: string): RoutingDecision {
    return {
      tier,
      model: this.getModel(tier),
      reason,
      cost: tier === 'A' ? 0.001 : tier === 'B' ? 0.01 : 0.05,
    };
  }
}
