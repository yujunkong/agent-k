/**
 * CFG-003 — Permission configuration (types, defaults, validation).
 * Runtime PermissionGate lives in packages/safety (SAFE-001); this module owns policy knobs only.
 */

/** Cursor-style four-level permission ladder. */
export type PermissionLevel = 'ask' | 'accept_edits' | 'auto' | 'bypass';

export const PERMISSION_LEVELS: readonly PermissionLevel[] = [
  'ask',
  'accept_edits',
  'auto',
  'bypass',
] as const;

/** Flat VS Code / project keys owned by CFG-003. */
export type PermissionFlatKey =
  | 'agent-k.permission.level'
  | 'agent-k.permission.denyGlobs'
  | 'agent-k.permission.requireApprovalTools';

/** Write-gate policy knob (runtime gate is SAFE-004 / plan). */
export type WriteGatePolicyFlatKey = 'agent-k.plan.forceOnComplex';

export type Cfg003FlatKey = PermissionFlatKey | WriteGatePolicyFlatKey;

export const PERMISSION_FLAT_KEYS: readonly PermissionFlatKey[] = [
  'agent-k.permission.level',
  'agent-k.permission.denyGlobs',
  'agent-k.permission.requireApprovalTools',
] as const;

export const WRITE_GATE_POLICY_FLAT_KEYS: readonly WriteGatePolicyFlatKey[] = [
  'agent-k.plan.forceOnComplex',
] as const;

export const CFG003_FLAT_KEYS: readonly Cfg003FlatKey[] = [
  ...PERMISSION_FLAT_KEYS,
  ...WRITE_GATE_POLICY_FLAT_KEYS,
] as const;

/** Product default: accept_edits (PRD-Infra-05 / C4-T01). */
export const DEFAULT_PERMISSION_LEVEL: PermissionLevel = 'accept_edits';

/** Paths that must never be written/read by tools without explicit override. */
export const DEFAULT_DENY_GLOBS: readonly string[] = [
  '**/.env*',
  '**/secrets/**',
  '**/id_rsa*',
  '**/*.pem',
  '**/.git/**',
  '**/node_modules/**',
] as const;

/**
 * Under accept_edits, these tools still require user approval
 * (writes like edit/write auto-allow; delete/shell/restore do not).
 */
export const DEFAULT_REQUIRE_APPROVAL_TOOLS: readonly string[] = [
  'run_terminal_cmd',
  'delete_file',
  'checkpoint_restore',
] as const;

/** Tool names treated as writes for plan/agent soft write-gate policy metadata. */
export const WRITE_TOOL_NAMES: readonly string[] = [
  'edit_file',
  'write_file',
  'delete_file',
  'run_terminal_cmd',
] as const;

/** Write tools plus checkpoint restore (permission-gated set). */
export const PERMISSION_GATED_TOOL_NAMES: readonly string[] = [
  ...WRITE_TOOL_NAMES,
  'checkpoint_restore',
] as const;

export interface PermissionSettings {
  level: PermissionLevel;
  denyGlobs: readonly string[];
  requireApprovalTools: readonly string[];
}

export interface WriteGatePolicySettings {
  forceOnComplex: boolean;
}

/** Bundle SAFE-001 / loop wiring consumes after CFG merge. */
export interface PermissionConfigBundle {
  permission: PermissionSettings;
  writeGate: WriteGatePolicySettings;
}

export type PermissionConfigIssueCode =
  | 'invalid_level'
  | 'invalid_deny_globs'
  | 'invalid_require_approval_tools'
  | 'invalid_force_on_complex';

export interface PermissionConfigIssue {
  code: PermissionConfigIssueCode;
  key?: Cfg003FlatKey;
  message: string;
}

export type PermissionConfigParseResult =
  | { ok: true; value: PermissionConfigBundle }
  | { ok: false; issues: PermissionConfigIssue[] };

/** Flat defaults seeded into ConfigManager (CFG-001). */
export const PERMISSION_CONFIG_DEFAULTS: Readonly<Record<Cfg003FlatKey, unknown>> = {
  'agent-k.permission.level': DEFAULT_PERMISSION_LEVEL,
  'agent-k.permission.denyGlobs': [...DEFAULT_DENY_GLOBS],
  'agent-k.permission.requireApprovalTools': [...DEFAULT_REQUIRE_APPROVAL_TOOLS],
  'agent-k.plan.forceOnComplex': false,
};

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return (
    typeof value === 'string' &&
    (PERMISSION_LEVELS as readonly string[]).includes(value)
  );
}

