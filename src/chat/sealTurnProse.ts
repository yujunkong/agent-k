/**
 * When tools start again, preserve mid-turn assistant prose.
 *
 * - Settled findings / summaries → turnProse (UI hoists below Worked)
 * - First seal of a dig (no explore tools yet this turn) → visible turnProse lead
 * - Later seals while Exploring already has tools → fold into Thought (self-talk)
 * - After prior research in the thread: canned "안녕하세요 / 구조 파악" → Thought
 */
import type { ChatMessage } from './types';
import {
  isAnswerLikeTurnProse,
  isShortDigAck,
  looksLikeSubstantialFindings,
  looksLikePlanStepProgress,
  looksLikePlanStepStart,
  looksLikePlanStepComplete,
  looksLikeInternalPlanningDump,
  stripInternalPlanningChrome
} from './turnProseSplit';

export type SealProseOptions = {
  /**
   * Plan planning/review after research+Q&A: dig-acks must not become visible
   * "구조를 파악하겠습니다" leads on a fresh assistant bubble.
   */
  foldPlanningDigs?: boolean;
  /**
   * Earlier assistant already researched / summarized in this chat.
   * Fold canned structure-scan reopeners even on a fresh research bubble.
   */
  foldRepeatResearchDigs?: boolean;
};

const TOOL_KINDS = new Set([
  'searching',
  'reading',
  'editing',
  'running',
  'browsing',
  'asking'
]);

/** Explore tools — presence means a dig already started this turn */
const EXPLORE_KINDS = new Set(['searching', 'reading', 'browsing']);

export function hasToolSteps(msg: ChatMessage): boolean {
  return (msg.steps || []).some((s) => TOOL_KINDS.has(s.kind));
}

/** True if this assistant bubble already ran explore tools (any turn). */
export function hasPriorExploreTools(msg: ChatMessage): boolean {
  return (msg.steps || []).some((s) => EXPLORE_KINDS.has(s.kind));
}

