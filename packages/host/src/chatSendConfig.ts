/**
 * V31-INTENT-01 / V31-CFG-01 / Phase C — pure config readers for chat.send.
 * Comment: keeps double-prefix / gate flags out of chatSend.ts body growth.
 */

export interface ConfigReader {
  get<T = unknown>(key: string): T | undefined;
}

/** Read agent-k.intentGate.enabled — default true (opt-out). */
export function readIntentGateEnabled(cfg: ConfigReader): boolean {
  return cfg.get('intentGate.enabled') !== false;
}

/**
 * V31-TOOL-01 — parse XML/JSON tool calls when native tool_calls are absent.
 * Default true: fallback only runs when `looksLikeBrokenToolPayload` matches.
 */
export function readToolCallFallbackEnabled(cfg: ConfigReader): boolean {
  return cfg.get('toolCallFallback.enabled') !== false;
}

/**
 * V31-TOOL-03 — reject non-unique edit_file search strings.
 * Default true: silent first-match edits are ISSUE-13; opt-out via setting.
 */
export function readStrictEditEnabled(cfg: ConfigReader): boolean {
  return cfg.get('tools.strictEdit') !== false;
}

/**
 * Resolve harness flags via sub-keys (ISSUE-06 / V31-CFG-01).
 * Comment: never re-prefix with `agent-k.` — ConfigReader already scopes.
 */
export function resolveHarnessSubKeys(cfg: ConfigReader): {
  enabled: boolean;
  verificationFirst: boolean;
  verificationMicroLoop: boolean;
  prefetchEnabled: boolean;
} {
  const enabled = cfg.get('harness.enabled') !== false;
  return {
    enabled,
    verificationFirst: cfg.get('harness.verificationFirst') !== false,
    verificationMicroLoop: cfg.get('harness.verificationMicroLoop') !== false,
    prefetchEnabled: cfg.get('harness.prefetchEnabled') !== false,
  };
}

/** Effective AND of master harness + each sub-flag. */
export function resolveEffectiveHarnessFlags(cfg: ConfigReader): {
  harnessEnabled: boolean;
  harnessVerifyFirst: boolean;
  harnessMicroLoop: boolean;
  harnessPrefetch: boolean;
} {
  const h = resolveHarnessSubKeys(cfg);
  return {
    harnessEnabled: h.enabled,
    harnessVerifyFirst: h.enabled && h.verificationFirst,
    harnessMicroLoop: h.enabled && h.verificationMicroLoop,
    harnessPrefetch: h.enabled && h.prefetchEnabled,
  };
}

/**
 * V31-CTX-02 — use model-generated compaction summaries.
 * Default false: opt-in (adds a model call per compaction window).
 */
export function readRealCompactionEnabled(cfg: ConfigReader): boolean {
  return cfg.get('compaction.realSummary') === true;
}

/**
 * V31-CTX-01 — host-owned session transcript (tool results survive sends).
 * Default false: changes prior contract; opt-in.
 */
export function readSessionTranscriptEnabled(cfg: ConfigReader): boolean {
  return cfg.get('sessionTranscript.enabled') === true;
}

/**
 * V31-RETRY-04 — recover from a permission denial instead of killing the run.
 * Default false; opt-in.
 */
export function readPermissionRecoveryEnabled(cfg: ConfigReader): boolean {
  return cfg.get('retry.permissionRecovery') === true;
}

/**
 * V31-RETRY-02 — delta-aware retry. When on, a failure with changed arguments
 * starts a fresh attempt budget instead of counting toward exhaustion.
 * Default false (opt-in).
 */
export function readDeltaAwareRetryEnabled(cfg: ConfigReader): boolean {
  return cfg.get('retry.deltaAware') === true;
}

/**
 * V31-RETRY-03 — extended doom-loop detection options. Both default off so the
 * AGENT-010 behavior is preserved. Returns undefined when neither is enabled.
 */
export function readDoomLoopOptions(
  cfg: ConfigReader,
): { detectAlternation?: boolean; ignoreArgsOnSameError?: boolean } | undefined {
  const detectAlternation = cfg.get('retry.doomLoop.detectAlternation') === true;
  const ignoreArgsOnSameError =
    cfg.get('retry.doomLoop.ignoreArgsOnSameError') === true;
  if (!detectAlternation && !ignoreArgsOnSameError) return undefined;
  return { detectAlternation, ignoreArgsOnSameError };
}

/**
 * V31-SUB-01 — carry the parent's uncommitted changes into subagent worktrees.
 * Default false: the worktree branch is HEAD-only unless opted in.
 */
export function readInheritParentChangesEnabled(cfg: ConfigReader): boolean {
  return cfg.get('subagent.inheritParentChanges') === true;
}
