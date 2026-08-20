/**
 * ConfigManager - VS Code 설정 관리
 *
 * ConfigManager: get/update/onChange.
 * package.json contributes.configuration에 등록된 설정값과 연동
 */

export type ConfigListener = (key: string, value: any) => void;

/** VS Code `contributes.configuration` keys bridged in extension host (RW-P0-03) */
export const AGENT_K_VSCODE_CONFIG_KEYS = [
  'agent-k.provider.type',
  'agent-k.provider.baseUrl',
  'agent-k.provider.model',
  'agent-k.provider.models',
  'agent-k.provider.availableModels',
  'agent-k.provider.apiKey',
  'agent-k.provider.apiKeys',
  'agent-k.provider.profiles',
  'agent-k.provider.activeProfileId',
  'agent-k.provider.connections',
  'agent-k.provider.preferUserOrder',
  'agent-k.github.token',
  'agent-k.mode.default',
  'agent-k.permission.level',
  'agent-k.queue.onEnterWhileRunning',
  'agent-k.queue.onStop',
  'agent-k.queue.resynthesizeDebounceMs',
  'agent-k.queue.debounceMs',
  'agent-k.mcp.servers',
  'agent-k.thinking.effort',
  'agent-k.maxTurns',
  'agent-k.context.budget',
  'agent-k.verification.testEnabled',
  'agent-k.turnTimeoutMs',
  'agent-k.plan.forceOnComplex',
  'agent-k.debugClassifiers',
  'agent-k.telemetry.enabled',
  'agent-k.telemetry.statusBarEnabled',
  'agent-k.mcp.maxSchemaTokens',
  'agent-k.search.localEmbedding',
  'agent-k.permission.denyGlobs',
  'agent-k.context.maxTurnsA',
  'agent-k.context.maxTurnsB',
  'agent-k.harness.enabled',
  'agent-k.harness.verificationFirst',
  'agent-k.harness.prefetchEnabled',
  'agent-k.harness.verificationMicroLoop',
  'agent-k.context.readMaxLines',
  'agent-k.queue.debounceMs',
  'agent-k.terminal.timeoutMs',
  'agent-k.terminal.denyPatterns',
  'agent-k.review.applyPolicy',
  'agent-k.review.autoCheckpoint',
  'agent-k.features.browser',
  'agent-k.features.design-mode',
  'agent-k.features.worktree',
  'agent-k.features.agent-review',
  'agent-k.features.mcp',
  'agent-k.features.skills',
  'agent-k.features.sub-agents',
  'agent-k.features.memories',
  'agent-k.features.inline-completion',
  'agent-k.features.codebase-index',
] as const;

export const AGENT_K_FEATURES_CONFIG_KEYS = [
  'agent-k.features.browser',
  'agent-k.features.design-mode',
  'agent-k.features.worktree',
  'agent-k.features.agent-review',
  'agent-k.features.mcp',
  'agent-k.features.skills',
  'agent-k.features.sub-agents',
  'agent-k.features.memories',
  'agent-k.features.inline-completion',
  'agent-k.features.github',
  'agent-k.features.codebase-index'
] as const;

export type VSCodeConfigUpdater = (key: string, value: unknown) => void | Promise<void>;

export class ConfigManager {
  private config: Record<string, any> = {};
  private listeners: Map<string, Set<ConfigListener>> = new Map();
  private storage: { get: (key: string) => any; set: (key: string, value: any) => void } | null = null;
  private syncingFromVscode = false;
  private vscodeUpdater: VSCodeConfigUpdater | null = null;

  constructor() {
    this.loadDefaults();
  }

  setStorage(storage: { get: (key: string) => any; set: (key: string, value: any) => void }) {
    this.storage = storage;
    this.loadAll();
  }

  bindVSCodeUpdater(updater: VSCodeConfigUpdater): void {
    this.vscodeUpdater = updater;
  }