/** Canned reopeners that must not reappear after research already ran. */
export function isCannedStructureScanDigAck(text: string): boolean {
  const t = (text || '').replace(/\*\*/g, '').trim();
  if (!t || t.length > 520) return false;
  if (
    /안녕하세요[!！.]/.test(t) &&
    /(?:수정\s*)?계획|프로젝트|구조|파악|살펴보|세워보/i.test(t)
  ) {
    return true;
  }
  if (/프로젝트\s*구조를\s*(?:먼저\s*)?(?:파악|살펴)/i.test(t)) return true;
  if (/코드베이스를\s*살펴보겠/i.test(t)) return true;
  if (/I'll understand the project structure/i.test(t)) return true;
  if (
    /먼저\s+프로젝트\s+구조를\s+파악하겠/i.test(t) ||
    /계획을\s*세워보겠(?:습니다|어요)?[.!]?\s*먼저/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * True when an earlier completed assistant already explored or posted findings.
 * Suppresses second-turn "안녕하세요, 구조 파악" restarts in Plan mode.
 */
export function threadHasCompletedPlanResearch(
  messages: ChatMessage[],
  excludeId?: string
): boolean {
  for (const m of messages) {
    if (excludeId && m.id === excludeId) continue;
    if (m.role !== 'assistant') continue;
    if (m.status === 'streaming') continue;
    const exploreCount = (m.steps || []).filter((s) =>
      EXPLORE_KINDS.has(s.kind)
    ).length;
    const parts = [
      m.content || '',
      ...(m.turnProse || []).map((p) => String(p.content || ''))
    ]
      .join('\n')
      .trim();
    if (exploreCount >= 2) return true;
    if (exploreCount >= 1 && parts.length >= 120) return true;
    if (isAnswerLikeTurnProse(parts) && parts.length >= 160) return true;
  }
  return false;
}

function shouldFoldDigAcks(opts?: SealProseOptions): boolean {
  return Boolean(opts?.foldPlanningDigs || opts?.foldRepeatResearchDigs);
}

/** True for tiny trailing shards left after mid-dig divert (any language). */
export function looksLikeOrphanFragment(text: string): boolean {
  const t = (text || '').replace(/\*\*/g, '').trim();
  if (!t) return true;
  if (t.length <= 3) return true;
  // Truncated tails: "겠습니다.", "악하겠습니다.", ". ", "confirm."
  if (t.length < 36 && !/\n/.test(t)) {
    if (/^(겠|습니|니다|악하겠|인하겠|하겠습니다)/.test(t)) return true;
    if (/겠습니다\.?$/.test(t) && t.length < 28) return true;
    if (/^(I'll |I will |Let me )/i.test(t) && t.length < 40) return true;
  }
  if (looksLikeLeadingJosaOrphan(t)) return true;
  return false;
}

/**
 * Body resumes mid-sentence after a bad Thought/body split.
 * Only true josa resumptions — not sentence-initial "이/그/저".
 */
export function looksLikeLeadingJosaOrphan(text: string): boolean {
  const t = (text || '').replace(/\*\*/g, '').trim();
  if (!t) return false;
  return /^(으로|로써|로서|로부터|로부터의|을|를|과|와|며|서|께|에게|한테)\s*\S/.test(
    t
  );
}

/**
 * Live stream: keep dig-progress narration in Thought (not under findings).
 * Once a mid-dig fold starts, keep folding short shards so the body never
 * shows orphans like "**악하겠습니다.**" after content was cleared.
 */
export function divertMidDigContent(
  msg: ChatMessage,
  nextContent: string,
  turn: number,
  opts?: SealProseOptions
): ChatMessage | null {
  const text = (nextContent || '').trim();
  if (!text) return null;
  const prior = hasPriorExploreTools(msg);
  const hadTools = hasToolSteps(msg);
  const foldDigs = shouldFoldDigAcks(opts);
  if (!prior && !hadTools && !foldDigs) return null;

  const midDigFoldActive = (msg.steps || []).some(
    (s) =>
      s.kind === 'thinking' &&
      (s.turn ?? 1) === turn &&
      String(s.detail || '').trim().length > 0
  );

  // Mid-sentence resume ("으로 파악했습니다") — fold even if settle heuristics match
  if (midDigFoldActive && looksLikeLeadingJosaOrphan(text)) {
    return foldTextIntoThought(
      { ...msg, content: '', openingLead: undefined },
      text,
      turn
    );
  }

  // After tools: step-start intent must not linger as body under Worked
  if ((prior || hadTools) && looksLikePlanStepStart(text)) {
    return {
      ...msg,
      content: '',
      openingLead: undefined,
      turnProse: pushProseAtFront(msg.turnProse || [], 1, text)
    };
  }

  // After tools already ran: fold "Planning next moves" re-dumps into Thought
  // BEFORE findings heuristics (numbered "I need to: 1. 2." looks substantial).
  if ((prior || hadTools) && looksLikeInternalPlanningDump(text)) {
    return foldTextIntoThought(
      { ...msg, content: '', openingLead: undefined },
      text,
      turn
    );
  }

  // Real deliverables / findings stay in the body (structure, not locale phrases)
  if (looksLikeSubstantialFindings(text) || isAnswerLikeTurnProse(text)) {
    return null;
  }
  // Plan step progress must stay visible between Exploring blocks
  if (looksLikePlanStepProgress(text)) {
    return null;
  }
  if (/계획\s*문서\s*작성을\s*시작합니다/.test(text)) return null;
  if (/^#\s+\S+/m.test(text) && text.length >= 120) return null;
  if ((text.match(/^\s*[-*]\s+\[[ xX]?\]/gm) || []).length >= 1) return null;

  const digAck =
    isShortDigAck(text) ||
    isCannedStructureScanDigAck(text) ||
    /좋습니다\.\s*프로젝트|심층 분석|Let me (?:dig|check|look|explore|verify)|I'll (?:look|check|explore)/i.test(
      text
    );

  // Continue folding ONLY dig-acks / orphan shards — never arbitrary short
  // prefixes (that split "…기반" | "으로 파악했습니다" across Thought/body).
  if (midDigFoldActive && (digAck || looksLikeOrphanFragment(text))) {
    return foldTextIntoThought(
      { ...msg, content: '', openingLead: undefined },
      text,
      turn
    );
  }

  if (!digAck) return null;
  // Folding on a fresh bubble: keep long real answers out of Thought
  if (!prior && foldDigs && text.length > 600) return null;
  // Repeat-research fold: only canned / short dig restarts
  if (
    !prior &&
    opts?.foldRepeatResearchDigs &&
    !opts?.foldPlanningDigs &&
    !isCannedStructureScanDigAck(text) &&
    text.length > 180
  ) {
    return null;
  }
  return foldTextIntoThought(
    { ...msg, content: '', openingLead: undefined },
    text,
    turn
  );
}

function pushProse(
  prev: NonNullable<ChatMessage['turnProse']>,
  turn: number,
  content: string
): NonNullable<ChatMessage['turnProse']> {
  const text = content.trim();
  if (!text) return prev;
  const last = prev[prev.length - 1];
  if (last && last.content.trim() === text) return prev;
  return [
    ...prev,
    {
      id: `prose_${turn}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      turn,
      content: text
    }
  ];
}

function pushProseAtFront(
  prev: NonNullable<ChatMessage['turnProse']>,
  turn: number,
  content: string
): NonNullable<ChatMessage['turnProse']> {
  const text = content.trim();
  if (!text) return prev;
  if (prev.some((p) => p.content.trim() === text)) {
    return prev.map((p) =>
      p.content.trim() === text && looksLikePlanStepStart(text)
        ? { ...p, turn: Math.min(p.turn || turn, turn) }
        : p
    );
  }
  return [
    {
      id: `prose_${turn}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      turn,
      content: text
    },
    ...prev
  ];
}

/**
 * "Step 1부터 시작합니다" must sit ABOVE later "Step 1 완료" in the timeline.
 * If it lingered in message.content (under Worked), hoist it to turnProse turn 1.
 */
export function hoistStaleStepStartToTimeline(msg: ChatMessage): ChatMessage {
  const body = (msg.content || '').trim();
  let prose = [...(msg.turnProse || [])];
  let changed = false;

  if (body && looksLikePlanStepStart(body)) {
    prose = pushProseAtFront(prose, 1, body);
    changed = true;
  }

  // Re-pin step-start entries that were sealed on a late agent turn
  prose = prose.map((p) => {
    if (looksLikePlanStepStart(p.content) && (p.turn ?? 1) > 1) {
      changed = true;
      return { ...p, turn: 1 };
    }
    return p;
  });

  prose.sort((a, b) => {
    const ta = a.turn || 1;
    const tb = b.turn || 1;
    if (ta !== tb) return ta - tb;
    const rank = (c: string) =>
      looksLikePlanStepStart(c) ? 0 : looksLikePlanStepComplete(c) ? 2 : 1;
    return rank(a.content) - rank(b.content);
  });

  if (!changed && prose.length === (msg.turnProse || []).length) {
    // sort may still change order
    const sameOrder =
      prose.length === (msg.turnProse || []).length &&
      prose.every((p, i) => p.id === (msg.turnProse || [])[i]?.id);
    if (sameOrder && !body) return msg;
    if (sameOrder && body && !looksLikePlanStepStart(body)) return msg;
  }

  return {
    ...msg,
    content: body && looksLikePlanStepStart(body) ? '' : msg.content,
    openingLead:
      body && looksLikePlanStepStart(body) ? undefined : msg.openingLead,
    turnProse: prose
  };
}

/** Fold legacy openingLead into body (no space eaten for Hangul). */
function coalesceLeadBody(lead: string, body: string): string {
  if (!lead) return body;
  if (!body) return lead;
  if (/\s$/.test(lead) || /^\s/.test(body)) return `${lead}${body}`.trim();
  if (/[가-힣a-zA-Z]$/.test(lead) && /^[가-힣a-zA-Z]/.test(body)) {
    return `${lead} ${body}`.trim();
  }
  return `${lead}${body}`.trim();
}

function alreadyInThought(detail: string, text: string): boolean {
  const d = detail.trim();
  const t = text.trim();
  if (!t) return true;
  if (!d) return false;
  if (d.includes(t)) return true;
  if (t.includes(d) && t.length <= d.length + 8) return true;
  return false;
}

function foldTextIntoThought(
  msg: ChatMessage,
  text: string,
  turn: number
): ChatMessage {
  const steps = [...(msg.steps || [])];
  let idx = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].kind === 'thinking' && (steps[i].turn ?? turn) === turn) {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].kind === 'thinking') {
        idx = i;
        break;
      }
    }
  }

  if (idx >= 0) {
    const prev = String(steps[idx].detail || '');
    if (alreadyInThought(prev, text)) {
      return { ...msg, openingLead: undefined, content: '' };
    }
    const detail = prev.trim() ? `${prev.trim()}\n\n${text}` : text;
    steps[idx] = { ...steps[idx], detail };
    return { ...msg, steps, openingLead: undefined, content: '' };
  }

  steps.push({
    id: `tl_thinking_${turn}_asides`,
    kind: 'thinking',
    label: 'Thought',
    detail: text,
    turn,
    thoughtRole: 'opening',
    itemStatus: 'done'
  });
  return { ...msg, steps, openingLead: undefined, content: '' };
}

