/**
 * Opening lead = the model's own short acknowledgment (Cursor-style),
 * shown above Thought/tools. Never a client-side template paraphrase,
 * and never a full markdown answer dumped into the lead slot.
 */
import type { Attachment } from './types';

const LEAD_MAX = 220;

/** Complete ack only — never lock a mid-word fragment like "네, 러스트로 만들" */
function hasAckSentenceEnd(t: string): boolean {
  return /(?:습니다[.!]?|겠습니다[.!]?|할게요[.!]?|할게요!|볼게요[.!]?|보죠[.!]?|죠[.!]?|요[.!]?|다[.!]?|[.!?])\s*$/.test(
    t.trim()
  );
}

/** @deprecated kept only so old imports don't break — always returns '' */
export function buildOpeningLead(_userText: string, _files: Attachment[] = []): string {
  return '';
}

/** If the final answer repeats the lead, strip it so it isn't shown twice. */
export function stripDuplicateOpeningLead(content: string, lead: string): string {
  if (!content?.trim() || !lead?.trim()) return content;
  let body = content.trim();
  const leadPlain = lead.replace(/\*\*/g, '').trim();

  const candidates = [lead.trim(), leadPlain, `**${leadPlain}**`];
  for (const c of candidates) {
    if (body.startsWith(c)) {
      body = body.slice(c.length).replace(/^\s*/, '');
      break;
    }
  }
  body = body.replace(/^---\s*\n+/, '');
  return body.trim() || content;
}

function firstSentence(text: string): { head: string; rest: string } {
  const t = text.trim();
  if (!t) return { head: '', rest: '' };
  const m = t.match(
    /^([\s\S]{8,220}?(?:습니다\.|겠습니다\.|할게요\.|할게요!|습니다!|읽어보겠습니다\.|확인해보겠습니다\.|볼게요\.|\.\s|\n))/
  );
  if (m) {
    return { head: m[1].trim(), rest: t.slice(m[1].length).replace(/^---\s*/, '').trim() };
  }
  const line = t.split(/\n/)[0]?.trim() || '';
  if (line.length >= 8 && line.length <= LEAD_MAX) {
    return { head: line, rest: t.slice(line.length).replace(/^\n+/, '').trim() };
  }
  return { head: '', rest: t };
}

/** Full answer / tables / code must never sit in the lead slot. */
export function looksLikeMarkdownBody(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.length > LEAD_MAX) return true;
  if ((t.match(/\n/g) || []).length >= 3) return true;
  if (/\|.+\|/.test(t)) return true;
  if (/```/.test(t)) return true;
  if (/^#{1,6}\s/m.test(t)) return true;
  if (/^\s*[-*]\s/m.test(t) && t.includes('\n')) return true;
  return false;
}

export function looksLikeModelAck(s: string): boolean {
  const t = s.replace(/\*\*/g, '').trim();
  if (t.length < 8 || t.length > LEAD_MAX) return false;
  if (!hasAckSentenceEnd(t)) return false;
  if (looksLikeMarkdownBody(t)) return false;
  return (
    /^(네|좋아요|알겠습니다|확인했습니다|살펴|분석|고치|수정|진행|요청|먼저|우선|그럼)/.test(t) ||
    /(하겠습니다|살펴보겠습니다|확인했습니다|진행하겠습니다|분석하겠습니다|읽어보겠습니다|확인해보겠습니다|볼게요|보죠)\.?$/.test(
      t
    )
  );
}

export function isValidOpeningLead(s: string | undefined): boolean {
  const t = (s || '').trim();
  if (!t) return false;
  return looksLikeModelAck(t) && !looksLikeMarkdownBody(t);
}

/**
 * Split accumulated early prose into a short lead + body rest.
 * Used while streaming before tools and when sealing on tool.start.
 */
export function splitStreamingLead(accumulated: string): { lead: string; rest: string } {
  const t = accumulated.trim();
  if (!t) return { lead: '', rest: '' };

  const { head, rest } = firstSentence(t);
  if (head && looksLikeModelAck(head)) {
    return { lead: head, rest };
  }

  // Incomplete sentence — keep everything in one stream (content), never freeze a fragment as lead
  if (t.length <= LEAD_MAX && !looksLikeMarkdownBody(t) && !hasAckSentenceEnd(t)) {
    return { lead: '', rest: t };
  }

  // Long / markdown dump → body only (no fake lead)
  return { lead: '', rest: t };
}

/**
 * Repair bad leads (e.g. full answer stuffed into openingLead) and
 * optionally promote a short ack from the final answer.
 */
export function sanitizeOpeningLead(
  lead: string | undefined,
  content: string
): { lead: string; content: string } {
  const L = (lead || '').trim();
  const C = (content || '').trim();

  if (isValidOpeningLead(L)) {
    return { lead: L, content: stripDuplicateOpeningLead(C, L) };
  }

  // Bad or empty lead — merge back and try to promote a real short ack
  const merged = L && C ? `${L}\n\n${C}` : L || C;
  return promoteOpeningLeadFromAnswer(merged, '');
}

/**
 * When the model only emits the ack in the final answer (after tools),
 * lift that first ack sentence into openingLead so it appears above steps —
 * still the model's own words, just reordered in the UI.
 */
export function promoteOpeningLeadFromAnswer(
  content: string,
  existingLead?: string
): { lead: string; content: string } {
  if (isValidOpeningLead(existingLead)) {
    return {
      lead: existingLead!.trim(),
      content: stripDuplicateOpeningLead(content, existingLead!)
    };
  }

  // Existing lead was a markdown dump — fold into content first
  const folded =
    existingLead?.trim() && !isValidOpeningLead(existingLead)
      ? `${existingLead.trim()}\n\n${content}`.trim()
      : content;

  const { head, rest } = firstSentence(folded);
  if (head && looksLikeModelAck(head)) {
    return { lead: head, content: rest };
  }
  return { lead: '', content: folded };
}
