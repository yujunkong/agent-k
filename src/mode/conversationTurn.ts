import type { ConversationTurn, Mode, ModeDecision } from './types';

const TOOL_KINDS = new Set([
  'searching',
  'reading',
  'editing',
  'running',
  'browsing',
  'asking'
]);

export interface ConversationTurnMessage {
  id: string;
  role: string;
  content?: string;
  timestamp?: number;
  metadata?: {
    mode?: Mode;
    modeDecision?: ModeDecision;
  };
  toolCalls?: unknown[];
  steps?: Array<{ kind?: string }>;
  fileEdits?: unknown[];
  terminalRuns?: unknown[];
}

export function messageHadToolCalls(
  message: ConversationTurnMessage | undefined
): boolean {
  if (!message) return false;
  if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
    return true;
  }
  if (Array.isArray(message.fileEdits) && message.fileEdits.length > 0) {
    return true;
  }
  if (Array.isArray(message.terminalRuns) && message.terminalRuns.length > 0) {
    return true;
  }
  return Boolean(
    message.steps?.some((s) => s.kind && TOOL_KINDS.has(s.kind))
  );
}

/** Latest completed user turn (user + the assistant that followed, if any). */
export function lastConversationTurn(
  messages: ReadonlyArray<ConversationTurnMessage>
): ConversationTurn | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue;
    const user = messages[i];
    const assistant = messages
      .slice(i + 1)
      .find((m) => m.role === 'assistant');
    return {
      id: user.id,
      mode: user.metadata?.mode ?? assistant?.metadata?.mode ?? 'agent',
      userMessage: user.content || '',
      hadToolCalls: messageHadToolCalls(assistant),
      modeDecision: user.metadata?.modeDecision,
      timestamp: user.timestamp || 0
    };
  }
  return null;
}
