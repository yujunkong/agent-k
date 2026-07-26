/**
 * When tools start again, preserve mid-turn assistant prose into turnProse
 * instead of wiping it (which caused flicker: appear then vanish).
 *
 * Prose is attached to the *agent loop turn* so it renders after Thought and
 * before Exploring/tools — matching stream order (think → say → tool).
 */
import type { ChatMessage } from './types';

const TOOL_KINDS = new Set([
  'searching',
  'reading',
  'editing',
  'running',
  'browsing',
  'asking'
]);

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

/**
 * Seal body (+ any leftover openingLead) into turnProse for the agent loop turn.
 * Clears openingLead — mid-timeline prose after Thought is the single display path.
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

  // Same agent-loop turn as Thought → MessageSteps: Thought → prose → tools
  const sealTurn = Math.max(1, currentTurn || 1);

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
