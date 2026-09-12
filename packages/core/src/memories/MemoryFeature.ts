/**
 * MEM-003 — Memory feature flag gate (McpPermissions / SkillFeature 스타일).
 */
export interface MemoryFeaturePolicy {
  enabled?: boolean;
}

export function checkMemoryFeature(policy?: MemoryFeaturePolicy): { allowed: boolean; reason?: string } {
  if (policy?.enabled === false) {
    return { allowed: false, reason: 'Memories system is disabled by feature flag' };
  }
  return { allowed: true };
}
