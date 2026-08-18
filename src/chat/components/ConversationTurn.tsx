import React from 'react';
import { MessageBubble } from './MessageBubble';

export interface ConversationTurnProps {
  message: any;
  isStreaming?: boolean;
  isAgentRunning?: boolean;
  isLastUser?: boolean;
  isLastAssistant?: boolean;
  onEdit?: (id: string, content: string) => void;
  onFork?: (id: string) => void;
  onCopy?: (content: string) => void;
  onStopAndPrefill?: (content: string) => void;
  onOpenFile?: (path: string) => void;
  onContinueMission?: () => void;
  onRegenerate?: () => void;
}

/**
 * Phase-1 conversation boundary.
 * Delegates to the proven MessageBubble so streaming and agent behavior stay
 * unchanged while presentation is migrated incrementally.
 */
export function ConversationTurn(props: ConversationTurnProps) {
  const { message, isStreaming } = props;
  const streaming = !!isStreaming || message?.status === 'streaming';

  return (
    <section
      className="conversation-turn"
      data-role={message?.role}
      data-turn-id={message?.id}
      data-streaming={streaming ? 'true' : undefined}
    >
      <MessageBubble {...props} />
    </section>
  );
}
