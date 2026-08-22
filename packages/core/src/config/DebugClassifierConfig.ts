/**
 * CFG-010 — Debug classifier diagnostics configuration.
 * Observability only — never changes classifier control flow.
 */

export const DEBUG_CLASSIFIER_CONFIG_KEY = 'agent-k.debugClassifiers' as const;

export interface DebugClassifierConfig {
  /** When true, ClassifierDiagnostics records observations. */
  enabled: boolean;
}

export const DEFAULT_DEBUG_CLASSIFIER_CONFIG: DebugClassifierConfig = {
  enabled: false,
};

export function extractDebugClassifierConfig(
  bag: Record<string, unknown>
): DebugClassifierConfig {
  return {
    enabled: bag[DEBUG_CLASSIFIER_CONFIG_KEY] === true,
  };
}