export function parsePermissionLevel(
  raw: unknown,
  fallback: PermissionLevel = DEFAULT_PERMISSION_LEVEL,
): PermissionLevel {
  return isPermissionLevel(raw) ? raw : fallback;
}

/** Coerce unknown into a trimmed string list (drops non-strings). */
export function normalizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return out;
}

export function normalizeDenyGlobs(
  raw: unknown,
  fallback: readonly string[] = DEFAULT_DENY_GLOBS,
): { globs: string[]; issues: PermissionConfigIssue[] } {
  const issues: PermissionConfigIssue[] = [];
  if (raw === undefined || raw === null) {
    return { globs: [...fallback], issues };
  }
  if (!Array.isArray(raw)) {
    issues.push({
      code: 'invalid_deny_globs',
      key: 'agent-k.permission.denyGlobs',
      message: 'denyGlobs must be an array of strings',
    });
    return { globs: [...fallback], issues };
  }
  const globs = normalizeStringList(raw);
  if (globs.length === 0 && raw.length > 0) {
    issues.push({
      code: 'invalid_deny_globs',
      key: 'agent-k.permission.denyGlobs',
      message: 'denyGlobs contained no valid string patterns',
    });
    return { globs: [...fallback], issues };
  }
  return { globs, issues };
}

export function parseRequireApprovalTools(
  raw: unknown,
  fallback: readonly string[] = DEFAULT_REQUIRE_APPROVAL_TOOLS,
): string[] {
  if (raw === undefined || raw === null) return [...fallback];
  if (!Array.isArray(raw)) return [...fallback];
  const list = normalizeStringList(raw);
  return list.length > 0 ? list : [...fallback];
}

export function parseForceOnComplex(raw: unknown, fallback = false): boolean {
  if (typeof raw === 'boolean') return raw;
  return fallback;
}

export function extractPermissionSettings(
  flat: Record<string, unknown>,
  defaults?: Partial<PermissionSettings>,
): PermissionSettings {
  const baseLevel = defaults?.level ?? DEFAULT_PERMISSION_LEVEL;
  const baseDeny = defaults?.denyGlobs ?? DEFAULT_DENY_GLOBS;
  const baseApproval = defaults?.requireApprovalTools ?? DEFAULT_REQUIRE_APPROVAL_TOOLS;
  const { globs } = normalizeDenyGlobs(flat['agent-k.permission.denyGlobs'], baseDeny);
  return {
    level: parsePermissionLevel(flat['agent-k.permission.level'], baseLevel),
    denyGlobs: globs,
    requireApprovalTools: parseRequireApprovalTools(
      flat['agent-k.permission.requireApprovalTools'],
      baseApproval,
    ),
  };
}

export function extractWriteGatePolicySettings(
  flat: Record<string, unknown>,
  defaults?: Partial<WriteGatePolicySettings>,
): WriteGatePolicySettings {
  const fallback = defaults?.forceOnComplex ?? false;
  return {
    forceOnComplex: parseForceOnComplex(flat['agent-k.plan.forceOnComplex'], fallback),
  };
}

/**
 * Strict extract: returns issues when level / denyGlobs / forceOnComplex are malformed.
 * Missing keys fall back to defaults (still ok).
 */
