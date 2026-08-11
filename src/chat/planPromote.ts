/**
 * Detect / extract plan markdown from an assistant chat message.
 */
import type { ChatMessage } from './types';
import { unescapeLiteralEscapes } from './displaySanitize';

/** Count markdown checklist rows (`- [ ]` / `- [x]`). */
export function countPlanCheckboxes(md: string): number {
  return ((md || '').match(/^\s*[-*]\s+\[[ xX]?\]/gm) || []).length;
}

/** Research / narration — must NOT be promoted as a plan document */
export function looksLikeResearchNarration(md: string): boolean {
  const t = (md || '').trim();
  if (!t) return false;
  if (looksLikePlanFsmNarration(t)) return true;
  const hits = (
    t.match(
      /살펴보겠습니다|더 파악하겠습니다|분석 결과를 종합|충분한 정보를 확보|Let me (?:dig|check|look|explore)|I'll (?:look|check|explore)|이제 핵심 파일|프로젝트 구조를 살펴|dig deeper|before drafting the plan|正式な plan|정식\s*plan\s*문서/gi
    ) || []
  ).length;
  // Several exploration beats and almost no checklist → narration, not a plan
  if (hits >= 2 && countPlanCheckboxes(t) < 2) return true;
  if (hits >= 3 && countPlanCheckboxes(t) === 0) return true;
  return false;
}

/**
 * Model narrates stage machine / tool calls instead of invoking them.
 * Must not become the user-visible answer or a fake Review promote.
 */
export function looksLikePlanFsmNarration(md: string): boolean {
  const t = (md || '').trim();
  if (!t) return false;
  const signals = (
    t.match(
      /plan_present_summary|plan_next_stage|summary has been presented|I'm now in the Review stage|now in the Review stage|call plan_next_stage|I should wait for the user's feedback|Confirm \(승인\)|Reject \(반려\)|Follow the procedure returned|STAGE CONTRACT|next-stage procedure/gi
    ) || []
  ).length;
  if (signals >= 2) return true;
  if (signals >= 1 && countPlanCheckboxes(t) < 2 && t.length < 2500) return true;
  return false;
}

