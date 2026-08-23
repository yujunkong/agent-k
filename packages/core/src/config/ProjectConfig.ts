/**
 * CFG-002 — Project-level Agent-K config (`.agentk/settings.json`).
 *
 * Priority (host applies): project file > VS Code User/Workspace > ConfigManager defaults.
 * Secrets may appear in the file but should prefer SecretStorage — never commit real keys.
 */

/** Canonical workspace directory for settings + agent data */
export const AGENTK_DIR = '.agentk';

/** Canonical relative path from workspace root (always `/`, Uri-safe on Win/macOS) */
export const PROJECT_CONFIG_PATH = '.agentk/settings.json';

/**
 * Legacy paths still read (never written as the preferred location).
 * Prefer migrating contents into `.agentk/settings.json`.
 */
export const PROJECT_CONFIG_LEGACY_FILENAMES = [
  '.agent-k/settings.json',
  '.agent-k.json',
  'agent-k.json',
] as const;

/** @deprecated use PROJECT_CONFIG_PATH — kept for find/read order */
export const PROJECT_CONFIG_FILENAMES = [
  PROJECT_CONFIG_PATH,
  ...PROJECT_CONFIG_LEGACY_FILENAMES,
] as const;

/**
 * Keys allowed from project JSON (flat `agent-k.*`).
 * Nested JSON under `.agentk/settings.json` is flattened via `flattenProjectConfig`.
 */
export const PROJECT_CONFIG_KEYS = [
  // Provider / Models
  'agent-k.provider.type',
  'agent-k.provider.baseUrl',
  'agent-k.provider.model',
  'agent-k.provider.models',
  'agent-k.provider.availableModels',
  'agent-k.provider.apiKey',
  'agent-k.provider.apiKeys',
  'agent-k.github.token',
  // Mode / Turns
  'agent-k.thinking.effort',
  'agent-k.mode.default',
  'agent-k.maxTurns',
  'agent-k.debugClassifiers',
  'agent-k.turnTimeoutMs',
  'agent-k.plan.forceOnComplex',
  // Permission (CFG-003)
  'agent-k.permission.level',
  'agent-k.permission.denyGlobs',
  'agent-k.permission.requireApprovalTools',
  // Queue
  'agent-k.queue.onEnterWhileRunning',
  'agent-k.queue.onStop',
  'agent-k.queue.resynthesizeDebounceMs',
  'agent-k.queue.debounceMs',
  // Context
  'agent-k.context.budget',
  'agent-k.context.readMaxLines',
  'agent-k.context.maxTurnsA',
  'agent-k.context.maxTurnsB',
  // Privacy / Telemetry
  'agent-k.telemetry.enabled',
  'agent-k.telemetry.statusBarEnabled',
  // MCP
  'agent-k.mcp.servers',
  'agent-k.mcp.maxSchemaTokens',
  // Search / Verification / Budget
  'agent-k.search.localEmbedding',
  'agent-k.verification.testEnabled',
  'agent-k.budget.dailyTokens',
  'agent-k.budget.monthlyTokens',
  // Harness
  'agent-k.harness.enabled',
  'agent-k.harness.verificationFirst',
  'agent-k.harness.prefetchEnabled',
  'agent-k.harness.verificationMicroLoop',
  // Features
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
  'agent-k.features.codebase-index',
] as const;

const ALLOWED = new Set<string>(PROJECT_CONFIG_KEYS);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Walk nested object → flat agent-k.* map (only allowlisted keys). */
export function flattenProjectConfig(
  input: unknown,
  prefix = 'agent-k',
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isPlainObject(input)) return out;

  for (const [key, value] of Object.entries(input)) {
    if (key === '$schema' || key.startsWith('_')) continue;

    // Already-flat key
    if (key.startsWith('agent-k.')) {
      if (ALLOWED.has(key) && value !== undefined) out[key] = value;
      continue;
    }

    const pathKey = `${prefix}.${key}`;
    if (isPlainObject(value) && !ALLOWED.has(pathKey)) {
      Object.assign(out, flattenProjectConfig(value, pathKey));
      continue;
    }
    if (ALLOWED.has(pathKey) && value !== undefined) {
      out[pathKey] = value;
    }
  }
  return out;
}

