/**
 * SecretManager - API Key 저장/조회/삭제
 * 
 * vscode.SecretsStorage 래퍼. 키 네이밍: agent-k.{providerId}.{keyName}
 * 평문 settings.json 저장 금지 (설정 스키마에 secret: true)
 */

export interface SecretManagerOptions {
  store: {
    store: (key: string, value: string) => Thenable<void>;
    get: (key: string) => Thenable<string | undefined>;
    delete: (key: string) => Thenable<void>;
  };
}

export class SecretManager {
  private store: SecretManagerOptions['store'] | null = null;
  private cache: Map<string, string> = new Map();

  constructor(options?: SecretManagerOptions) {
    if (options) {
      this.store = options.store;
    }
  }

  setStore(store: SecretManagerOptions['store']) {
    this.store = store;
  }

  private getKey(providerId: string, keyName: string): string {
    return `agent-k.${providerId}.${keyName}`;
  }

  async storeSecret(providerId: string, keyName: string, value: string): Promise<void> {
    const key = this.getKey(providerId, keyName);
    this.cache.set(key, value);
    if (this.store) {
      await this.store.store(key, value);
    }
  }

  async getSecret(providerId: string, keyName: string): Promise<string | undefined> {
    const key = this.getKey(providerId, keyName);
    
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    if (this.store) {
      const value = await this.store.get(key);
      if (value) {
        this.cache.set(key, value);
        return value;
      }
    }

    return undefined;
  }

  async deleteSecret(providerId: string, keyName: string): Promise<void> {
    const key = this.getKey(providerId, keyName);
    this.cache.delete(key);
    if (this.store) {
      await this.store.delete(key);
    }
  }

  // Legacy fallback: read from settings (for migration)
  getLegacyKey(providerId: string): string | undefined {
    // Only used if SecretStorage is unavailable
    return undefined;
  }
}

export const secretManager = new SecretManager();
