/**
 * PROVIDER-002 — Provider registry (register / activate / list).
 * All wire types (incl. custom OpenAI Compatible) use LiteLLMProvider.
 */
import { LiteLLMProvider } from './LiteLLMProvider';
import type {
  LLMProviderConfig,
  LLMProviderInterface,
  ProviderEvent,
  ProviderEventListener,
  ProviderType,
} from './types';

const PROVIDER_TYPES: ProviderType[] = [
  'litellm',
  'openai',
  'anthropic',
  'ollama',
  'lmstudio',
];

type SimpleStorage = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
};

export class ProviderRegistry {
  private readonly providers = new Map<string, LLMProviderInterface>();
  private activeProviderId: string | null = null;
  private readonly listeners = new Set<ProviderEventListener>();
  private storage: SimpleStorage | null = null;

  constructor() {
    this.loadFromStorage();
  }

  setStorage(storage: SimpleStorage): void {
    this.storage = storage;
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (!this.storage) return;
    try {
      const saved = this.storage.get('agent-k.providers');
      if (typeof saved === 'string' && saved) {
        const configs = JSON.parse(saved) as LLMProviderConfig[];
        for (const config of configs) {
          this.register(config, false);
        }
      }
      const active = this.storage.get('agent-k.activeProvider');
      this.activeProviderId = typeof active === 'string' && active ? active : null;
    } catch {
      // Ignore corrupt storage
    }
  }

  private saveToStorage(): void {
    if (!this.storage) return;
    try {
      const configs: LLMProviderConfig[] = [];
      for (const p of this.providers.values()) configs.push(p.config);
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
    // PROVIDER-010…014 share one OpenAI-compatible client.
    const provider: LLMProviderInterface = new LiteLLMProvider(config);
    this.providers.set(config.id, provider);

    if (persist) {
      this.saveToStorage();
      this.emitEvent({ type: 'registered', providerId: config.id, timestamp: Date.now() });
    }

    if (!this.activeProviderId) {
      this.activeProviderId = config.id;
    }

    return provider;
  }

  remove(providerId: string): boolean {
    const removed = this.providers.delete(providerId);
    if (removed) {
      if (this.activeProviderId === providerId) {
        this.activeProviderId = this.providers.keys().next().value ?? null;
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
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitEvent(event: ProviderEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  getActiveProviderId(): string | null {
    return this.activeProviderId;
  }

  /** Test helper — clear in-memory registry without touching storage. */
  clear(): void {
    this.providers.clear();
    this.activeProviderId = null;
  }
}

export const providerRegistry = new ProviderRegistry();
