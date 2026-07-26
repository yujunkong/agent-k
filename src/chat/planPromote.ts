/**
 * Detect / extract plan markdown from an assistant chat message.
 */
import type { ChatMessage } from './types';

/** Heuristic: looks like a PLAN.md body worth opening in Review */
export function looksLikePlanDocument(md: string): boolean {
  const t = (md || '').trim();
  if (t.length < 80) return false;
  const hasTitle = /^#\s+/m.test(t) || /\bPLAN\b/i.test(t.slice(0, 200));
  const hasTodos =
    /##\s+TODOs?\b/i.test(t) ||
    /- \[[ xX]\]/.test(t) ||
    /##\s+Implementation/i.test(t);
  const hasSection =
    /##\s+(Context|Questions|Architecture|Risks|Approval)\b/i.test(t);
  return (hasTitle && hasTodos) || (hasTodos && hasSection) || (hasTitle && hasSection);
}

/** Join openingLead + turnProse + content from an assistant message */
export function extractPlanMarkdownFromMessage(
  msg: ChatMessage | undefined | null
): string {
  if (!msg || msg.role !== 'assistant') return '';
  const parts = [
    msg.openingLead,
    ...(msg.turnProse || []).map((p) => p.content),
    msg.content
  ]
    .filter((s) => Boolean(s && String(s).trim()))
    .map(String);
  return parts.join('\n\n').trim();
}

/** Newest complete assistant that looks like a plan */
export function findLatestPlanMarkdown(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const md = extractPlanMarkdownFromMessage(messages[i]);
    if (looksLikePlanDocument(md)) return md;
  }
  // Fallback: largest assistant blob even if heuristic is soft
  let best = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    const md = extractPlanMarkdownFromMessage(m);
    if (md.length > best.length) best = md;
  }
  return best.length >= 200 ? best : '';
}
