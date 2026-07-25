/**
 * ProviderRegistry - 프로바이더 등록/조회/삭제/활성화 관리
 * 
 * 설정 저장: workspaceState/globalState
 * 활성 프로바이더 1개 + 모델 선택 상태 관리
 */
import type { LLMProviderConfig, LLMProviderInterface, ProviderType, ProviderEvent, ProviderEventListener } from './types';
import { LiteLLMProvider } from './LiteLLMProvider';

const PROVIDER_TYPES: ProviderType[] = ['litellm', 'openai', 'anthropic', 'ollama', 'lmstudio'];

export class ProviderRegistry {
  private providers: Map<string, LLMProviderInterface> = new Map();
  private activeProviderId: string | null = null;
  private listeners: Set<ProviderEventListener> = new Set();
  private storage: { get: (key: string) => any; set: (key: string, value: any) => void } | null = null;

  constructor() {
    this.loadFromStorage();
  }

  setStorage(storage: { get: (key: string) => any; set: (key: string, value: any) => void }) {
    this.storage = storage;
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (!this.storage) return;
    try {
      const saved = this.storage.get('agent-k.providers');
      if (saved) {
        const configs: LLMProviderConfig[] = JSON.parse(saved);
        configs.forEach(config => {
          this.register(config, false);
        });
      }
      this.activeProviderId = this.storage.get('agent-k.activeProvider') || null;
    } catch {
      // Ignore storage errors
    }
  }

  private saveToStorage() {
    if (!this.storage) return;
    try {
      const configs: LLMProviderConfig[] = [];
      this.providers.forEach(p => configs.push(p.config));
      this.storage.set('agent-k.providers', JSON.stringify(configs));
      this.storage.set('agent-k.activeProvider', this.activeProviderId || '');
    } catch {
      // Ignore storage errors
    }
  }

  getProviderTypes(): ProviderType[] {
    return [...PROVIDER_TYPES];
  }

  register(config: LLMProviderConfig, persist = true): LLMProviderInterface {
    let provider: LLMProviderInterface;

    switch (config.type) {
      case 'litellm':
      case 'openai':
      case 'ollama':
      case 'lmstudio':
        provider = new LiteLLMProvider(config);
        break;
      case 'anthropic':
        // Anthropic uses a different API, but for now use LiteLLM as proxy
        provider = new LiteLLMProvider(config);
        break;
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }

    this.providers.set(config.id, provider);
    
    if (persist) {
      this.saveToStorage();
      this.emitEvent({ type: 'registered', providerId: config.id, timestamp: Date.now() });
    }

    // If this is the first provider, make it active
    if (!this.activeProviderId) {
      this.activeProviderId = config.id;
    }

    return provider;
  }

  remove(providerId: string): boolean {
    const removed = this.providers.delete(providerId);
    if (removed) {
      if (this.activeProviderId === providerId) {
        this.activeProviderId = this.providers.keys().next().value || null;
      }
      this.saveToStorage();
      this.emitEvent({ type: 'removed', providerId, timestamp: Date.now() });
    }
    return removed;
  }

  get(providerId: string): LLMProviderInterface | undefined {
    return this.providers.get(providerId);
  }

  getActive(): LLMProviderInterface | undefined {
    if (!this.activeProviderId) return this.providers.values().next().value;
    return this.providers.get(this.activeProviderId);
  }

  setActive(providerId: string): boolean {
    if (!this.providers.has(providerId)) return false;
    this.activeProviderId = providerId;
    this.saveToStorage();
    this.emitEvent({ type: 'activated', providerId, timestamp: Date.now() });
    return true;
  }

  list(): LLMProviderInterface[] {
    return Array.from(this.providers.values());
  }

  update(config: Partial<LLMProviderConfig> & { id: string }): LLMProviderInterface | undefined {
    const existing = this.providers.get(config.id);
    if (!existing) return undefined;

    const newConfig = { ...existing.config, ...config };
    this.remove(config.id);
    return this.register(newConfig);
  }

  addEventListener(listener: ProviderEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitEvent(event: ProviderEvent) {
    this.listeners.forEach(l => l(event));
  }

  getActiveProviderId(): string | null {
    return this.activeProviderId;
  }
}

// Singleton (application-wide)
export const providerRegistry = new ProviderRegistry();