/** Drop FSM meta lines so CoT about tools does not leak into the bubble */
export function stripPlanFsmNarration(md: string): string {
  const t = (md || '').trim();
  if (!t) return '';
  const lines = t.split('\n');
  const kept = lines.filter((line) => {
    const s = line.trim();
    if (!s) return true;
    return !/plan_present_summary|plan_next_stage|summary has been presented|I'm now in the Review stage|now in the Review stage|I should wait for the user's feedback|Confirm \(승인\)|Reject \(반려\)|Follow the procedure returned|STAGE CONTRACT|next-stage procedure|Good, the summary/i.test(
      s
    );
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Strip English/Korean internal monologue that weak models dump into the
 * answer channel (not the reasoning channel).
 */
export function stripPlanInternalMonologue(md: string): string {
  let t = stripPlanFsmNarration(md);
  if (!t) return '';
  // Drop trailing "The user wants me to…" blocks
  t = t
    .replace(
      /(?:^|\n+)(?:The user wants me to|Let me (?:start by|begin by|first|now)|I've (?:pointed|noted)|They've pointed to|I need to (?:explore|check|understand)|I'll (?:start|begin|explore))[\s\S]*$/i,
      ''
    )
    .trim();
  const lines = t.split('\n');
  const kept = lines.filter((line) => {
    const s = line.trim();
    if (!s) return true;
    if (
      /^(The user wants|Let me (?:start|begin|check|look|explore|think)|I'll (?:start|begin|explore|look)|I've (?:analyzed|reviewed)|They've pointed)/i.test(
        s
      )
    ) {
      return false;
    }
    return true;
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Actionable checklist required for Review promote.
 * Prose-only exploration / Q&A chatter must not open Review.
 */
export function hasPlanActionableTodos(md: string): boolean {
  const t = (md || '').trim();
  if (!t) return false;
  const checkboxes = countPlanCheckboxes(t);
  if (checkboxes >= 2) return true;
  // Explicit TODO section with at least one checkbox (single-item plans are rare but ok)
  if (checkboxes >= 1 && /##\s+TODOs?\b/i.test(t)) return true;
  // Numbered execution steps under a real plan section
  if (
    checkboxes === 0 &&
    /##\s+(TODOs?|Steps|Implementation)\b/i.test(t) &&
    ((t.match(/(?:^|\n)\s*\d+\.\s+\S+/gm) || []).length >= 3)
  ) {
    return true;
  }
  return false;
}

/** Heuristic: looks like a PLAN.md body worth opening in Review */
export function looksLikePlanDocument(md: string): boolean {
  const t = (md || '').trim();
  if (t.length < 120) return false;
  if (looksLikeResearchNarration(t)) return false;
  if (!hasPlanActionableTodos(t)) return false;
  const checkboxes = countPlanCheckboxes(t);
  const hasTitle = /^#\s+/m.test(t) || /\bPLAN\b/i.test(t.slice(0, 200));
  const hasSection =
    /##\s+(Context|Questions|Architecture|Risks|Approval|Implementation|Overview|Steps|TODOs?)\b/i.test(
      t
    );
  // Substantial Step N checklists without ## headers still count
  if (checkboxes >= 5 && /Step\s*\d+/i.test(t) && t.length >= 400) return true;
  return hasTitle || hasSection;
}

/**
 * Soften for planning-stage promote: still requires actionable TODOs.
 * Bare H1+## headings alone are NOT enough (research dumps often have those).
 */
export function looksLikePlanDraft(md: string): boolean {
  if (looksLikePlanDocument(md)) return true;
  const t = (md || '').trim();
  if (t.length < 200) return false;
  if (looksLikeResearchNarration(t)) return false;
  if (!hasPlanActionableTodos(t)) return false;
  const checkboxes = countPlanCheckboxes(t);
  // Full implementation checklist dumped into chat
  if (checkboxes >= 5) return true;
  const hasH1 = /^#\s+/m.test(t);
  const headings = (t.match(/^##\s+/gm) || []).length;
  return checkboxes >= 2 && (hasH1 || headings >= 1);
}

/**
 * True once the model has started writing the plan body (not mere research/thought).
 * Used to show the "작성 중" chrome only then.
 */
export function looksLikePlanWritingStart(md: string): boolean {
  const t = (md || '').trim();
  if (!t) return false;
  if (looksLikeResearchNarration(t)) return false;
  if (/^계획\s*문서\s*작성을\s*시작합니다/.test(t)) return true;
  if (looksLikePlanDocument(t) || looksLikePlanDraft(t)) return true;
  // Early stream: checkboxes starting (not bare H1 — too easy to false-positive)
  if (countPlanCheckboxes(t) >= 1 && t.length >= 40) return true;
  if (
    /^#\s+\S+/m.test(t) &&
    /##\s+(Context|TODOs?|Architecture|Implementation)\b/i.test(t) &&
    t.length >= 80
  ) {
    return true;
  }
  return false;
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
    .filter(Boolean)
    .filter((p) => !looksLikeResearchNarration(p));
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return dedupeRepeatedPlanDocument(cleaned[0]);

  const planish = cleaned.filter(
    (p) => looksLikePlanDocument(p) || looksLikePlanDraft(p)
  );
  if (planish.length > 0) {
    const best = planish.reduce((a, b) => (a.length >= b.length ? a : b));
    return dedupeRepeatedPlanDocument(best);
  }

  // No plan-like part — do NOT glue research asides into a fake plan
  return '';
}

/** Join openingLead + turnProse + content from an assistant message */
export function extractPlanMarkdownFromMessage(
  msg: ChatMessage | undefined | null
): string {
  if (!msg || msg.role !== 'assistant') return '';
  // Prefer final content when it is already a plan; avoid mixing research turnProse
  const content = unescapeLiteralEscapes(String(msg.content || '').trim());
  if (
    content &&
    (looksLikePlanDocument(content) || looksLikePlanDraft(content))
  ) {
    return dedupeRepeatedPlanDocument(content);
  }
  const parts = [
    msg.openingLead,
    ...(msg.turnProse || []).map((p) => p.content),
    msg.content
  ].filter((s) => Boolean(s && String(s).trim())) as string[];
  return pickBestPlanParts(parts);
}

/** Newest complete assistant that looks like a real plan (never research dumps) */
export function findLatestPlanMarkdown(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const stored = String(messages[i].planMarkdown || '').trim();
    if (
      stored &&
      stored !== 'discarded' &&
      (looksLikePlanDocument(stored) || looksLikePlanDraft(stored))
    ) {
      return stored;
    }
    const md = extractPlanMarkdownFromMessage(messages[i]);
    if (looksLikePlanDocument(md) || looksLikePlanDraft(md)) return md;
  }
  return '';
}

/** True when any assistant bubble still holds a promoted plan body */
export function findStoredPlanMarkdown(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const stored = String(messages[i].planMarkdown || '').trim();
    if (
      stored &&
      stored !== 'discarded' &&
      (looksLikePlanDocument(stored) || looksLikePlanDraft(stored))
    ) {
      return stored;
    }
  }
  return findLatestPlanMarkdown(messages);
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

  const qaBlock = text.match(
    /##\s+Questions(?:\s*&\s*Answers?)?\b[^\n]*\n+([\s\S]*?)(?=\n##\s|$)/i
  )?.[1];
  const qaLines = (qaBlock || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .slice(0, 12);

  const lines = [
    `## ${title}`,
    '',
    '전체 계획은 **Review 창**에 저장했습니다. 상단 **View Plans / Reject / Confirm**으로 진행하세요. 파일 경로를 직접 찾을 필요는 없습니다.',
    ''
  ];
  if (blurb) {
    lines.push(blurb, '');
  }
  if (qaLines.length > 0) {
    lines.push('### 확인된 답변', '', ...qaLines, '');
  }
  lines.push('### 진행 순서 (TODO)', '');
  if (todos.length > 0) {
    todos.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
  } else {
    lines.push('1. (TODO 항목을 Review 문서에서 확인하세요)');
  }
  lines.push('', '_상세·아키텍처·리스크는 Review 창에서 확인하세요. 창을 닫았다면 상단 **View Plans**를 누르세요._');
  return lines.join('\n');
}

/** Chat bubble after promote (summary) — full PLAN.md is gone from the thread */
export function looksLikePlanChatSummary(md: string): boolean {
  const t = (md || '').trim();
  if (!t) return false;
  return (
    /전체 계획은\s*\*\*Review 창\*\*에 저장했습니다/.test(t) ||
    /Review 창에 저장했습니다/.test(t)
  );
}

