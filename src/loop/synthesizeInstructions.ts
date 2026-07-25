/**
 * synthesizeInstructions - Resynthesize 명령어 포맷 (C3-T31)
 * 
 * Interrupt 발생 시 시스템 노트 + 이전 상태 요약 주입
 */
import type { AgentMessage } from './AgentLoopController';

export interface SynthesizeInput {
  interruptedMessage: string;
  conversationSoFar: AgentMessage[];
  lastToolResults: string[];
  turnNumber: number;
  mode: string;
}

export function synthesizeInstructions(input: SynthesizeInput): string {
  const { interruptedMessage, conversationSoFar, lastToolResults, turnNumber, mode } = input;

  const parts: string[] = [];

  // System note
  parts.push('<system_note type="interrupt_resynthesize">');

  // Reason for interruption
  parts.push(`The previous response was interrupted after turn ${turnNumber} because the user sent a new message.`);
  parts.push('Your task is to synthesize the previous context with the new instruction.');
  parts.push('');

  // Previous state summary
  const lastAssistantMsg = conversationSoFar.filter(m => m.role === 'assistant').slice(-1)[0];
  if (lastAssistantMsg) {
    parts.push('Previous response (interrupted):');
    parts.push(lastAssistantMsg.content.slice(0, 2000));
    parts.push('');
  }

  // Tool results
  if (lastToolResults.length > 0) {
    parts.push('Completed tool results from previous turn:');
    parts.push(lastToolResults.join('\n'));
    parts.push('');
  }

  // Synthesis instruction
  parts.push(`</system_note>`);
  parts.push('');
  parts.push('Now, continuing in context of the above, please address this new input:');
  parts.push(interruptedMessage);

  return parts.join('\n');
}

/**
 * synthesizeInstructions 포맷으로 이전 메시지 재구성
 * interrupted 시스템 노트를 주입한 새 messages 배열 반환
 */
export function buildResynthesizeMessages(
  messages: AgentMessage[],
  newUserMessage: string,
  turnNumber: number,
  mode: string
): AgentMessage[] {
  // Remove last assistant message (was interrupted)
  const filtered = messages.filter(m => !(m.role === 'assistant' && m === messages[messages.length - 1] && messages[messages.length - 1]?.role === 'assistant'));

  // Get last tool results
  const lastToolResults = filtered
    .filter(m => m.role === 'tool')
    .slice(-3)
    .map(m => `${m.name}: ${m.content.slice(0, 500)}`);

  // Build synthesis
  const synthesis = synthesizeInstructions({
    interruptedMessage: newUserMessage,
    conversationSoFar: filtered,
    lastToolResults,
    turnNumber,
    mode
  });

  return [
    ...filtered,
    { role: 'user', content: synthesis }
  ];
}
