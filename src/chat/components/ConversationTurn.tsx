import React from 'react';
import { MessageBubble } from './MessageBubble';
import { AgentTurnAdapter } from '../conversation/agentTurnAdapter';
import { normalizeWorkItems, type ConversationWorkEvent } from '../conversation/normalizeWorkItems';
import { normalizeChangeSummary, type ConversationFileEdit } from '../conversation/normalizeChangeSummary';

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
 * Conversation boundary. Agent presentation is introduced without taking
 * ownership of streaming/message state from MessageBubble.
 */
export function ConversationTurn(props: ConversationTurnProps) {
  const { message, isStreaming, onOpenFile } = props;
  const streaming = !!isStreaming || message?.status === 'streaming';
  const isAssistant = message?.role === 'assistant';
  const workEvents = Array.isArray(message?.workItems)
    ? message.workItems as ConversationWorkEvent[]
    : Array.isArray(message?.steps)
      ? message.steps as ConversationWorkEvent[]
      : [];
  const fileEdits = Array.isArray(message?.fileEdits)
    ? message.fileEdits as ConversationFileEdit[]
    : [];
  const workItems = normalizeWorkItems(workEvents);
  const changes = normalizeChangeSummary(fileEdits);

  const response = <MessageBubble {...props} />;

  return (
    <section
      className="conversation-turn"
      data-role={message?.role}
      data-turn-id={message?.id}
      data-streaming={streaming ? 'true' : undefined}
    >
      {isAssistant ? (
        <AgentTurnAdapter
          message={message}
          workItems={workItems}
          changes={changes}
          onOpenFile={onOpenFile}
        >
          {response}
        </AgentTurnAdapter>
      ) : response}
    </section>
  );
}
