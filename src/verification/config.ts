/**
 * VerificationConfig - Tier별 검증 설정 (C2-T23)
 * 
 * Tier A: lint만, retry=2
 * Tier B: lint+test, retry=1
 * Tier C: 비활성
 */
export type VerificationTier = 'A' | 'B' | 'C';

export interface VerificationConfig {
  tier: VerificationTier;
  enabled: boolean;
  retryCount: number;
  lintEnabled: boolean;
  testEnabled: boolean;
  maxRetries: number;
}

export const TIER_CONFIGS: Record<VerificationTier, VerificationConfig> = {
  A: { tier: 'A', enabled: true, retryCount: 2, lintEnabled: true, testEnabled: false, maxRetries: 2 },
  B: { tier: 'B', enabled: true, retryCount: 1, lintEnabled: true, testEnabled: true, maxRetries: 1 },
  C: { tier: 'C', enabled: false, retryCount: 0, lintEnabled: false, testEnabled: false, maxRetries: 0 }
};

export function getVerificationConfig(tier: VerificationTier = 'A'): VerificationConfig {
  return { ...TIER_CONFIGS[tier] };
}

/**
 * ADDON-T01: merge tier defaults with optional overrides.
 * - Tier A: lint only (safe default)
 * - Tier B: lint + related tests
 * - `testEnabled` override wins when provided (settings / LoopConfig)
 */
export function resolveVerificationHookOptions(
  tier: VerificationTier = 'A',
  overrides?: Partial<Pick<VerificationConfig, 'lintEnabled' | 'testEnabled' | 'maxRetries'>>
): Pick<VerificationConfig, 'lintEnabled' | 'testEnabled' | 'maxRetries' | 'tier'> {
  const base = getVerificationConfig(tier);
  return {
    tier,
    lintEnabled: overrides?.lintEnabled ?? base.lintEnabled,
    testEnabled: overrides?.testEnabled ?? base.testEnabled,
    maxRetries: overrides?.maxRetries ?? base.maxRetries,
  };
}

