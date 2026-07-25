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

export function injectVerificationError(
  lintErrors: string,
  retryCount: number,
  maxRetries: number
): string | null {
  if (!lintErrors) return null;
  if (retryCount >= maxRetries) {
    return `<system>Maximum retries (${maxRetries}) reached. Lint errors persist.\n${lintErrors}\nPlease ask the user for guidance.</system>`;
  }
  return `<system>Lint errors detected. Retry ${retryCount + 1}/${maxRetries}.\n${lintErrors}\nFix the issues above and try again.</system>`;
}
