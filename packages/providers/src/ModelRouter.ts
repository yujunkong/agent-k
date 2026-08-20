/**
 * ModelRouter — Cost/Balance/Intelligence + A/B 티어 라우팅 (C7-T33)
 *
 * 모델 선택: Tier A (Flash) / Tier B (Pro) + 오버라이드 가능
 * 라우팅 기준: 작업 복잡도, 재시도 횟수, 사용자 설정
 */
export type ModelTier = 'A' | 'B' | 'C';
export type TaskComplexity = 'simple' | 'moderate' | 'complex';

export interface RouterConfig {
  defaultTier: ModelTier;
  tierAModel: string;
  tierBModel: string;
  tierCModel: string;
  retryThreshold: number; // Retry N times on Tier A before upgrading to B
  budgetThreshold: number; // Token budget before switching
  overrides: Record<string, ModelTier>; // Per-task-type overrides
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
    'plan': 'B',
    'debug': 'B',
    'review': 'B',
    'search': 'A',
    'ask': 'A'
  }
};

export class ModelRouter {
  private config: RouterConfig;

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Route to appropriate tier based on task
   */
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

    // Check per-task overrides
    if (params.taskType && this.config.overrides[params.taskType]) {
      const overrideTier = this.config.overrides[params.taskType];
      return this.decide(overrideTier, `Task "${params.taskType}" requires tier ${overrideTier}`);
    }

    // Escalate on retry
    if (params.retryCount && params.retryCount >= this.config.retryThreshold) {
      return this.decide('B', `Retry count ${params.retryCount} ≥ threshold ${this.config.retryThreshold}, escalating to B`);
    }

    // Complex tasks go to B
    if (params.complexity === 'complex') {
      return this.decide('B', 'Complex task routed to tier B');
    }

    // Budget over threshold → upgrade
    if (params.tokenBudget && params.tokenBudget > this.config.budgetThreshold) {
      return this.decide('B', `Token budget ${params.tokenBudget} > ${this.config.budgetThreshold}, upgrading to B`);
    }

    // Default
    return this.decide(
      this.config.defaultTier,
      `Default routing to tier ${this.config.defaultTier}`
    );
  }

  /**
   * Get model name for a tier
   */
  getModel(tier: ModelTier): string {
    const map: Record<ModelTier, string> = {
      'A': this.config.tierAModel,
      'B': this.config.tierBModel,
      'C': this.config.tierCModel
    };
    return map[tier];
  }

  /**
   * Update config
   */
  updateConfig(updates: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current config
   */
  getConfig(): RouterConfig {
    return { ...this.config };
  }

  /**
   * Get cost estimate for model
   */
  estimateCost(tier: ModelTier, inputTokens: number, outputTokens: number): number {
    const rates: Record<ModelTier, { input: number; output: number }> = {
      'A': { input: 0.0001, output: 0.0002 },   // $0.10/M input, $0.20/M output
      'B': { input: 0.0005, output: 0.0015 },    // $0.50/M input, $1.50/M output
      'C': { input: 0.002, output: 0.006 }       // $2.00/M input, $6.00/M output
    };

    const rate = rates[tier];
    return (inputTokens * rate.input + outputTokens * rate.output);
  }

  private decide(tier: ModelTier, reason: string): RoutingDecision {
    return {
      tier,
      model: this.getModel(tier),
      reason,
      cost: tier === 'A' ? 0.001 : tier === 'B' ? 0.01 : 0.05
    };
  }
}
