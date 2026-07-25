/**
 * ConfigManager - VS Code 설정 관리
 * 
 * ConfigManager: get/update/onChange.
 * package.json contributes.configuration에 등록된 설정값과 연동
 */

export type ConfigListener = (key: string, value: any) => void;

export class ConfigManager {
  private config: Record<string, any> = {};
  private listeners: Map<string, Set<ConfigListener>> = new Map();
  private storage: { get: (key: string) => any; set: (key: string, value: any) => void } | null = null;

  constructor() {
    this.loadDefaults();
  }

  setStorage(storage: { get: (key: string) => any; set: (key: string, value: any) => void }) {
    this.storage = storage;
    this.loadAll();
  }

  private loadDefaults() {
    this.config = {
      'agent-k.provider.type': 'litellm',
      'agent-k.provider.baseUrl': 'http://localhost:4000',
      'agent-k.provider.model': 'gemma-2-27b',
      'agent-k.provider.apiKey': '',
      'agent-k.mode.default': 'agent',
      'agent-k.maxTurns': 20,
      'agent-k.permission.level': 'ask',
      'agent-k.context.budget': 100000,
      'agent-k.telemetry.enabled': true,
      'agent-k.budget.dailyTokens': 10000000,
      'agent-k.budget.monthlyTokens': 100000000,
      'agent-k.queue.onEnterWhileRunning': 'resynthesize',
      'agent-k.queue.debounceMs': 500,
      'agent-k.harness.enabled': true,
      'agent-k.harness.verificationFirst': true,
      'agent-k.harness.prefetchEnabled': true,
      'agent-k.harness.verificationMicroLoop': true,
      'agent-k.context.readMaxLines': 5000,
      'agent-k.context.maxTurnsA': 25,
      'agent-k.context.maxTurnsB': 15
    };
  }

  private loadAll() {
    if (!this.storage) return;
    
    // Try to import from vscode module (will be available in extension context)
    try {
      // This will be injected by the extension host
      const stored = this.storage.get('agent-k.config');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = { ...this.config, ...parsed };
      }
    } catch {
      // Use defaults
    }
  }

  private saveAll() {
    if (!this.storage) return;
    try {
      this.storage.set('agent-k.config', JSON.stringify(this.config));
    } catch {
      // Ignore storage errors
    }
  }

  get(key: string): any {
    return this.config[key];
  }

  set(key: string, value: any): void {
    const oldValue = this.config[key];
    if (oldValue === value) return;
    
    this.config[key] = value;
    this.saveAll();
    this.notifyListeners(key, value);
  }

  update(values: Record<string, any>): void {
    for (const [key, value] of Object.entries(values)) {
      this.config[key] = value;
    }
    this.saveAll();
    for (const key of Object.keys(values)) {
      this.notifyListeners(key, this.config[key]);
    }
  }

  getAll(): Record<string, any> {
    return { ...this.config };
  }

  reset(key: string): void {
    this.loadDefaults();
    this.saveAll();
  }

  resetAll(): void {
    this.loadDefaults();
    this.saveAll();
  }

  on(key: string, listener: ConfigListener): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
    return () => this.listeners.get(key)?.delete(listener);
  }

  private notifyListeners(key: string, value: any) {
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.forEach(l => l(key, value));
    }
  }

  // Settings schema validation
  validate(key: string, value: any): string | null {
    switch (key) {
      case 'agent-k.provider.baseUrl':
        if (typeof value !== 'string') return 'Base URL must be a string';
        if (!value.startsWith('http://') && !value.startsWith('https://')) return 'Base URL must start with http:// or https://';
        return null;
      case 'agent-k.maxTurns':
        if (typeof value !== 'number' || value < 5 || value > 100) return 'Max turns must be between 5 and 100';
        return null;
      case 'agent-k.context.budget':
        if (typeof value !== 'number' || value < 1000) return 'Context budget must be at least 1000';
        return null;
      case 'agent-k.provider.type':
        if (!['litellm', 'openai', 'anthropic', 'ollama', 'lmstudio'].includes(value)) return 'Invalid provider type';
        return null;
      case 'agent-k.permission.level':
        if (!['ask', 'accept_edits', 'auto', 'bypass'].includes(value)) return 'Invalid permission level';
        return null;
      default:
        return null;
    }
  }
}

export const configManager = new ConfigManager();
