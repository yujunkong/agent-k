/**
 * EXT-003 — pure plan-editor path/content helpers (no vscode import; testable).
 * v2.1 `PlanStorage` parity for `.agentk/plans/**` markdown drafts.
 */

/** True for Agent K plan drafts under `.agentk/plans/**`. */
export function isPlanDocumentPath(fsPath: string): boolean {
  const normalized = fsPath.replace(/\\/g, '/');
  if (!normalized.includes('/.agentk/plans/')) return false;
  const base = normalized.split('/').pop() || '';
  return /^plan_[a-f0-9]+\.md$/i.test(base) || /^PLAN-.+\.md$/i.test(base);
}

export function slugFromPlanPath(fsPath: string): string {
  const base = fsPath.replace(/\\/g, '/').split('/').pop() || '';
  return base.replace(/\.md$/i, '').replace(/^PLAN-/i, '');
}

export function stripPlanFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return raw;
  return raw.slice(end + 4).replace(/^\s+/, '');
}

export function titleFromPlanContent(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled Plan';
}
