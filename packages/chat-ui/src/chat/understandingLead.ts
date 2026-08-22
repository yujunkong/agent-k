/**
 * Phase 3 — live "understanding" lead extraction.
 *
 * Deliberately NOT built on openingLead.ts. That module's splitting
 * functions (splitStreamingLead / sanitizeOpeningLead /
 * promoteOpeningLeadFromAnswer) are dead code — nothing in the current
 * streaming pipeline calls them, and ChatMessage.openingLead is never
 * assigned a real value anywhere (only ever cleared to undefined). Whatever
 * history led to that (the "no top-of-bubble lead slot" note in
 * MessageBubble.tsx suggests a deliberate removal, not an oversight) is
 * unknown, so this is a fresh, self-contained implementation rather than
 * reactivating the old one.
 *
 * This operates on the LIVE, still-growing `content` string during the
 * pre-tools streaming window only (see showUnderstandingBox in
 * MessageBubble.tsx). It must not fire on a partial/incomplete sentence —
 * better to show nothing for a beat than a fragment.
 */

const LEAD_MAX = 220;

/** Korean sentence-ending patterns that read as a complete acknowledgment. */
const ACK_END_RE =
  /(?:습니다[.!]?|겠습니다[.!]?|할게요[.!]?|할게요!|볼게요[.!]?|보죠[.!]?|죠[.!]?|다[.!]|[.!?])\s*$/;

/** Typical opening words for a Cursor-style ack ("네, ~하겠습니다" etc.) */
const ACK_START_RE =
  /^(네|좋아요|알겠습니다|확인했습니다|살펴|분석|고치|수정|진행|요청|먼저|우선|그럼)/;

const ACK_TAIL_RE =
  /(하겠습니다|살펴보겠습니다|확인했습니다|진행하겠습니다|분석하겠습니다|읽어보겠습니다|확인해보겠습니다|볼게요|보죠)\.?$/;

/** Code fences, tables, headings, multi-line lists — never a one-line ack. */
function looksLikeMarkdownChunk(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.length > LEAD_MAX) return true;
  if ((t.match(/\n/g) || []).length >= 1) return true;
  if (/\|.+\|/.test(t)) return true;
  if (/```/.test(t)) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^\s*[-*]\s/.test(t)) return true;
  return false;
}

function looksLikeAck(sentence: string): boolean {
  const t = sentence.replace(/\*\*/g, '').trim();
  if (t.length < 6 || t.length > LEAD_MAX) return false;
  if (!ACK_END_RE.test(t)) return false;
  if (looksLikeMarkdownChunk(t)) return false;
  return ACK_START_RE.test(t) || ACK_TAIL_RE.test(t);
}

/**
 * Find the first complete sentence in `text` (ending in one of the ack
 * punctuation/verb-ending patterns). Returns null if no complete sentence
 * boundary has streamed in yet.
 */
function firstCompleteSentence(text: string): { head: string; rest: string } | null {
  const t = text.trim();
  if (!t) return null;

  // Stop at the first newline — a lead is always a single line.
  const firstLine = t.split('\n')[0];
  const restAfterLine = t.slice(firstLine.length).replace(/^\n+/, '');

  const m = firstLine.match(
    /^([\s\S]{6,220}?(?:습니다\.|겠습니다\.|할게요\.|할게요!|습니다!|볼게요\.|보죠\.))/
  );
  if (m) {
    const head = m[1].trim();
    const restOfLine = firstLine.slice(m[1].length).trim();
    const rest = [restOfLine, restAfterLine].filter(Boolean).join('\n').trim();
    return { head, rest };
  }

  // Whole first line ends in plain sentence punctuation and isn't markdown.
  if (
    firstLine.length >= 6 &&
    firstLine.length <= LEAD_MAX &&
    /[.!?]\s*$/.test(firstLine) &&
    t.includes('\n')
  ) {
    return { head: firstLine.trim(), rest: restAfterLine.trim() };
  }

  return null;
}

/**
 * Try to pull a short understanding/ack lead off the front of live,
 * still-streaming content. Returns '' (with rest === original content)
 * when nothing valid has streamed in yet — caller should show a plain
 * ellipsis/placeholder in that case, not this box.
 */
export function extractUnderstandingLead(content: string): {
  lead: string;
  rest: string;
} {
  const t = (content || '').trim();
  if (!t) return { lead: '', rest: '' };
  if (looksLikeMarkdownChunk(t.split('\n')[0])) return { lead: '', rest: content };

  const found = firstCompleteSentence(t);
  if (!found) return { lead: '', rest: content };
  if (!looksLikeAck(found.head)) return { lead: '', rest: content };

  return { lead: found.head, rest: found.rest };
}
