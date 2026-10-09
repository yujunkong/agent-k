/**
 * V31-INTENT-01 / V31-CFG-01 — pure config readers for chat.send.
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
