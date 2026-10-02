/**
 * V31-CFG-01 — Pure config resolution for chat.send / plan.execute.
 *
 * Reads `agent-k.*` settings through the `agent-k` configuration section
 * (sub-keys only). Never double-prefix keys — ISSUE-06 regression guard.
 * No vscode import: host callers pass a WorkspaceConfiguration-shaped reader.
 */

import {
  HeuristicIntentClassifier,
  IntentGate,
  extractHarnessConfig,
  type HarnessConfig,
  type IntentClassifierInput,
} from '@agent-k/core';
import type { IntentGates, IntentVerdict } from '@agent-k/shared';

/** Minimal reader shape satisfied by vscode.WorkspaceConfiguration. */
export interface ConfigReader {
  get<T = unknown>(key: string): T | undefined;
}

/** Read agent-k.harness.* via the `agent-k` section (sub-keys, NOT double-prefixed). */
export function readHarnessConfig(cfg: ConfigReader): HarnessConfig {
  return extractHarnessConfig({
    'agent-k.harness.enabled': cfg.get('harness.enabled'),
    'agent-k.harness.verificationFirst': cfg.get('harness.verificationFirst'),
    'agent-k.harness.prefetchEnabled': cfg.get('harness.prefetchEnabled'),
    'agent-k.harness.verificationMicroLoop': cfg.get(
      'harness.verificationMicroLoop',
    ),
  });
}

/** Read agent-k.maxTurns, clamped to 5..100; fallback when not finite. */
export function readMaxTurns(cfg: ConfigReader, fallback: number): number {
  const raw = Number(cfg.get('maxTurns'));
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(100, Math.max(5, raw));
}

/** Read agent-k.intentGate.enabled — default true (opt-out). */
export function readIntentGateEnabled(cfg: ConfigReader): boolean {
  return cfg.get('intentGate.enabled') !== false;
}

/** V31-INTENT-01 — effective harness flags after ANDing intent gates. */
export interface EffectiveHarnessFlags {
  verificationFirst: boolean;
  microLoop: boolean;
  prefetch: boolean;
  harnessBlocks: boolean;
}

/** V31-INTENT-01 — AND harness config with intent gates (most restrictive wins). */
export function resolveEffectiveHarnessFlags(
  harness: HarnessConfig,
  gates: IntentGates,
): EffectiveHarnessFlags {
  const enabled = harness.enabled;
  return {
    verificationFirst:
      enabled && harness.verificationFirst && gates.verificationFirst,
    microLoop:
      enabled && harness.verificationMicroLoop && gates.verificationFirst,
    prefetch: enabled && harness.prefetchEnabled && gates.prefetch,
    harnessBlocks: enabled && gates.harnessBlocks,
  };
}

export const FULL_INTENT_GATES: IntentGates = {
  prefetch: true,
  verificationFirst: true,
  harnessBlocks: true,
  toolSchemas: 'full',
};

export interface IntentGateEvaluation {
  enabled: boolean;
  verdict: IntentVerdict;
  gates: IntentGates;
}

/** V31-INTENT-01 — evaluate the intent gate from config + input. */
export async function evaluateIntentGates(
  cfg: ConfigReader,
  input: IntentClassifierInput,
): Promise<IntentGateEvaluation> {
  const gate = new IntentGate(new HeuristicIntentClassifier());
  const verdict = await gate.evaluate(input);
  const enabled = readIntentGateEnabled(cfg);
  return {
    enabled,
    verdict,
    gates: enabled ? verdict.gates : { ...FULL_INTENT_GATES },
  };
}

/**
 * V31-TOOL-01 — parse XML/JSON tool calls when native tool_calls are absent.
 * Default true (deviation from the plan rollout table, which listed false):
 * the fallback only runs when `looksLikeBrokenToolPayload` matches, so the
 * opt-out exists for debugging rather than rollout.
 */
export function readToolCallFallbackEnabled(cfg: ConfigReader): boolean {
  return cfg.get('toolCallFallback.enabled') !== false;
}

/**
 * V31-TOOL-03 — reject non-unique edit_file search strings.
 * Default true (deviation from the plan rollout table, which listed false):
 * silent first-match edits are the ISSUE-13 bug; opt-out via setting.
 */
export function readStrictEditEnabled(cfg: ConfigReader): boolean {
  return cfg.get('tools.strictEdit') !== false;
}

/**
 * V31-CTX-02 — use model-generated compaction summaries.
 * Default false: the async path adds one model call per compaction window,
 * so it ships behind an explicit opt-in (plan rollout table §4.7 Phase B/C).
 */
export function readRealCompactionEnabled(cfg: ConfigReader): boolean {
  return cfg.get('compaction.realSummary') === true;
}

/**
 * V31-CTX-01 — host-owned session transcript (tool results survive sends).
 * Default false: it changes the prior contract, so it ships behind an opt-in
 * (plan rollout table §4.7 Phase B).
 */
export function readSessionTranscriptEnabled(cfg: ConfigReader): boolean {
  return cfg.get('sessionTranscript.enabled') === true;
}

/**
 * V31-RETRY-04 — recover from a permission denial instead of killing the run.
 * Default false (plan rollout table §4.7 Phase B); opt-in.
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