export function extractPermissionConfig(
  flat: Record<string, unknown>,
): PermissionConfigParseResult {
  const issues: PermissionConfigIssue[] = [];

  const levelRaw = flat['agent-k.permission.level'];
  if (levelRaw !== undefined && !isPermissionLevel(levelRaw)) {
    issues.push({
      code: 'invalid_level',
      key: 'agent-k.permission.level',
      message: `Invalid permission level: ${String(levelRaw)}`,
    });
  }

  const denyResult = normalizeDenyGlobs(flat['agent-k.permission.denyGlobs']);
  issues.push(...denyResult.issues);

  const approvalRaw = flat['agent-k.permission.requireApprovalTools'];
  if (approvalRaw !== undefined && !Array.isArray(approvalRaw)) {
    issues.push({
      code: 'invalid_require_approval_tools',
      key: 'agent-k.permission.requireApprovalTools',
      message: 'requireApprovalTools must be an array of strings',
    });
  }

  const forceRaw = flat['agent-k.plan.forceOnComplex'];
  if (forceRaw !== undefined && typeof forceRaw !== 'boolean') {
    issues.push({
      code: 'invalid_force_on_complex',
      key: 'agent-k.plan.forceOnComplex',
      message: 'forceOnComplex must be a boolean',
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      permission: extractPermissionSettings(flat),
      writeGate: extractWriteGatePolicySettings(flat),
    },
  };
}

export function mergePermissionSettings(
  base: PermissionSettings,
  override: Partial<PermissionSettings>,
): PermissionSettings {
  return {
    level: override.level ?? base.level,
    denyGlobs: override.denyGlobs ?? base.denyGlobs,
    requireApprovalTools: override.requireApprovalTools ?? base.requireApprovalTools,
  };
}

export function permissionConfigToFlat(
  bundle: PermissionConfigBundle,
): Record<Cfg003FlatKey, unknown> {
  return {
    'agent-k.permission.level': bundle.permission.level,
    'agent-k.permission.denyGlobs': [...bundle.permission.denyGlobs],
    'agent-k.permission.requireApprovalTools': [
      ...bundle.permission.requireApprovalTools,
    ],
    'agent-k.plan.forceOnComplex': bundle.writeGate.forceOnComplex,
  };
}

/**
 * Minimal glob → RegExp for deny paths.
 * Double-star matches across path separators; single-star matches one segment.
 * A leading double-star slash may match an empty prefix.
 */
export function matchGlobPattern(path: string, pattern: string): boolean {
  let i = 0;
  let out = '^';
  const regexMeta = new Set(['.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === '*' && pattern[i + 1] === '*') {
      // double-star slash → optional path prefix; bare double-star → anything
      if (pattern[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 3;
      } else {
        out += '.*';
        i += 2;
      }
      continue;
    }
    if (ch === '*') {
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    if (regexMeta.has(ch)) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
    i += 1;
  }
  out += '$';
  return new RegExp(out).test(path);
}

export function isPathDenied(path: string, denyGlobs: readonly string[]): boolean {
  const normalized = path.replace(/\\/g, '/');
  return denyGlobs.some((pattern) => matchGlobPattern(normalized, pattern));
}

export function isWriteToolName(name: string): boolean {
  return (WRITE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isPermissionGatedToolName(name: string): boolean {
  return (PERMISSION_GATED_TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * Static policy helper for accept_edits (SAFE-001 will call this).
 * ask → always approval; bypass/auto → no forced approval from this list;
 * accept_edits → only tools listed in requireApprovalTools.
 */
export function toolRequiresExplicitApproval(
  toolName: string,
  level: PermissionLevel,
  requireApprovalTools: readonly string[] = DEFAULT_REQUIRE_APPROVAL_TOOLS,
): boolean {
  if (level === 'ask') return true;
  if (level === 'bypass' || level === 'auto') return false;
  // accept_edits
  return requireApprovalTools.includes(toolName);
}

/** Validate a single CFG-003 key for ConfigManager.validate. */
export function validatePermissionConfigValue(
  key: string,
  value: unknown,
): string | null {
  switch (key) {
    case 'agent-k.permission.level':
      if (!isPermissionLevel(value)) return 'Invalid permission level';
      return null;
    case 'agent-k.permission.denyGlobs': {
      if (!Array.isArray(value)) return 'denyGlobs must be an array';
      if (!value.every((item) => typeof item === 'string')) {
        return 'denyGlobs must be an array of strings';
      }
      return null;
    }
    case 'agent-k.permission.requireApprovalTools': {
      if (!Array.isArray(value)) return 'requireApprovalTools must be an array';
      if (!value.every((item) => typeof item === 'string')) {
        return 'requireApprovalTools must be an array of strings';
      }
      return null;
    }
    case 'agent-k.plan.forceOnComplex':
      if (typeof value !== 'boolean') return 'forceOnComplex must be a boolean';
      return null;
    default:
      return null;
  }
}