  syncFromVSCode(values: Record<string, unknown>): void {
    this.syncingFromVscode = true;
    try {
      const changed: Array<[string, unknown]> = [];
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) continue;
        if (
          (key === 'agent-k.provider.availableModels' || key === 'agent-k.provider.models') &&
          Array.isArray(value) && value.length === 0 &&
          Array.isArray(this.config[key]) && this.config[key].length > 0
        ) continue;
        if (
          key === 'agent-k.provider.model' &&
          (value === '' || value == null) && this.config[key]
        ) continue;
        if (this.config[key] !== value) {
          this.config[key] = value;
          changed.push([key, value]);
        }
      }
      if (changed.length > 0) {
        this.saveAll();
        for (const [key, value] of changed) this.notifyListeners(key, value);
      }
    } finally {
      this.syncingFromVscode = false;
    }
  }

  private pushToVSCodeIfBound(key: string, value: unknown): void {
    if (this.syncingFromVscode || !this.vscodeUpdater) return;
    if (!(AGENT_K_VSCODE_CONFIG_KEYS as readonly string[]).includes(key)) return;
    void Promise.resolve(this.vscodeUpdater(key, value)).catch(() => {});
  }

  private loadDefaults() {
    this.config = {
      'agent-k.provider.type': 'litellm',
      'agent-k.provider.baseUrl': 'http://127.0.0.1:52415',
      'agent-k.provider.model': 'mlx-community/Qwen3.6-35B-A3B-4bit',
      'agent-k.provider.models': [],
      'agent-k.provider.availableModels': [],
      'agent-k.provider.apiKey': '',
      'agent-k.provider.apiKeys': {},
      'agent-k.provider.profiles': [],
      'agent-k.provider.activeProfileId': '',
      'agent-k.provider.connections': [],
      'agent-k.provider.preferUserOrder': false,
      'agent-k.github.token': '',
      'agent-k.mode.default': 'agent',
      'agent-k.maxTurns': 25,
      'agent-k.debugClassifiers': false,
      'agent-k.permission.level': 'accept_edits',
      'agent-k.permission.denyGlobs': [
        '**/.env*', '**/secrets/**', '**/id_rsa*', '**/*.pem', '**/.git/**', '**/node_modules/**'
      ],
      'agent-k.queue.onEnterWhileRunning': 'resynthesize',
      'agent-k.queue.onStop': 'keep',
      'agent-k.queue.resynthesizeDebounceMs': 300,
      'agent-k.queue.debounceMs': 300,
      'agent-k.thinking.effort': 'medium',
      'agent-k.context.budget': 100000,
      'agent-k.telemetry.enabled': true,
      'agent-k.telemetry.statusBarEnabled': true,
      'agent-k.mcp.maxSchemaTokens': 8000,
      'agent-k.search.localEmbedding': false,
      'agent-k.budget.dailyTokens': 10000000,
      'agent-k.budget.monthlyTokens': 100000000,
      'agent-k.harness.enabled': true,
      'agent-k.harness.verificationFirst': true,
      'agent-k.harness.prefetchEnabled': true,
      'agent-k.harness.verificationMicroLoop': true,
      'agent-k.context.readMaxLines': 5000,
      'agent-k.context.maxTurnsA': 25,
      'agent-k.context.maxTurnsB': 15,
      'agent-k.features.browser': true,
      'agent-k.features.design-mode': true,
      'agent-k.features.worktree': true,
      'agent-k.features.agent-review': true,
      'agent-k.features.mcp': true,
      'agent-k.features.skills': true,
      'agent-k.features.sub-agents': true,
      'agent-k.features.memories': true,
      'agent-k.features.inline-completion': false,
      'agent-k.features.github': true,
      'agent-k.features.codebase-index': true,
      'agent-k.mcp.servers': {
        searxng: {
          type: 'local',
          command: ['python3', '/Users/kong-yujun/mcp-servers/searxng_mcp_server.py'],
          enabled: true,
        },
        'sequential-thinking': {
          type: 'local',
          command: ['npx', '-y', '@modelcontextprotocol/server-sequential-thinking'],
          enabled: true,
        },
      },
    };
  }

  private loadAll() {
    if (!this.storage) return;
    try {
      const stored = this.storage.get('agent-k.config');
      if (stored) this.config = { ...this.config, ...JSON.parse(stored) };
    } catch {}
  }

  private saveAll() {
    if (!this.storage) return;
    try { this.storage.set('agent-k.config', JSON.stringify(this.config)); } catch {}
  }

  get(key: string): any { return this.config[key]; }

  set(key: string, value: any): void {
    if (this.config[key] === value) return;
    this.config[key] = value;
    this.saveAll();
    this.notifyListeners(key, value);
    this.pushToVSCodeIfBound(key, value);
  }

  update(values: Record<string, any>): void {
    for (const [key, value] of Object.entries(values)) this.config[key] = value;
    this.saveAll();
    for (const key of Object.keys(values)) {
      this.notifyListeners(key, this.config[key]);
      this.pushToVSCodeIfBound(key, this.config[key]);
    }
  }

  getAll(): Record<string, any> { return { ...this.config }; }

  reset(key: string): void { void key; this.loadDefaults(); this.saveAll(); }
  resetAll(): void { this.loadDefaults(); this.saveAll(); }

  on(key: string, listener: ConfigListener): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(listener);
    return () => this.listeners.get(key)?.delete(listener);
  }

  private notifyListeners(key: string, value: any) {
    this.listeners.get(key)?.forEach((l) => l(key, value));
  }

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
        if (!['litellm', 'openai', 'anthropic', 'ollama', 'lmstudio', 'opencode-zen', 'opencode-go'].includes(value)) return 'Invalid provider type';
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
