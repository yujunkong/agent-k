/**
 * HARB-T01: Model Tiers (A/B/C) 타입 + 라우팅 정책
 *
 * 모델 능력에 따른 티어 분류와 티어별 기본 정책(도구 화이트리스트, 파라미터, 강제 플랜 등).
 * "똑똑함의 상당 부분을 모델이 아니라 하네스에 둔다"는 원칙의 기반.
 *
 * PRD: PRD-Harness-01_Model_Tiers.md
 */

// ─── Tier Types ────────────────────────────────────────────────

export type ModelTier = 'A' | 'B' | 'C';

export interface ModelParams {
  temperature: number;
  top_p: number;
  max_tokens: number;
  parallel_tool_calls: boolean;
}

export type PlanTrigger =
  | 'file_count_ge_3'
  | 'keyword_refactor'
  | 'keyword_migration'
  | 'keyword_architecture';

export interface TierPolicy {
  tier: ModelTier;
  toolWhitelist: string[];
  modelParams: ModelParams;
  maxTurns: number;
  maxToolCallsPerTurn: number;
  forcePlanOn: PlanTrigger[];
  forcePlanApproval: boolean;
  autoLintTest: boolean;
  autoVerifyTest: boolean;
  maxSubagents: number;
  concurrencyLimit: number;
}

// ─── All Tools Reference ───────────────────────────────────────

export const ALL_TOOLS = [
  'grep', 'glob', 'list_dir', 'read_file', 'codebase_search',
  'lsp_definition', 'lsp_references', 'lsp_diagnostics',
  'edit_file', 'write_file', 'delete_file',
  'run_terminal_cmd', 'read_lints',
  'ask_question', 'todo_write',
  'switch_mode', 'fetch_rules',
  'browser_navigate', 'browser_click', 'browser_screenshot',
  'browser_evaluate', 'browser_console', 'browser_network',
  'browser_scroll', 'browser_wait',
  'web_search', 'web_fetch',
  'mcp_list_tools', 'mcp_call_tool',
  'task', 'task_run', 'skill_run',
  'checkpoint_create', 'checkpoint_restore',
  'add_instrumentation', 'remove_instrumentation',
  'collect_runtime_logs', 'request_reproduce',
] as const;

// ─── Tier Policies ─────────────────────────────────────────────

export const TIER_POLICIES: Record<ModelTier, TierPolicy> = {
  A: {
    tier: 'A',
    toolWhitelist: [
      'grep', 'glob', 'list_dir', 'read_file',
      'edit_file', 'write_file', 'run_terminal_cmd', 'read_lints',
      'ask_question', 'todo_write',
    ],
    modelParams: {
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 8192,
      parallel_tool_calls: false,
    },
    maxTurns: 15,
    maxToolCallsPerTurn: 4,
    forcePlanOn: [
      'file_count_ge_3',
      'keyword_refactor',
      'keyword_migration',
      'keyword_architecture',
    ],
    forcePlanApproval: true,
    autoLintTest: true,
    autoVerifyTest: true,
    maxSubagents: 1,
    concurrencyLimit: 8,
  },
  B: {
    tier: 'B',
    toolWhitelist: [...ALL_TOOLS],
    modelParams: {
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 16384,
      parallel_tool_calls: true,
    },
    maxTurns: 25,
    maxToolCallsPerTurn: 8,
    forcePlanOn: [],
    forcePlanApproval: false,
    autoLintTest: false,
    autoVerifyTest: false,
    maxSubagents: 4,
    concurrencyLimit: 16,
  },
  C: {
    tier: 'C',
    toolWhitelist: [
      'grep', 'glob', 'list_dir', 'read_file',
      'codebase_search', 'lsp_definition', 'lsp_references',
    ],
    modelParams: {
      temperature: 0.0,
      top_p: 1.0,
      max_tokens: 4096,
      parallel_tool_calls: false,
    },
    maxTurns: 10,
    maxToolCallsPerTurn: 0,
    forcePlanOn: [],
    forcePlanApproval: false,
    autoLintTest: false,
    autoVerifyTest: false,
    maxSubagents: 0,
    concurrencyLimit: 4,
  },
};

// ─── Tier Inference ────────────────────────────────────────────

/**
 * 모델 ID 문자열로부터 티어를 추론한다.
 * 패턴 매칭 기반이며 명시적 매핑이 없을 경우 기본값은 'A'이다.
 */
export function inferTierFromModelId(modelId: string): ModelTier {
  const id = modelId.toLowerCase();

  // Tier B 키워드 (강력한 모델)
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

  // Tier C 키워드 (base 모델, 도구 미지원)
  if (
    id.includes('base') ||
    id.includes('instruct') === false // non-instruct base models
  ) {
    // Only return C if it's explicitly a base-only model
    if (id.includes('base') && !id.includes('instruct')) {
      return 'C';
    }
  }

  // Tier A (기본값 — Flash, 소형 모델 등)
  return 'A';
}

/**
 * 모델 ID에 해당하는 티어 정책을 반환한다.
 */
export function getPolicyForModel(modelId: string): TierPolicy {
  const tier = inferTierFromModelId(modelId);
  return TIER_POLICIES[tier];
}

/**
 * 티어에 해당하는 정책을 반환한다.
 */
export function getPolicyForTier(tier: ModelTier): TierPolicy {
  return TIER_POLICIES[tier];
}

// ─── Complexity Heuristics ─────────────────────────────────────

/**
 * 사용자 메시지와 워크스페이스 상태를 기반으로 작업 복잡도를 추정한다.
 * 0.0 (단순) ~ 1.0 (매우 복잡)
 */
export function estimateComplexity(
  userMessage: string,
  workspaceState?: { fileCount?: number },
): number {
  const msg = userMessage.toLowerCase();
  let score = 0.0;

  // 키워드 기반 가중치
  const highComplexityKeywords = [
    'refactor', 'migrate', 'architecture', 'redesign',
    'restructure', 'reorganize', 'rewrite',
  ];
  const mediumComplexityKeywords = [
    'implement', 'create', 'build', 'design',
    'add feature', 'integrate', 'configure',
  ];

  for (const kw of highComplexityKeywords) {
    if (msg.includes(kw)) {
      score += 0.2;
    }
  }
  for (const kw of mediumComplexityKeywords) {
    if (msg.includes(kw)) {
      score += 0.1;
    }
  }

  // 파일 수 기반 가중치
  if (workspaceState?.fileCount) {
    if (workspaceState.fileCount >= 10) score += 0.2;
    else if (workspaceState.fileCount >= 5) score += 0.1;
    else if (workspaceState.fileCount >= 3) score += 0.05;
  }

  // 메시지 길이 기반 (긴 요청 = 복잡)
  if (userMessage.length > 500) score += 0.1;
  if (userMessage.length > 1000) score += 0.1;

  return Math.min(score, 1.0);
}

// ─── Security Keywords ─────────────────────────────────────────

const SECURITY_KEYWORDS = [
  'security', 'vulnerability', 'cve', 'exploit', 'injection',
  'xss', 'csrf', 'authentication', 'authorization', 'encryption',
  'secret', 'credential', 'password', 'token', 'api key',
  'concurrency', 'race condition', 'deadlock', 'mutex',
  'protocol', 'tls', 'ssl', 'oauth', 'jwt',
];

export function hasSecurityKeywords(message: string): boolean {
  const msg = message.toLowerCase();
  return SECURITY_KEYWORDS.some((kw) => msg.includes(kw));
}
