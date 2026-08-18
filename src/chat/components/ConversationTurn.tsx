import React from 'react';
import { MessageBubble } from './MessageBubble';
import { AgentTurnAdapter } from '../conversation/agentTurnAdapter';
import { getVariantMeta, setActiveVariant, useActiveVariant } from '../conversation/conversationVariants';
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

/** Conversation boundary + Cursor-style sibling assistant variants. */
export function ConversationTurn(props: ConversationTurnProps) {
  const { message, isStreaming, onOpenFile } = props;
  const streaming = !!isStreaming || message?.status === 'streaming';
  const isAssistant = message?.role === 'assistant';
  const variantMeta = isAssistant ? getVariantMeta(message) : null;
  const activeVariant = variantMeta ? useActiveVariant(variantMeta.groupId) : 0;
  const isActiveVariant = !variantMeta || variantMeta.index === activeVariant;

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

  if (!isActiveVariant) return null;

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

      {variantMeta && variantMeta.count > 1 && (
        <div className="conversation-variants" role="group" aria-label="Assistant response variants">
          <button
            type="button"
            className="conversation-variants__nav"
            aria-label="Previous response variant"
            disabled={variantMeta.index <= 0}
            onClick={() => setActiveVariant(variantMeta.groupId, variantMeta.index - 1)}
          >
            ‹
          </button>
          <span className="conversation-variants__count" aria-live="polite">
            {variantMeta.index + 1} / {variantMeta.count}
          </span>
          <button
            type="button"
            className="conversation-variants__nav"
            aria-label="Next response variant"
            disabled={variantMeta.index >= variantMeta.count - 1}
            onClick={() => setActiveVariant(variantMeta.groupId, variantMeta.index + 1)}
          >
            ›
          </button>
        </div>
      )}
    </section>
  );
}
