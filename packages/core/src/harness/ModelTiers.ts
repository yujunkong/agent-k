/**
 * HARNESS-001 / HARNESS-006 — Model tier types + inference (v2.1 port).
 */
export type ModelTier = 'A' | 'B' | 'C';

export interface ModelParams {
  temperature: number;
  top_p: number;
  max_tokens: number;
  parallel_tool_calls: boolean;
}

export interface TierPolicy {
  tier: ModelTier;
  toolWhitelist: string[];
  modelParams: ModelParams;
  maxTurns: number;
  maxToolCallsPerTurn: number;
  forcePlanApproval: boolean;
  autoLintTest: boolean;
  autoVerifyTest: boolean;
  maxSubagents: number;
  concurrencyLimit: number;
}

export const TIER_POLICIES: Record<ModelTier, TierPolicy> = {
  A: {
    tier: 'A',
    toolWhitelist: [
      'grep',
      'glob',
      'list_dir',
      'read_file',
      'read_files',
      'codebase_search',
      'edit_file',
      'write_file',
      'run_terminal_cmd',
      'read_lints',
      'ask_question',
      'todo_write',
    ],
    modelParams: {
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 8192,
      parallel_tool_calls: false,
    },
    maxTurns: 15,
    maxToolCallsPerTurn: 12,
    forcePlanApproval: true,
    autoLintTest: true,
    autoVerifyTest: true,
    maxSubagents: 1,
    concurrencyLimit: 8,
  },
  B: {
    tier: 'B',
    toolWhitelist: [],
    modelParams: {
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 16384,
      parallel_tool_calls: true,
    },
    maxTurns: 25,
    maxToolCallsPerTurn: 16,
    forcePlanApproval: false,
    autoLintTest: false,
    autoVerifyTest: false,
    maxSubagents: 4,
    concurrencyLimit: 16,
  },
  C: {
    tier: 'C',
    toolWhitelist: [
      'grep',
      'glob',
      'list_dir',
      'read_file',
      'read_files',
      'codebase_search',
      'lsp_definition',
      'lsp_references',
    ],
    modelParams: {
      temperature: 0.0,
      top_p: 1.0,
      max_tokens: 4096,
      parallel_tool_calls: false,
    },
    maxTurns: 10,
    maxToolCallsPerTurn: 0,
    forcePlanApproval: false,
    autoLintTest: false,
    autoVerifyTest: false,
    maxSubagents: 0,
    concurrencyLimit: 4,
  },
};

/** Infer tier from model id string (default A). */
export function inferTierFromModelId(modelId: string): ModelTier {
  const id = modelId.toLowerCase();
  if (
    id.includes('pro') ||
    id.includes('opus') ||
    id.includes('4o') ||
    id.includes('sonnet') ||
    id.includes('large') ||
    id.includes('70b') ||
    id.includes('405b') ||
    id.includes('gpt-4') ||
    id.includes('claude-3.5') ||
    id.includes('claude-3-opus')
  ) {
    return 'B';
  }
  if (id.includes('base') && !id.includes('instruct')) {
    return 'C';
  }
  return 'A';
}

export function getPolicyForTier(tier: ModelTier): TierPolicy {
  return TIER_POLICIES[tier];
}

export function getPolicyForModel(modelId: string): TierPolicy {
  return getPolicyForTier(inferTierFromModelId(modelId));
}

const SECURITY_KEYWORDS = [
  'security',
  'vulnerability',
  'cve',
  'exploit',
  'injection',
  'xss',
  'csrf',
  'authentication',
  'authorization',
  'encryption',
  'secret',
  'credential',
  'password',
  'token',
  'api key',
  'concurrency',
  'race condition',
  'deadlock',
  'mutex',
  'protocol',
  'tls',
  'ssl',
  'oauth',
  'jwt',
];

export function hasSecurityKeywords(message: string): boolean {
  const msg = message.toLowerCase();
  return SECURITY_KEYWORDS.some((kw) => msg.includes(kw));
}

/** Estimate task complexity 0..1 for routing heuristics. */
export function estimateComplexity(
  userMessage: string,
  workspaceState?: { fileCount?: number },
): number {
  const msg = userMessage.toLowerCase();
  let score = 0.0;
  for (const kw of [
    'refactor',
    'migrate',
    'architecture',
    'redesign',
    'restructure',
    'reorganize',
    'rewrite',
  ]) {
    if (msg.includes(kw)) score += 0.2;
  }
  for (const kw of ['implement', 'create', 'build', 'design', 'integrate']) {
    if (msg.includes(kw)) score += 0.1;
  }
  if (workspaceState?.fileCount) {
    if (workspaceState.fileCount >= 10) score += 0.2;
    else if (workspaceState.fileCount >= 5) score += 0.1;
    else if (workspaceState.fileCount >= 3) score += 0.05;
  }
  if (userMessage.length > 500) score += 0.1;
  if (userMessage.length > 1000) score += 0.1;
  return Math.min(score, 1.0);
}
