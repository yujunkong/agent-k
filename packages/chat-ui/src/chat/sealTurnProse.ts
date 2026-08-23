/**
 * When tools start again, preserve mid-turn assistant **content** as turnProse.
 *
 * Contract (language-agnostic — no NLP / conjugation / script heuristics):
 * - `content` / `openingLead` → always `turnProse` (visible mid-reply)
 * - Thought detail grows only from `reasoning` stream — never from content seal
 * - Anchor with afterStepId so MessageSteps can cut Exploring between batches
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

export type SealBodyBeforeToolsOpts = {
  /** @deprecated No-op — content is always sealed to turnProse (structural). */
  forceVisible?: boolean;
};

/**
 * Seal assistant content before tools.
 * Always turnProse — never fold content into Thought (that belongs to reasoning).
 */
export function sealBodyBeforeTools(
  msg: ChatMessage,
  currentTurn: number,
  _opts: SealBodyBeforeToolsOpts = {}
): ChatMessage {
  const body = (msg.content || '').trim();
  const rawLead = (msg.openingLead || '').trim();
  const coalesced = coalesceLeadBody(rawLead, body);

  if (!coalesced) {
    return { ...msg, openingLead: undefined, content: '' };
  }

  const sealTurn = Math.max(1, currentTurn || 1);
  const anchor = lastBoundaryStepId(msg, sealTurn);

  return {
    ...msg,
    openingLead: undefined,
    content: '',
    turnProse: pushProse(msg.turnProse || [], sealTurn, coalesced, anchor)
  };
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
  sealedPreview: string;
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
    dest: 'empty',
    contentLenBefore: contentBefore.length,
    contentLenAfter: contentAfter.length,
    leadLenBefore: leadBefore.length,
    turnProseBefore: proseBefore,
    turnProseAfter: proseAfter,
    sealedPreview: preview
  };
}

export function resolveSealTurn(
  msg: ChatMessage,
  explicit?: number | null
): number {
  if (explicit != null && Number.isFinite(Number(explicit)) && Number(explicit) > 0) {
    return Number(explicit);
  }
  const steps = msg.steps || [];
  let max = 1;
  for (const s of steps) {
    const t = s.turn ?? 1;
    if (t > max) max = t;
  }
  return max;
}
