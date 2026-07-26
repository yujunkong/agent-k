/**
 * synthesizeInstructions - Resynthesize 명령어 포맷 (C3-T31)
 *
 * Interrupt 발생 시 시스템 노트 + 이전 상태 요약 주입
 */
import type { AgentMessage } from './AgentLoopController';

export interface SynthesizeInput {
  interruptedMessage: string;
  conversationSoFar: AgentMessage[];
  /** Partial assistant reply that was aborted (may be empty) */
  interruptedAssistantContent?: string;
  /** Last user turn that was in progress when interrupted */
  originalUserMessage?: string;
  lastToolResults: string[];
  turnNumber: number;
  mode: string;
}

export function synthesizeInstructions(input: SynthesizeInput): string {
  const {
    interruptedMessage,
    interruptedAssistantContent,
    originalUserMessage,
    lastToolResults,
    turnNumber,
    mode
  } = input;

  const parts: string[] = [];

  parts.push('<system_note type="interrupt_resynthesize">');
  parts.push(
    `The previous response was interrupted after turn ${turnNumber} (mode=${mode}) because the user sent a new message.`
  );
  parts.push(
    'Synthesize BOTH: (1) the original in-progress request and any partial work, and (2) the new user instruction below.'
  );
  parts.push('Do not ignore the original request. Merge intents into one coherent continuation.');
  parts.push('');

  if (originalUserMessage?.trim()) {
    parts.push('Original user request (still in progress):');
    parts.push(originalUserMessage.trim().slice(0, 4000));
    parts.push('');
  }

  if (interruptedAssistantContent?.trim()) {
    parts.push('Previous assistant response (interrupted — use as context, do not repeat verbatim):');
    parts.push(interruptedAssistantContent.trim().slice(0, 4000));
    parts.push('');
  } else {
    parts.push('Previous assistant response: (none yet — interrupted before a reply).');
    parts.push('');
  }

  if (lastToolResults.length > 0) {
    parts.push('Completed tool results from previous turn:');
    parts.push(lastToolResults.join('\n'));
    parts.push('');
  }

  parts.push('</system_note>');
  parts.push('');
  parts.push('Now, continuing in context of the above, please address this new input:');
  parts.push(interruptedMessage);

  return parts.join('\n');
}

/**
 * Build synthesis user content from history + new instruction.
 * Drops the trailing interrupted assistant from the returned array
 * (caller may still keep a UI copy); synthesis text embeds that content.
 */
export function buildResynthesizeMessages(
  messages: AgentMessage[],
  newUserMessage: string,
  turnNumber: number,
  mode: string
): AgentMessage[] {
  const last = messages[messages.length - 1];
  const interruptedAssistant = last?.role === 'assistant' ? last : undefined;
  const withoutInterrupted = interruptedAssistant
    ? messages.slice(0, -1)
    : [...messages];

  const lastUser = [...withoutInterrupted]
    .reverse()
    .find((m) => m.role === 'user');

  const lastToolResults = withoutInterrupted
    .filter((m) => m.role === 'tool')
    .slice(-5)
    .map((m) => `${m.name || 'tool'}: ${String(m.content || '').slice(0, 500)}`);

  const synthesis = synthesizeInstructions({
    interruptedMessage: newUserMessage,
    conversationSoFar: withoutInterrupted,
    interruptedAssistantContent: interruptedAssistant?.content || '',
    originalUserMessage: lastUser?.content || '',
    lastToolResults,
    turnNumber,
    mode
  });

  return [...withoutInterrupted, { role: 'user', content: synthesis }];
}

/**
 * UI 표시용: interrupt/resynth 래퍼를 제거하고 사용자 입력만 남김.
 */
export function stripResynthForDisplay(content: string): string {
  if (!content) return content;

  const footer = /please address this new input:\s*/i;
  const footerMatch = content.match(footer);
  if (footerMatch && footerMatch.index != null) {
    const after = content.slice(footerMatch.index + footerMatch[0].length).trim();
    if (after) return after;
  }

  if (/<system_note\s+type=["']?interrupt_resynthesize["']?/i.test(content)) {
    return content
      .replace(/<system_note\s+type=["']?interrupt_resynthesize["']?[^>]*>[\s\S]*?<\/system_note>\s*/gi, '')
      .replace(/^Now,?\s+continuing in context of the above,?\s*/im, '')
      .trim();
  }

  return content;
}
