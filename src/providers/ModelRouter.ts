/**
 * ModelRouter - 모델 라우팅 및 폴백 (C4-T30)
 */
export interface ModelConfig {
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  maxTokens: number;
  capabilities: string[];
}

export class ModelRouter {
  private models: ModelConfig[] = [];
  private fallbackOrder: string[] = [];

  constructor() {
    this.registerDefaultModels();
  }

  private registerDefaultModels() {
    this.models.push({
      name: 'gpt-4o',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      maxTokens: 128000,
      capabilities: ['chat', 'tools', 'streaming']
    });
    this.fallbackOrder = ['gpt-4o', 'gpt-4o-mini'];
  }

  registerModel(config: ModelConfig): void {
    const idx = this.models.findIndex(m => m.name === config.name);
    if (idx >= 0) this.models[idx] = config;
    else this.models.push(config);
  }

  getModel(name: string): ModelConfig | undefined {
    return this.models.find(m => m.name === name);
  }

  getFallbackModel(failedModel: string): ModelConfig | undefined {
    const idx = this.fallbackOrder.indexOf(failedModel);
    if (idx < 0 || idx >= this.fallbackOrder.length - 1) return undefined;
    return this.getModel(this.fallbackOrder[idx + 1]);
  }

  setApiKey(modelName: string, key: string): void {
    const model = this.getModel(modelName);
    if (model) model.apiKey = key;
  }

  listModels(): ModelConfig[] {
    return [...this.models];
  }
}
