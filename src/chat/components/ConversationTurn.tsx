import React from 'react';
import { MessageBubble } from './MessageBubble';
import { AgentTurnAdapter } from '../conversation/agentTurnAdapter';
import type { ChangeSummaryItem } from './ChangeSummary';
import type { FileEditPreview } from '../types';
import { getVariantMeta, setActiveVariant, useActiveVariant } from '../conversation/conversationVariants';
import { normalizeWorkItems } from '../conversation/normalizeWorkItems';
import {
  workEventsFromLegacySteps,
  type ConversationWorkEvent
} from '../conversation/conversationWorkEvent';
import './conversation-variants.css';

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
  onOpenSubagent?: (subagentId: string, title: string) => void;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onWorktreeReview?: (subagentId: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
  onContinueMission?: () => void;
  onRegenerate?: () => void;
}

/** Conversation boundary + Cursor-style sibling assistant variants. */
export function ConversationTurn(props: ConversationTurnProps) {
  const {
    message,
    isStreaming,
    onOpenSubagent,
    onOpenFile,
    onAcceptFile,
    onRejectFile,
    onWorktreeReview,
    onWorktreeApply,
    onWorktreeReject
  } = props;
  const streaming = !!isStreaming || message?.status === 'streaming';
  const isAssistant = message?.role === 'assistant';
  const variantMeta = isAssistant ? getVariantMeta(message) : null;
  const activeVariant = useActiveVariant(variantMeta?.groupId ?? '');
  const isActiveVariant = !variantMeta || variantMeta.index === activeVariant;

  const workEvents: ConversationWorkEvent[] =
    Array.isArray(message?.workItems) && message.workItems.length
      ? (message.workItems as ConversationWorkEvent[])
      : workEventsFromLegacySteps(message?.steps);
  const workItems = normalizeWorkItems(workEvents);
  // UI policy: show changed files only in the pinned bottom ChangedFilesBar.
  // (Avoid duplicate per-turn ChangeSummary chips that confuse users.)
  const changes: ChangeSummaryItem[] = [];

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
          isStreaming={streaming}
          onOpenSubagent={onOpenSubagent}
          onOpenFile={onOpenFile}
          onAcceptFile={onAcceptFile}
          onRejectFile={onRejectFile}
          onWorktreeReview={onWorktreeReview}
          onWorktreeApply={onWorktreeApply}
          onWorktreeReject={onWorktreeReject}
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
