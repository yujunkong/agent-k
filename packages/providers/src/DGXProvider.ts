/**
 * DGXProvider — DGX/vLLM/TRT-LLM 원클릭 프로바이더 (C7-T32)
 *
 * 엔드포인트 + 모델 카탈로그만 등록하면 사용 가능
 */
import { z } from 'zod';

export interface DGXConfig {
  endpoint: string;
  apiKey?: string;
  modelCatalog: DGXModel[];
  type: 'vllm' | 'trtllm' | 'tgi' | 'openai-compatible';
}

export interface DGXModel {
  id: string;
  name: string;
  contextLength: number;
  tier: 'A' | 'B' | 'C';
}

export const dgxConfigSchema = z.object({
  endpoint: z.string().url(),
  apiKey: z.string().optional(),
  type: z.enum(['vllm', 'trtllm', 'tgi', 'openai-compatible']).default('openai-compatible')
});

export class DGXProvider {
  private configs: Map<string, DGXConfig> = new Map();

  /**
   * Register a DGX provider
   */
  register(name: string, config: z.infer<typeof dgxConfigSchema>): void {
    this.configs.set(name, {
      ...config,
      modelCatalog: []
    });
  }

  /**
   * Auto-discover model catalog from endpoint
   */
  async discoverModels(name: string): Promise<DGXModel[]> {
    const config = this.configs.get(name);
    if (!config) throw new Error(`DGX provider not found: ${name}`);

    // In production, call /v1/models on the endpoint
    const models: DGXModel[] = [
      { id: 'llama-3-70b', name: 'Llama 3 70B', contextLength: 8192, tier: 'B' },
      { id: 'llama-3-8b', name: 'Llama 3 8B', contextLength: 8192, tier: 'A' },
      { id: 'mistral-7b', name: 'Mistral 7B', contextLength: 8192, tier: 'A' },
      { id: 'mixtral-8x7b', name: 'Mixtral 8x7B', contextLength: 32768, tier: 'B' },
      { id: 'codellama-34b', name: 'CodeLlama 34B', contextLength: 16384, tier: 'B' },
      { id: 'deepseek-coder-33b', name: 'DeepSeek Coder 33B', contextLength: 16384, tier: 'B' }
    ];

    config.modelCatalog = models;
    return models;
  }

  /**
   * Get provider config
   */
  getConfig(name: string): DGXConfig | undefined {
    return this.configs.get(name);
  }

  /**
   * List all registered providers
   */
  listProviders(): Array<{ name: string; endpoint: string; type: string }> {
    return Array.from(this.configs.entries()).map(([name, config]) => ({
      name,
      endpoint: config.endpoint,
      type: config.type
    }));
  }

  /**
   * Remove a provider
   */
  remove(name: string): void {
    this.configs.delete(name);
  }

  /**
   * Test connection to endpoint
   */
  async testConnection(name: string): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
    const config = this.configs.get(name);
    if (!config) return { connected: false, latencyMs: 0, error: 'Provider not found' };

    const start = Date.now();
    try {
      // In production, make a lightweight API call
      await fetch(`${config.endpoint}/v1/models`, {
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}
      });
      return { connected: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { connected: false, latencyMs: Date.now() - start, error: String(err) };
    }
  }
}
