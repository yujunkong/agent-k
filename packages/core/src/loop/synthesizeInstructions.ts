/**
 * AGENT-019 — synthesizeInstructions helper.
 * Rebuilds a continuation prompt after interrupt / queue resynthesize.
 */

import type { AgentMessage } from '../types';

export interface SynthesizeInput {
  /** New user message that interrupted the previous run. */
  newUserMessage: string;
  messages: AgentMessage[];
  interruptedAssistantContent?: string;
  originalUserMessage?: string;
  lastToolResults?: string[];
  turnNumber: number;
  mode: string;
}

/** Format a system-note + merged instruction for the next model turn. */
export function synthesizeInstructions(input: SynthesizeInput): string {
  const parts: string[] = [];

  parts.push('<system_note type="interrupt_resynthesize">');
  parts.push(
    `The previous response was interrupted after turn ${input.turnNumber} (mode=${input.mode}) because the user sent a new message.`
  );
  parts.push(
    'Synthesize BOTH: (1) the original in-progress request and any partial work, and (2) the new user instruction below.'
  );
  parts.push('Do not ignore the original request. Merge intents into one coherent continuation.');
  parts.push('');

  if (input.originalUserMessage?.trim()) {
    parts.push('Original user request (still in progress):');
    parts.push(input.originalUserMessage.trim().slice(0, 4000));
    parts.push('');
  }

  if (input.interruptedAssistantContent?.trim()) {
    parts.push(
      'Previous assistant response (interrupted — use as context, do not repeat verbatim):'
    );
    parts.push(input.interruptedAssistantContent.trim().slice(0, 4000));
    parts.push('');
  } else {
    parts.push('Previous assistant response: (none yet — interrupted before a reply).');
    parts.push('');
  }

  if (input.lastToolResults && input.lastToolResults.length > 0) {
    parts.push('Completed tool results from previous turn:');
    parts.push(input.lastToolResults.join('\n').slice(0, 8000));
    parts.push('');
  }

  parts.push('</system_note>');
  parts.push('');
  parts.push('Now, continuing in context of the above, please address this new input:');
  parts.push(input.newUserMessage);

  return parts.join('\n');
}

/**
 * Drop a trailing interrupted assistant message and return a synthesis user message.
 */
export function buildResynthesizeMessages(
  messages: AgentMessage[],
  newUserMessage: string,
  turnNumber: number,
  mode: string
): AgentMessage[] {
  const copy = [...messages];
  let interruptedAssistant = '';
  if (copy.length && copy[copy.length - 1]?.role === 'assistant') {
    interruptedAssistant = copy.pop()!.content || '';
  }

  let originalUser = '';
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i]!.role === 'user') {
      originalUser = copy[i]!.content || '';
      break;
    }
  }

  const lastToolResults = copy
    .filter((m) => m.role === 'tool')
    .slice(-5)
    .map((m) => `[${m.name ?? 'tool'}] ${(m.content || '').slice(0, 500)}`);

  const synthesized = synthesizeInstructions({
    newUserMessage,
    messages: copy,
    interruptedAssistantContent: interruptedAssistant,
    originalUserMessage: originalUser,
    lastToolResults,
    turnNumber,
    mode,
  });

  return [...copy, { role: 'user', content: synthesized }];
}
