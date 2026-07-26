/**
 * When tools start again, preserve mid-turn assistant prose into turnProse
 * instead of wiping it (which caused flicker: appear then vanish).
 */
import type { ChatMessage } from './types';
import { splitStreamingLead } from './openingLead';

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

/**
 * Seal body text before the next tool batch.
 * - First tools: short ack → openingLead (existing Cursor lead behavior)
 * - Later tools: full body → turnProse after the previous turn
 */
export function sealBodyBeforeTools(
  msg: ChatMessage,
  currentTurn: number
): ChatMessage {
  const body = (msg.content || '').trim();
  if (!body) {
    return { ...msg, content: '' };
  }

  if (hasToolSteps(msg)) {
    const sealTurn = Math.max(1, (currentTurn || 1) - 1);
    const prev = msg.turnProse || [];
    // Avoid duplicate seal of the same text
    const last = prev[prev.length - 1];
    if (last && last.content.trim() === body) {
      return { ...msg, content: '' };
    }
    return {
      ...msg,
      content: '',
      turnProse: [
        ...prev,
        {
          id: `prose_${sealTurn}_${Date.now()}`,
          turn: sealTurn,
          content: body
        }
      ]
    };
  }

  // First tool round: keep a short model ack above the timeline
  const combined = `${msg.openingLead || ''}${body}`.trim();
  const { lead } = splitStreamingLead(combined);
  return {
    ...msg,
    openingLead: lead || msg.openingLead || undefined,
    content: ''
  };
}
