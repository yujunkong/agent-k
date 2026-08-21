/**
 * Injected config storage for PROVIDER-003 / PROVIDER-004.
 * Avoids @agent-k/core ConfigManager (not transplanted yet).
 */

export interface ProviderConfigStore {
  get(key: string): unknown;
  update(values: Record<string, unknown>): void;
}

export class MemoryProviderConfigStore implements ProviderConfigStore {
  private readonly data = new Map<string, unknown>();

  get(key: string): unknown {
    return this.data.has(key) ? this.data.get(key) : undefined;
  }

  update(values: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(values)) {
      this.data.set(key, value);
    }
  }

  resetAll(): void {
    this.data.clear();
  }
}

let activeStore: ProviderConfigStore = new MemoryProviderConfigStore();

export function getProviderConfigStore(): ProviderConfigStore {
  return activeStore;
}

export function setProviderConfigStore(store: ProviderConfigStore): void {
  activeStore = store;
}

export function resetProviderConfigStore(): MemoryProviderConfigStore {
  const next = new MemoryProviderConfigStore();
  activeStore = next;
  return next;
}
