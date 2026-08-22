/**
 * CFG-004 — Harness configuration helpers.
 */

export const HARNESS_CONFIG_KEYS = [
  'agent-k.harness.enabled',
  'agent-k.harness.verificationFirst',
  'agent-k.harness.prefetchEnabled',
  'agent-k.harness.verificationMicroLoop',
] as const;

export type HarnessConfigKey = (typeof HARNESS_CONFIG_KEYS)[number];

export interface HarnessConfig {
  enabled: boolean;
  verificationFirst: boolean;
  prefetchEnabled: boolean;
  verificationMicroLoop: boolean;
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  enabled: true,
  verificationFirst: true,
  prefetchEnabled: true,
  verificationMicroLoop: true,
};

export function extractHarnessConfig(
  bag: Record<string, unknown>
): HarnessConfig {
  return {
    enabled: bag['agent-k.harness.enabled'] !== false,
    verificationFirst: bag['agent-k.harness.verificationFirst'] !== false,
    prefetchEnabled: bag['agent-k.harness.prefetchEnabled'] !== false,
    verificationMicroLoop:
      bag['agent-k.harness.verificationMicroLoop'] !== false,
  };
}
