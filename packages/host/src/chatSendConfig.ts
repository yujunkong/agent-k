/**
 * V31-CFG-01 — Pure config resolution for chat.send / plan.execute.
 *
 * Reads `agent-k.*` settings through the `agent-k` configuration section
 * (sub-keys only). Never double-prefix keys — ISSUE-06 regression guard.
 * No vscode import: host callers pass a WorkspaceConfiguration-shaped reader.
 */

import { extractHarnessConfig, type HarnessConfig } from '@agent-k/core';

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
