/**
 * Detect / extract plan markdown from an assistant chat message.
 */
import type { ChatMessage } from './types';
import { unescapeLiteralEscapes } from './displaySanitize';

/** Heuristic: looks like a PLAN.md body worth opening in Review */
export function looksLikePlanDocument(md: string): boolean {
  const t = (md || '').trim();
  if (t.length < 120) return false;
  // Must have actionable checklist — prose-only exploration is not a plan
  const hasTodos =
    /- \[[ xX]\]/.test(t) ||
    /##\s+TODOs?\b/i.test(t) ||
    // Numbered execution steps (models often skip checkbox syntax)
    (/(?:^|\n)\s*\d+\.\s+\S+/m.test(t) &&
      /##\s+(Context|Architecture|Steps|Implementation|Overview)\b/i.test(t));
  if (!hasTodos) return false;
  const hasTitle = /^#\s+/m.test(t) || /\bPLAN\b/i.test(t.slice(0, 200));
  const hasSection =
    /##\s+(Context|Questions|Architecture|Risks|Approval|Implementation|Overview|Steps|TODOs?)\b/i.test(
      t
    );
  return hasTitle || hasSection;
}

/**
 * Soften for planning-stage promote: long structured markdown with headings.
 * Still rejects short chatter / pure exploration notes.
 */
export function looksLikePlanDraft(md: string): boolean {
  if (looksLikePlanDocument(md)) return true;
  const t = (md || '').trim();
  if (t.length < 400) return false;
  const headings = (t.match(/^##\s+/gm) || []).length;
  const hasH1 = /^#\s+/m.test(t);
  return hasH1 && headings >= 2;
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

/**
 * Chat bubble after promote: short summary + ordered TODOs.
 * Full document lives in Review / `.agentk/plans/tmp/plan_*.md`.
 */
export function buildPlanChatSummary(planMd: string): string {
  const text = (planMd || '').trim();
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Plan';
  const todos: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split('\n')) {
    const m = raw.match(/^\s*[-*]\s+\[[ xX]?\]\s+(.+)$/);
    if (!m) continue;
    let item = m[1]
      .trim()
      .replace(/^\*\*Step\s+\d+\*\*\s*:\s*/i, '')
      .replace(/^Step\s+\d+\s*:\s*/i, '')
      .replace(/^\*\*|\*\*$/g, '')
      .trim();
    if (!item || seen.has(item)) continue;
    if (/I have reviewed|I understand the risks/i.test(item)) continue;
    seen.add(item);
    todos.push(item);
  }

  const contextBlock = text.match(
    /##\s+Context\b[^\n]*\n+([\s\S]*?)(?=\n##\s|$)/i
  )?.[1];
  const blurb = (contextBlock || '')
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('- ['))
    .slice(0, 3)
    .join(' ')
    .slice(0, 280);

  const lines = [
    `## ${title}`,
    '',
    '전체 계획은 Review 문서에 저장했습니다. **승인**하면 리뷰를 마치고 계획대로 진행합니다. **반려**하면 수정합니다.',
    ''
  ];
  if (blurb) {
    lines.push(blurb, '');
  }
  lines.push('### 진행 순서 (TODO)', '');
  if (todos.length > 0) {
    todos.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
  } else {
    lines.push('1. (TODO 항목을 Review 문서에서 확인하세요)');
  }
  lines.push('', '_상세·아키텍처·리스크는 Review 패널 또는 에디터에서 확인하세요._');
  return lines.join('\n');
}