/** Flat agent-k.* → nested object for editing / writing `.agentk/settings.json` */
export function unflattenProjectConfig(
  flat: Record<string, unknown>,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [fullKey, value] of Object.entries(flat)) {
    if (!fullKey.startsWith('agent-k.') || value === undefined) continue;
    if (!ALLOWED.has(fullKey)) continue;
    const parts = fullKey.slice('agent-k.'.length).split('.');
    let cur: Record<string, unknown> = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      const next = cur[p];
      if (!isPlainObject(next)) {
        cur[p] = {};
      }
      cur = cur[p] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]!] = value;
  }
  return root;
}

export type ParseProjectConfigResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; error: string };

export function parseProjectConfigJson(text: string): ParseProjectConfigResult {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isPlainObject(parsed)) {
      return { ok: false, error: 'Root must be a JSON object' };
    }
    const values = flattenProjectConfig(parsed);
    return { ok: true, values };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Full starter document for Create Example / new workspaces (no secrets).
 * Mirrors Settings Hub categories so the JSON tab and example file stay aligned.
 */
export function exampleProjectConfig(): Record<string, unknown> {
  return {
    provider: {
      type: 'litellm',
      baseUrl: '',
      model: '',
    },
    thinking: {
      effort: 'medium',
    },
    mode: {
      default: 'agent',
    },
    maxTurns: 25,
    turnTimeoutMs: 1_800_000,
    plan: {
      forceOnComplex: false,
    },
    debugClassifiers: false,
    permission: {
      level: 'accept_edits',
      denyGlobs: [
        '**/.env*',
        '**/secrets/**',
        '**/id_rsa*',
        '**/*.pem',
        '**/.git/**',
        '**/node_modules/**',
      ],
      requireApprovalTools: [
        'run_terminal_cmd',
        'delete_file',
        'checkpoint_restore',
      ],
    },
    queue: {
      onEnterWhileRunning: 'resynthesize',
      onStop: 'keep',
      resynthesizeDebounceMs: 300,
      debounceMs: 300,
    },
    context: {
      budget: 100000,
      readMaxLines: 5000,
      maxTurnsA: 25,
      maxTurnsB: 15,
    },
    harness: {
      enabled: true,
      verificationFirst: true,
      prefetchEnabled: true,
      verificationMicroLoop: true,
    },
    features: {
      browser: true,
      'design-mode': true,
      worktree: true,
      'agent-review': true,
      mcp: true,
      skills: true,
      'sub-agents': true,
      memories: true,
      'inline-completion': false,
      github: true,
      'codebase-index': true,
    },
    mcp: {
      maxSchemaTokens: 8000,
      servers: {
        'sequential-thinking': {
          type: 'local',
          command: ['npx', '-y', '@modelcontextprotocol/server-sequential-thinking'],
          enabled: true,
        },
      },
    },
    telemetry: {
      enabled: true,
      statusBarEnabled: true,
    },
    search: {
      localEmbedding: false,
    },
    verification: {
      testEnabled: true,
    },
    budget: {
      dailyTokens: 10000000,
      monthlyTokens: 100000000,
    },
  };
}

/** Serialize example nested config for writing to disk. */
export function exampleProjectConfigJson(indent = 2): string {
  return `${JSON.stringify(exampleProjectConfig(), null, indent)}\n`;
}

/** Pick only PROJECT_CONFIG_KEYS from a flat map (strips secrets by default). */
export function pickProjectConfigValues(
  flat: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PROJECT_CONFIG_KEYS) {
    if (flat[key] !== undefined) out[key] = flat[key];
  }
  delete out['agent-k.provider.apiKey'];
  delete out['agent-k.provider.apiKeys'];
  delete out['agent-k.github.token'];
  return out;
}
