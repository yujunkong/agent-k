/**
 * When tools start again, preserve mid-turn assistant prose.
 *
 * - Dig bridge / visible mid ack → turnProse (outside Exploring chrome)
 * - Anchor with afterStepId so MessageSteps can cut Exploring between batches
 * - Long mid-dig self-talk while Exploring → Thought only
 */
import type { ChatMessage } from './types';
import { looksLikeVisibleTurnProse } from './planPromote';
import { looksLikeVisibleMidReply } from './exploreProseHints';

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

/** Edit / Command — also valid Exploring cut anchors */
const ACTION_KINDS = new Set(['editing', 'running']);

export function hasToolSteps(msg: ChatMessage): boolean {
  return (msg.steps || []).some((s) => TOOL_KINDS.has(s.kind));
}

/** Last explore/edit/shell step on this turn — prose seals after it. */
export function lastBoundaryStepId(
  msg: ChatMessage,
  turn: number
): string | undefined {
  const steps = msg.steps || [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if ((s.turn ?? 1) !== turn) continue;
    if (EXPLORE_KINDS.has(s.kind) || ACTION_KINDS.has(s.kind)) {
      return s.id;
    }
  }
  return undefined;
}

function pushProse(
  prev: NonNullable<ChatMessage['turnProse']>,
  turn: number,
  content: string,
  afterStepId?: string
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
      content: text,
      // Comment: MessageSteps flushes this note after the anchored step (Exploring cut).
      ...(afterStepId ? { afterStepId } : {})
    }
  ];
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

/**
 * Seal body before tools:
 * - Dig bridge / visible mid ack → turnProse (Cursor: outside Exploring chrome)
 * - afterStepId anchors cut at last Read/Edit/Command (no top hoist)
 * - Long mid-dig self-talk while Exploring → Thought only
 */
export function sealBodyBeforeTools(
  msg: ChatMessage,
  currentTurn: number
): ChatMessage {
  const body = (msg.content || '').trim();
  const rawLead = (msg.openingLead || '').trim();
  const coalesced = coalesceLeadBody(rawLead, body);

  if (!coalesced) {
    return { ...msg, openingLead: undefined, content: '' };
  }

  const sealTurn = Math.max(1, currentTurn || 1);
  const anchor = lastBoundaryStepId(msg, sealTurn);

  // Keep visible mid replies (and plan docs) out of collapsed Thought.
  // First seal before any tool: still turnProse, but without afterStepId —
  // MessageSteps places it chronologically before the first explore batch
  // (not a special "lift to absolute top" path).
  if (
    looksLikeVisibleTurnProse(coalesced) ||
    looksLikeVisibleMidReply(coalesced) ||
    !hasExploreToolsThisTurn(msg, sealTurn)
  ) {
    return {
      ...msg,
      openingLead: undefined,
      content: '',
      turnProse: pushProse(msg.turnProse || [], sealTurn, coalesced, anchor)
    };
  }

  return foldTextIntoThought(msg, coalesced, sealTurn);
}

/** Where mid-turn bubble text went during seal — for timeline-order diagnostics. */
export type MidReplySealDest = 'empty' | 'turnProse' | 'thought' | 'cleared-no-source';

export function summarizeMidReplySeal(
  before: ChatMessage,
  after: ChatMessage
): {
  dest: MidReplySealDest;
  contentLenBefore: number;
  contentLenAfter: number;
  leadLenBefore: number;
  turnProseBefore: number;
  turnProseAfter: number;
  /** First ~80 chars of what left the answer bubble */
  sealedPreview: string;
  /** Last turnProse entry preview (if dest=turnProse) */
  lastProsePreview?: string;
  thoughtDetailLen?: number;
} {
  const contentBefore = String(before.content || '').trim();
  const leadBefore = String(before.openingLead || '').trim();
  const coalesced = coalesceLeadBody(leadBefore, contentBefore);
  const proseBefore = before.turnProse?.length ?? 0;
  const proseAfter = after.turnProse?.length ?? 0;
  const contentAfter = String(after.content || '').trim();

  const preview = coalesced.slice(0, 80);
  if (!coalesced) {
    return {
      dest: 'cleared-no-source',
      contentLenBefore: contentBefore.length,
      contentLenAfter: contentAfter.length,
      leadLenBefore: leadBefore.length,
      turnProseBefore: proseBefore,
      turnProseAfter: proseAfter,
      sealedPreview: ''
    };
  }

  if (proseAfter > proseBefore) {
    const last = after.turnProse?.[after.turnProse.length - 1];
    return {
      dest: 'turnProse',
      contentLenBefore: contentBefore.length,
      contentLenAfter: contentAfter.length,
      leadLenBefore: leadBefore.length,
      turnProseBefore: proseBefore,
      turnProseAfter: proseAfter,
      sealedPreview: preview,
      lastProsePreview: String(last?.content || '')
        .trim()
        .slice(0, 80)
    };
  }

  const beforeThought = (before.steps || [])
    .filter((s) => s.kind === 'thinking')
    .map((s) => String(s.detail || '').length)
    .reduce((a, b) => a + b, 0);
  const afterThought = (after.steps || [])
    .filter((s) => s.kind === 'thinking')
    .map((s) => String(s.detail || '').length)
    .reduce((a, b) => a + b, 0);

  if (afterThought > beforeThought || contentAfter.length < contentBefore.length) {
    return {
      dest: afterThought > beforeThought ? 'thought' : 'empty',
      contentLenBefore: contentBefore.length,
      contentLenAfter: contentAfter.length,
      leadLenBefore: leadBefore.length,
      turnProseBefore: proseBefore,
      turnProseAfter: proseAfter,
      sealedPreview: preview,
      thoughtDetailLen: afterThought
    };
  }

  return {
    dest: contentAfter ? 'empty' : 'empty',
    contentLenBefore: contentBefore.length,
    contentLenAfter: contentAfter.length,
    leadLenBefore: leadBefore.length,
    turnProseBefore: proseBefore,
    turnProseAfter: proseAfter,
    sealedPreview: preview
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
