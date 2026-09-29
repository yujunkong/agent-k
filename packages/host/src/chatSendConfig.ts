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
