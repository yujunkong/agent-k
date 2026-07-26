/**
 * Detect / extract plan markdown from an assistant chat message.
 */
import type { ChatMessage } from './types';
import { unescapeLiteralEscapes } from './displaySanitize';

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

function normalizePlanKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function planTitlesSimilar(a: string, b: string): boolean {
  const x = normalizePlanKey(a);
  const y = normalizePlanKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  // "Rust Migration Plan…" vs "Plan: Rust Migration…"
  const ax = x.replace(/^plan:\s*/, '');
  const ay = y.replace(/^plan:\s*/, '');
  return ax === ay || ax.includes(ay) || ay.includes(ax);
}

/**
 * Models often dump the plan twice (turnProse + final content, or a restarted
 * stream). Keep one complete document — prefer the longer / more complete half.
 */
export function dedupeRepeatedPlanDocument(md: string): string {
  const text = (md || '').trim();
  if (!text) return '';

  const headingRe = /^#\s+(.+)$/gm;
  const headings: Array<{ title: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text)) !== null) {
    headings.push({ title: m[1].trim(), index: m.index });
  }
  if (headings.length < 2) return text;

  // Find a second H1 that looks like a restarted plan (same/similar title)
  const first = headings[0];
  let splitAt = -1;
  for (let i = 1; i < headings.length; i++) {
    const h = headings[i];
    // Only split on later H1s that restart the plan (not ## sections)
    if (planTitlesSimilar(first.title, h.title)) {
      // Require some body between the two titles
      if (h.index - first.index > 200) {
        splitAt = h.index;
        break;
      }
    }
  }
  if (splitAt < 0) return text;

  const firstPart = text.slice(0, splitAt).trim();
  const secondPart = text.slice(splitAt).trim();

  const firstOk = looksLikePlanDocument(firstPart);
  const secondOk = looksLikePlanDocument(secondPart);

  if (firstOk && !secondOk) return firstPart;
  if (secondOk && !firstOk) return secondPart;
  if (firstOk && secondOk) {
    return firstPart.length >= secondPart.length ? firstPart : secondPart;
  }
  // Neither heuristic fully matches — still drop the shorter truncated restart
  return firstPart.length >= secondPart.length ? firstPart : secondPart;
}

/** Prefer a single best plan blob over naively concatenating duplicates */
function pickBestPlanParts(parts: string[]): string {
  const cleaned = parts
    .map((p) => unescapeLiteralEscapes(String(p || '').trim()))
    .filter(Boolean);
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return dedupeRepeatedPlanDocument(cleaned[0]);

  const planish = cleaned.filter(looksLikePlanDocument);
  if (planish.length > 0) {
    const best = planish.reduce((a, b) => (a.length >= b.length ? a : b));
    return dedupeRepeatedPlanDocument(best);
  }

  // Overlapping restart: keep longest unique
  let best = cleaned[0];
  for (const p of cleaned.slice(1)) {
    const a = normalizePlanKey(best);
    const b = normalizePlanKey(p);
    if (a === b) continue;
    if (a.includes(b)) continue; // best already supersets p
    if (b.includes(a)) {
      best = p;
      continue;
    }
    // Similar prefix → prefer longer
    const n = Math.min(120, a.length, b.length);
    if (n >= 60 && a.slice(0, n) === b.slice(0, n)) {
      if (p.length > best.length) best = p;
      continue;
    }
    best = dedupeRepeatedPlanDocument(`${best}\n\n${p}`);
  }
  return dedupeRepeatedPlanDocument(best);
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
  ].filter((s) => Boolean(s && String(s).trim())) as string[];
  return pickBestPlanParts(parts);
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
