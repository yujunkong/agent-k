/**
 * When tools start again, preserve mid-turn assistant prose.
 *
 * - First seal of a dig (no explore tools yet this turn) → visible turnProse lead
 * - Later seals while Exploring already has tools → fold into Thought (self-talk)
 */
import type { ChatMessage } from './types';
import { looksLikeVisibleTurnProse } from './planPromote';

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
 * - No explore tools yet this turn → visible lead (turnProse)
 * - Already exploring this turn → Thought (mid-dig self-talk)
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

  // Plan (re)drafts must stay in the bubble — not vanish into collapsed Thought
  // just because search tools follow in the same turn.
  if (
    looksLikeVisibleTurnProse(coalesced) ||
    !hasExploreToolsThisTurn(msg, sealTurn)
  ) {
    return {
      ...msg,
      openingLead: undefined,
      content: '',
      turnProse: pushProse(msg.turnProse || [], sealTurn, coalesced)
    };
  }

  return foldTextIntoThought(msg, coalesced, sealTurn);
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
