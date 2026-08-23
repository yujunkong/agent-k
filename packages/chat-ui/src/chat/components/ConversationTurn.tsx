import React from 'react';
import { MessageBubble } from './MessageBubble';
import { AgentTurnAdapter } from '../conversation/agentTurnAdapter';
import type { Attachment, FileEditPreview } from '../types';
import type { ComposerChromeProps } from './Composer';
import { getVariantMeta, useActiveVariant } from '../conversation/conversationVariants';
import { normalizeWorkItems } from '../conversation/normalizeWorkItems';
import {
  workEventsFromLegacySteps,
  type ConversationWorkEvent
} from '../conversation/conversationWorkEvent';

export interface ConversationTurnProps {
  message: any;
  isStreaming?: boolean;
  isAgentRunning?: boolean;
  isLastUser?: boolean;
  isLastAssistant?: boolean;
  onEdit?: (id: string, content: string, files?: Attachment[]) => void;
  onFork?: (id: string) => void;
  onCopy?: (content: string) => void;
  onStopAndPrefill?: (content: string) => void;
  onOpenSubagent?: (subagentId: string, title: string) => void;
  getSubagentRolling?: (subagentId: string) => string | undefined;
  onOpenFile?: (path: string) => void;
  onAcceptFile?: (file: FileEditPreview) => void;
  onRejectFile?: (file: FileEditPreview) => void;
  onWorktreeReview?: (subagentId: string) => void;
  onWorktreeApply?: (subagentId: string) => void;
  onWorktreeReject?: (subagentId: string) => void;
  onContinueMission?: () => void;
  /** Controlled inline edit (one at a time) */
  isEditing?: boolean;
  onBeginEdit?: (id: string) => void;
  onCancelEdit?: () => void;
  editSeedNonce?: number;
  composerChrome?: ComposerChromeProps;
  /**
   * SUB-010 — subagent detail: user prompt is expand-to-read only
   * (no copy / edit / stop chrome).
   */
  userPromptMode?: 'default' | 'expand-only';
}

/**
 * Conversation boundary.
 * Legacy sibling variants (if any in stored history) still hide inactive
 * assistants. Re-run is via user pencil (Save & Run), not a ↻ footer control.
 */
export function ConversationTurn(props: ConversationTurnProps) {
  const {
    message,
    isStreaming,
    onOpenSubagent,
    getSubagentRolling,
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

  if (!isActiveVariant) return null;

  const response = <MessageBubble {...props} userPromptMode={props.userPromptMode} />;

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
          isStreaming={streaming}
          onOpenSubagent={onOpenSubagent}
          getSubagentRolling={getSubagentRolling}
          onOpenFile={onOpenFile}
          onAcceptFile={onAcceptFile}
          onRejectFile={onRejectFile}
          onWorktreeReview={onWorktreeReview}
          onWorktreeApply={onWorktreeApply}
          onWorktreeReject={onWorktreeReject}
        >
          {response}
        </AgentTurnAdapter>
      ) : (
        response
      )}
    </section>
  );
}