function hasExploreToolsThisTurn(msg: ChatMessage, turn: number): boolean {
  return (msg.steps || []).some(
    (s) => EXPLORE_KINDS.has(s.kind) && (s.turn ?? 1) === turn
  );
}

/** Any prior dig in this bubble (seal runs before the new tool step is pushed). */
function hasPriorExploreOnMessage(msg: ChatMessage): boolean {
  return hasPriorExploreTools(msg);
}

/**
 * After a turn completes: if the visible body is empty/orphan but Thought holds
 * substantial findings, hoist them to turnProse so Worked collapse does not
 * hide the only useful answer (language-agnostic).
 */
export function recoverHiddenFindings(msg: ChatMessage): ChatMessage {
  const turn = resolveSealTurn(msg);
  const content = (msg.content || '').trim();
  const thoughtText = (msg.steps || [])
    .filter((s) => s.kind === 'thinking')
    .map((s) => String(s.detail || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const orphan = looksLikeOrphanFragment(content);
  const bodyWeak = !content || orphan;

  let next = msg;
  if (bodyWeak && looksLikeSubstantialFindings(thoughtText)) {
    next = {
      ...msg,
      content: '',
      openingLead: undefined,
      turnProse: pushProse(msg.turnProse || [], turn, thoughtText)
    };
  } else if (orphan && content) {
    next = foldTextIntoThought(
      { ...msg, content: '', openingLead: undefined },
      content,
      turn
    );
  }

  // Always: step-start body under Worked → timeline top (chronological)
  return hoistStaleStepStartToTimeline(next);
}

/**
 * Seal body before tools:
 * - No explore tools yet this turn → visible lead (turnProse)
 * - Already exploring this turn → Thought (mid-dig self-talk)
 * - Planning / repeat-research dig-acks → Thought (even on a fresh bubble)
 */
export function sealBodyBeforeTools(
  msg: ChatMessage,
  currentTurn: number,
  opts?: SealProseOptions
): ChatMessage {
  const body = (msg.content || '').trim();
  const rawLead = (msg.openingLead || '').trim();
  const coalesced = coalesceLeadBody(rawLead, body);

  if (!coalesced) {
    return { ...msg, openingLead: undefined, content: '' };
  }

  const sealTurn = Math.max(1, currentTurn || 1);
  const priorExplore = hasPriorExploreOnMessage(msg);
  const thisTurnExplore = hasExploreToolsThisTurn(msg, sealTurn);
  const foldDigs = shouldFoldDigAcks(opts);
  const digAck =
    isShortDigAck(coalesced) || isCannedStructureScanDigAck(coalesced);

  // After tools: internal "Planning next moves" dumps → Thought (not body)
  // Check before substantial-findings (numbered re-plans look like findings).
  if (
    (thisTurnExplore || priorExplore || hasToolSteps(msg)) &&
    looksLikeInternalPlanningDump(coalesced)
  ) {
    return foldTextIntoThought(msg, coalesced, sealTurn);
  }

  // Plan step START → timeline turn 1 (must sit above later "Step N 완료")
  if (looksLikePlanStepStart(coalesced)) {
    return {
      ...msg,
      openingLead: undefined,
      content: '',
      turnProse: pushProseAtFront(msg.turnProse || [], 1, coalesced)
    };
  }

  // Plan step progress → visible turnProse (closes Exploring in MessageSteps)
  if (looksLikePlanStepProgress(coalesced)) {
    return {
      ...msg,
      openingLead: undefined,
      content: '',
      turnProse: pushProse(msg.turnProse || [], sealTurn, coalesced)
    };
  }

  // Structural findings / wrap-ups → always visible (language-agnostic)
  if (looksLikeSubstantialFindings(coalesced) || isAnswerLikeTurnProse(coalesced)) {
    // Exception: tiny dig-ack that also matched settle heuristics
    if (isShortDigAck(coalesced) && !looksLikeSubstantialFindings(coalesced)) {
      /* fall through to Thought fold */
    } else {
      return {
        ...msg,
        openingLead: undefined,
        content: '',
        turnProse: pushProse(msg.turnProse || [], sealTurn, coalesced)
      };
    }
  }

  const foldFreshCanned =
    foldDigs &&
    digAck &&
    !/계획\s*문서\s*작성을\s*시작합니다/.test(coalesced) &&
    (Boolean(opts?.foldPlanningDigs) ||
      isCannedStructureScanDigAck(coalesced) ||
      coalesced.length < 220);

  // Short dig self-talk only → Thought. Never fold multi-line findings away.
  if (
    foldFreshCanned ||
    ((thisTurnExplore || priorExplore) && isShortDigAck(coalesced))
  ) {
    return foldTextIntoThought(msg, coalesced, sealTurn);
  }

  if (
    (thisTurnExplore || priorExplore) &&
    coalesced.length < 120 &&
    !looksLikeSubstantialFindings(coalesced)
  ) {
    return foldTextIntoThought(msg, coalesced, sealTurn);
  }

  return {
    ...msg,
    openingLead: undefined,
    content: '',
    turnProse: pushProse(msg.turnProse || [], sealTurn, coalesced)
  };
}

/** Prefer explicit turn; else max turn already on steps (agent loop). */
export function resolveSealTurn(
  msg: ChatMessage,
  explicit?: number | null
): number {
  if (explicit != null && Number.isFinite(explicit) && explicit > 0) {
    return Math.floor(explicit);
  }
  let max = 0;
  for (const s of msg.steps || []) {
    const t = s.turn;
    if (typeof t === 'number' && t > max) max = t;
  }
  return Math.max(1, max);
}
