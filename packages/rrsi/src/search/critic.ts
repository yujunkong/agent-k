/**
 * Critic deterministic pre-checks — port of the non-LLM layer of
 * rrsi/critic.py. The LLM review layer is intentionally NOT ported here;
 * in Agent-K the critic LLM call goes through the normal host model path.
 *
 * Rejects edits that leak credentials or encode suite-specific logic.
 */

export interface CriticPattern {
  pattern: RegExp;
  reason: string;
}

/** Generic denylist shared by every domain (credentials, infra names). */
export const GENERIC_PATTERNS: CriticPattern[] = [
  {
    pattern:
      /AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{20,}|api_key\s*=\s*["'][^"']{8,}/,
    reason: 'credential in diff',
  },
];

/**
 * Deterministic screen. Returns rejection reasons; empty list = pass.
 * `domainPatterns` are the Agent-K equivalents of the domain denylist
 * (evolve-set task ids, grader paths...). The LLM review is a separate step.
 */
export function screenDiff(
  diff: string,
  domainPatterns: CriticPattern[] = []
): string[] {
  const rejections: string[] = [];
  for (const { pattern, reason } of [...GENERIC_PATTERNS, ...domainPatterns]) {
    if (pattern.test(diff)) rejections.push(reason);
  }
  return rejections;
}
